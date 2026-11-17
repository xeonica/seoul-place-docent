#!/usr/bin/env python3
"""Resumable, URL-only National Archives RITEM collector. Python stdlib only."""
import argparse, csv, hashlib, json, os, pathlib, re, sys, time
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

ENDPOINT = "https://apis.data.go.kr/1741050/openapi/searcharc"
FIELDS = ["provider","record_id","record_type","title","production_year","producer","source_url","query","collected_at","verification"]
def now(): return datetime.now(timezone.utc).isoformat()
def canonical(url):
    try:
        p=urlsplit(url.strip())
        if p.scheme not in ("http","https") or not p.hostname or p.username or p.password: return ""
        if p.hostname not in ("archives.go.kr",) and not p.hostname.endswith(".archives.go.kr"): return ""
        q=[(k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not k.lower().startswith(("utm_","fbclid","gclid"))]
        return urlunsplit(("https",p.netloc.lower(),p.path.rstrip("/") or "/",urlencode(sorted(q)),""))
    except ValueError: return ""
def get(node,tag):
    for e in node.iter():
        if e.tag.rsplit("}",1)[-1].lower()==tag.lower(): return (e.text or "").strip()
    return ""
def parse_xml(raw):
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper(): raise ValueError("DTD/entity XML not accepted")
    root=ET.fromstring(raw)
    channel=next((x for x in root.iter() if x.tag.rsplit("}",1)[-1].lower()=="channel"),None)
    if channel is None or not get(channel,"total").isdigit(): raise ValueError("Invalid provider response / key / quota")
    items=[x for x in channel.iter() if x.tag.rsplit("}",1)[-1].lower()=="item"]
    return int(get(channel,"total")),items
def fetch(key,query,page,timeout=25):
    params=urlencode({"serviceKey":key,"query":query,"pageNo":page,"display":10})
    req=Request(ENDPOINT+"?"+params,headers={"User-Agent":"SeoulPlaceDocent-Research/1.0"})
    with urlopen(req,timeout=timeout) as resp:
        return parse_xml(resp.read(3_000_000))
def write_json_atomic(path,obj):
    tmp=path.with_suffix(path.suffix+".tmp")
    tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    tmp.replace(path)
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--queries",default="research-data/collector/queries.txt")
    p.add_argument("--out",default="research-data/collector")
    p.add_argument("--max-requests",type=int,default=50)
    p.add_argument("--daily-request-cap",type=int,default=900)
    p.add_argument("--delay",type=float,default=1.5)
    p.add_argument("--max-retries",type=int,default=3)
    args=p.parse_args()
    if args.max_requests<1 or args.daily_request_cap<1 or args.delay<0 or args.max_retries<1: p.error("invalid limits")
    key=os.getenv("NATIONAL_ARCHIVES_API_KEY","")
    if not key: p.error("NATIONAL_ARCHIVES_API_KEY environment variable required")
    out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
    queries=[q.strip() for q in pathlib.Path(args.queries).read_text(encoding="utf-8-sig").splitlines() if q.strip() and not q.lstrip().startswith("#")]
    queries=list(dict.fromkeys(q for q in queries if 2<=len(q)<=80))
    if not queries: p.error("No valid queries")
    digest=hashlib.sha256("\n".join(queries).encode()).hexdigest()
    statefile=out/"state.json"; csvfile=out/"records.csv"
    state=json.loads(statefile.read_text(encoding="utf-8")) if statefile.exists() else {"query_hash":digest,"query_index":0,"page":1,"requests_by_day":{},"stats":{"new":0,"duplicates":0,"skipped":0,"errors":0}}
    if state["query_hash"]!=digest: p.error("queries changed: use a new --out directory to avoid skipping work")
    seen=set()
    if csvfile.exists():
        with csvfile.open(encoding="utf-8",newline="") as f:
            for r in csv.DictReader(f): seen.add((r["provider"],r["record_id"]))
    with csvfile.open("a",encoding="utf-8",newline="") as f:
        writer=csv.DictWriter(f,fieldnames=FIELDS)
        if f.tell()==0: writer.writeheader();f.flush();os.fsync(f.fileno())
        executed=0
        while state["query_index"]<len(queries) and executed<args.max_requests:
            day=datetime.now(timezone.utc).strftime("%Y-%m-%d")
            if state["requests_by_day"].get(day,0)>=args.daily_request_cap:
                print("Daily request cap reached (UTC); resume later");break
            query=queries[state["query_index"]];page=state["page"]
            # Count attempted requests (including errors) conservatively.
            state["requests_by_day"][day]=state["requests_by_day"].get(day,0)+1
            write_json_atomic(statefile,state)
            executed+=1
            try:
                total,items=None,None
                for retry in range(args.max_retries):
                    try: total,items=fetch(key,query,page);break
                    except Exception:
                        if retry+1==args.max_retries: raise
                        time.sleep(min(30,2**retry*args.delay))
                if items is None: raise RuntimeError("Empty response")
                for item in items:
                    if get(item,"rc_type").upper()!="RITEM": state["stats"]["skipped"]+=1;continue
                    record_id=":".join(get(item,k) for k in ("rc_type","rc_code","rc_rfile_no","rc_ritem_no"))
                    url=canonical(get(item,"link"))
                    if not url or not any(record_id.split(":")[1:]): state["stats"]["skipped"]+=1;continue
                    ident=("national",record_id)
                    if ident in seen: state["stats"]["duplicates"]+=1;continue
                    row=dict(provider="national",record_id=record_id,record_type="RITEM",title=get(item,"title"),production_year=get(item,"prod_year"),producer=get(item,"prod_name"),source_url=url,query=query,collected_at=now(),verification="official search metadata; content and rights unverified")
                    writer.writerow(row);f.flush();os.fsync(f.fileno());seen.add(ident);state["stats"]["new"]+=1
                if page*10>=total or not items:
                    state["query_index"]+=1;state["page"]=1
                else: state["page"]+=1
                state["last_success_at"]=now();state.pop("last_error",None)
                print(json.dumps({"query":query,"page":page,"provider_total":total,"stats":state["stats"]},ensure_ascii=False))
            except Exception as e:
                state["stats"]["errors"]+=1;state["last_error"]={"query":query,"page":page,"message":str(e)[:300],"at":now()}
                write_json_atomic(statefile,state)
                print("Stopped on error; cursor retained:",str(e)[:200],file=sys.stderr)
                return 1
            write_json_atomic(statefile,state)
            time.sleep(args.delay)
    print(json.dumps({"completed":state["query_index"]>=len(queries),"cursor":{"query_index":state["query_index"],"page":state["page"]},"stats":state["stats"]},ensure_ascii=False))
    return 0
if __name__=="__main__": sys.exit(main())
