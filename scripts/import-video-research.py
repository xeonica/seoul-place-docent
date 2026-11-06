"""Read-only XLSX import. Original workbooks stay private; generated records are reviewable.
Usage: python scripts/import-video-research.py INPUT.zip [--out ROOT]
Requires openpyxl and pypdf. Never evaluates formulas or follows external links.
"""
import argparse, hashlib, io, json, os, re, tempfile, zipfile
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, urlencode, urlunsplit
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
PRIMARY = {
 '강남구_동영상.xlsx':['전체영상_34열'], '성동구_동영상.xlsx':['성동구_전체영상'],
 '종로구_동영상(GPT).xlsx':['전체영상_34열'], '동대문구_영상.xlsx':['누적101건'],
 '동영상_광진.xlsx':['누적 조사대장'], '서울_도시역사_유튜브.xlsx':['누적링크_128건'],
 '송파구_영상.xlsx':['02_누적134+5'], '서초_영상.xlsx':['원본54열'], '중구_영상.xlsx':['전체자료_54열'],
 '중랑구_영상.xlsx':['원본54열'], '강북구.xlsx':['gangbook'], '노원구.xlsx':['nowon'],
 '도봉구.xlsx':['dobong (2)'], '서대문구_역사영상.xlsx':['전체자료54열'], '성북구_역사영상.xlsx':['03_전체54열'],
 '은평구_역사영상.xlsx':['전체영상_54열'], '강서구.xlsx':['02_전체원본54열'], '마포구.xlsx':['전체조사대장'],
 '용산구.xlsx':['영상전체54열'], '구로구.xlsx':['guro'], '양천구.xlsx':['yangcheon'], '영등포구.xlsx':['ydp'],
 '강동구_역사영상.xlsx':['누적영상_135'], '관악구_역사영상.xlsx':['01_전체원자료54열'],
 '금천구.xlsx':['누적영상150','31차추가2건'], '동작구_역사영상.xlsx':['누적 조사대장'],
}
def digest(value):
 return hashlib.sha256(value.encode('utf-8') if isinstance(value,str) else value).hexdigest()
def string(value):
 return '' if value is None else str(value)
def field(values, *names):
 return next((string(values[n]).strip() for n in names if values.get(n) is not None and string(values[n]).strip()), '')
def timecode(value):
 value=string(value).strip()
 if not re.fullmatch(r'\d{1,3}:\d{2}(?::\d{2})?',value): return None
 parts=list(map(int,value.split(':')))
 if any(n>=60 for n in parts[1:]): return None
 return sum(n*60**i for i,n in enumerate(reversed(parts)))
def identity(value):
 """Only well-formed public HTTP(S) URLs; unknown hosts are links, not dedup identities."""
 try:
  p=urlsplit(value.strip()); host=(p.hostname or '').lower(); q=parse_qs(p.query)
  if p.scheme not in ('http','https') or p.username or p.password or p.port not in (None,80,443): return None,None
  if not host or '.' not in host or host.endswith(('.local','.localhost')) or re.fullmatch(r'[\d.]+',host): return None,None
  if re.search(r'[\s<>]|\.\.\.|…', value) or any(re.search(r'token|secret|password|api.?key',k,re.I) for k in q): return None,None
  yt=None
  if host in ('youtu.be','www.youtu.be'): yt=p.path.strip('/')
  if host in ('youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'):
   yt=q.get('v',[''])[0] if p.path=='/watch' else p.path.split('/')[2] if re.match(r'^/(shorts|embed|live)/',p.path) else ''
  if yt is not None:
   return ('youtube:'+yt,'https://www.youtube.com/watch?v='+yt) if re.fullmatch(r'[\w-]{11}',yt,re.ASCII) else (None,None)
  host=host.removeprefix('www.')
  if host=='m.ktv.go.kr':host='ktv.go.kr'
  if host=='news.imbc.com':host='imnews.imbc.com'
  if host=='ktv.go.kr' and re.search(r'/content/(\d+)$',p.path):
   cid=re.search(r'/content/(\d+)$',p.path)[1];return 'ktv.go.kr:'+cid,'https://www.ktv.go.kr/content/view?content_id='+cid
  if host=='ehistory.go.kr' and p.path=='/view/ktv_view' and q.get('content_id'):
   cid=q['content_id'][0];return 'ktv.go.kr:'+cid,'https://www.ktv.go.kr/content/view?content_id='+cid
  if host=='imnews.imbc.com' and re.search(r'/article/(\d+)_\d+\.html$',p.path):
   return 'imnews.imbc.com:'+re.search(r'/article/(\d+)_',p.path)[1],urlunsplit(('https',host,p.path,'',''))
  for domain,param in [('culture.seoul.go.kr','youtubeId'),('futureheritage.seoul.go.kr','mMovieId'),('songpa.go.kr','songpatvNo'),('playvod.imbc.com','broadcastId'),('vod.kbs.co.kr','program_id')]:
   if host==domain and q.get(param):return domain+':'+q[param][0],urlunsplit(('https',p.netloc,p.path,urlencode({k:v[0] for k,v in sorted(q.items()) if k not in ('t','start','pos','page','pageIndex')}),''))
  for domain,param in [('ehistory.go.kr','mediadtl'),('ktv.go.kr','content_id'),('news.sbs.co.kr','news_id')]:
   if host==domain and q.get(param): return domain+':'+q[param][0], urlunsplit(('https',p.netloc,p.path,urlencode({k:v[0] for k,v in sorted(q.items()) if k in ('mediadtl','mediagbn','mediaid','mediasrcgbn',param)}),''))
  for domain,pattern in [('archives.seoul.go.kr',r'^/item/(\d+)/?$'),('tv.seoul.go.kr',r'^/v/([a-zA-Z0-9]+)/?$'),('gangnam.go.kr',r'^/board/(mediaarchives/\d+|broadcast01/\d+)/view.do$')]:
   m=re.match(pattern,p.path)
   if host==domain and m: return domain+':'+m[1],urlunsplit(('https',p.netloc,p.path,'',''))
  clean=urlunsplit((p.scheme,p.netloc,p.path,urlencode([(k,v) for k,vs in sorted(q.items()) for v in vs if not k.startswith('utm_') and k not in ('t','start','feature')]),''))
  return None,clean
 except ValueError: return None,None
def table(rows):
 def score(r): return sum(string(v).strip() in ('자료ID','ID','번호','영상URL','영상 제목/식별','자료명','제목','영상ID','영상 ID','출처URL','시작시각','관련구간시작') for v in r)
 if not rows: return 0,[]
 h=max(range(min(12,len(rows))), key=lambda i:score(rows[i]))
 if score(rows[h])==0: return 0,[]
 headers=[string(v).strip() or f'열{n+1}' for n,v in enumerate(rows[h])]
 # Keep duplicate column labels distinct and retain original positions.
 headers=[v if headers[:i].count(v)==0 else f'{v} [{i+1}]' for i,v in enumerate(headers)]
 return h+1,[(i+1,dict(zip(headers,row))) for i,row in enumerate(rows) if i>h and any(v is not None for v in row)]
SENSITIVE=re.compile(r'(?<!\d)01[016789][- ]?\d{3,4}[- ]?\d{4}(?!\d)|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?i:bearer\s+[a-z0-9._-]{15,}|(?:api[_-]?key|access[_-]?token|password)\s*[=:]\s*\S+)')
def sanitize(value):
 if isinstance(value,dict): return {k:sanitize(v) for k,v in value.items()}
 if isinstance(value,list): return [sanitize(v) for v in value]
 return SENSITIVE.sub('[개인정보·비밀값 비공개]',value) if isinstance(value,str) else value
def write(path,data):
 path.parent.mkdir(parents=True,exist_ok=True)
 path.write_text(json.dumps(data,ensure_ascii=False,default=str,separators=(',',':')),encoding='utf-8')
def run(source,out=ROOT):
 regions=json.loads((ROOT/'data/seoul-regions.json').read_text(encoding='utf-8'))['districts']
 districts=[d['name'] for d in regions]
 private=out/'work/video-import'; private.mkdir(parents=True,exist_ok=True)
 catalogue=out/'data/district-video-research.json'
 previous=json.loads(catalogue.read_text(encoding='utf-8')) if catalogue.exists() else {}
 records={r['id']:r for r in previous.get('records',[])}
 incoming={}
 source_hash=digest(source.read_bytes())
 private=private/source_hash
 inventory=[]; references=[]; errors=[]; primary_count=0; workbook_count=0; all_rows=0
 entries=[]
 if source.suffix.lower()=='.zip':
  with zipfile.ZipFile(source) as z:
   if sum(i.file_size for i in z.infolist())>300_000_000: raise ValueError('압축 해제 크기가 300MB를 넘습니다.')
   entries=[(i.filename,z.read(i)) for i in z.infolist() if i.filename.lower().endswith(('.xlsx','.pdf'))]
 else: entries=[(source.name,source.read_bytes())]
 for filename,content in entries:
  basename=filename.split('/')[-1]
  if filename.lower().endswith('.pdf'):
   from pypdf import PdfReader
   pdf=PdfReader(io.BytesIO(content))
   pages=len(pdf.pages)
   write(private/(digest(content)+'.pdf.json'),{
    'file':basename,'pages':[page.extract_text() or '' for page in pdf.pages],
   })
   references.append({'filename':basename,'sha256':digest(content),'bytes':len(content),'pages':pages,'note':'별도 참고 PDF. 영상 수에 합산하지 않음. 원본 ZIP에서 열람.'});continue
  workbook_count+=1
  workbook=openpyxl.load_workbook(io.BytesIO(content),read_only=True,data_only=False,keep_links=False)
  sheets=[]
  for sheet in workbook:
   rows=[list(r) for r in sheet.values]; all_rows+=sum(any(v is not None for v in r) for r in rows)
   h,tab=table(rows);sheets.append((sheet.title,h,tab))
   inventory.append({'file':basename,'sheet':sheet.title,'headerRow':h,'nonemptyRows':sum(any(v is not None for v in r) for r in rows),'columns':list(tab[0][1]) if tab else [],'role':'primary' if sheet.title in PRIMARY.get(basename,[]) else 'support'})
   write(private/(digest(filename+sheet.title)+'.json'),{'file':filename,'sheet':sheet.title,'rows':rows})
  chosen=PRIMARY.get(basename)
  if chosen is None:
   full=[s for s in sheets if s[2] and len(s[2][0][1])>=30 and '자료ID' in s[2][0][1] and '영상URL' in s[2][0][1]]
   if len(full)==1:chosen=[full[0][0]]
   else:
    errors.append({'file':basename,'error':'기준 시트가 모호합니다. PRIMARY에 누적 원자료 시트를 지정해야 합니다.'});continue
   for entry in inventory:
    if entry['file']==basename and entry['sheet'] in chosen:entry['role']='primary'
  missing=set(chosen)-{s[0] for s in sheets}
  if missing: raise ValueError(f'{basename}: 기준 시트 없음 {missing}')
  file_district=next((d for d in districts if d in basename),next((d for d in districts if d[:-1] in basename),'서울 전체'))
  supporting={}
  for name,h,tab in sheets:
   if name in chosen: continue
   for rownum,values in tab:
    sid=field(values,'자료ID','ID','자료 ID')
    if sid: supporting.setdefault(sid,[]).append({'file':basename,'sheet':name,'row':rownum,'values':values})
  for name,h,tab in sheets:
   if name not in chosen:continue
   for rownum,values in tab:
    sid=field(values,'자료ID','ID','번호')
    title=field(values,'자료명','제목','자료제목','영상 제목/식별')
    if not sid or not title:
     errors.append({'file':basename,'sheet':name,'row':rownum,'error':'자료ID 또는 제목 없음'});continue
    primary_count+=1
    rid='row-'+digest(basename+'|'+name+'|'+sid)[:24]
    raw={'file':basename,'sheet':name,'row':rownum,'values':values}
    prior=incoming.get(rid)
    history=prior.get('history',[]) if prior else []
    if prior and prior['original']!=sanitize(raw) and prior['original'] not in history:history.append(prior['original'])
    url_raw=field(values,'영상URL','YouTube 직접 URL')
    key,url=identity(url_raw)
    source_url=field(values,'출처URL','공식원출처URL','원출처URL','상세URL','원문URL','원본URL','공식 편목 URL','근거 출처 URL')
    if not url: _,url=identity(source_url)
    # A source landing page is still a candidate, never a confirmed video.
    video_key,_=identity(url_raw)
    conflict=False
    declared=field(values,'영상ID','영상 ID')
    if video_key and video_key.startswith('youtube:') and re.fullmatch(r'[\w-]{11}',declared,re.ASCII):conflict=declared!=video_key.split(':')[1]
    places=field(values,'관련장소','장소명','관련장소명','원문장소표기','행정동·장소','장소·지역')
    district=field(values,'자치구','기초지자체')
    district=district if district in districts else file_district
    legal=field(values,'법정동'); admin=field(values,'행정동')
    matching_text=' '.join([places,legal,title])
    legal_names=next((r['dongs'] for r in regions if r['name']==district),[])
    broad_names={re.sub(r'\d+가$', '', d) for d in legal_names} - set(legal_names)
    mentioned=lambda d: re.search(r'(?<![가-힣\d])'+re.escape(d)+r'(?![가-힣\d])',matching_text)
    candidates=[d for d in legal_names if mentioned(d)]
    broad_candidates=[d for d in sorted(broad_names) if mentioned(d)]
    notes=field(values,'검증메모·추가확인','추가검증메모','추가확인사항','후속확인사항','설명·검토 메모','비고')
    location_blocked='주소 연결 금지' in notes
    if location_blocked: candidates=[]; broad_candidates=[]
    status=field(values,'확인수준','검토상태','확인단계','존재 확인 근거')
    segments=[]
    segment_sources=supporting.get(sid,[])+[{'sheet':name,'row':rownum,'values':values}]
    for entry in segment_sources:
     v=entry['values'];start=field(v,'시작시각','관련구간시작','시작시간','시작');end=field(v,'종료시각','관련구간끝','종료시간','끝')
     if start or end:
      seconds=timecode(start);end_seconds=timecode(end)
      valid=seconds is not None and (not end or (end_seconds is not None and end_seconds>seconds))
      segments.append({'sheet':entry['sheet'],'row':entry['row'],'startRaw':start,'endRaw':end,'startSeconds':seconds if valid else None,'endSeconds':end_seconds if valid else None,'status':'조사표 표기·독립 검증 대기','evidence':field(v,'확인한내용','근거종류','관련구간설명','구간확인메모','확인 내용','관련구간 내용'),'independentlyVerified':False})
    # Publisher chapter markers are evidence notes, not observed scene times.
    segment_notes=[field(entry['values'],'관련구간목록','구간확인메모') for entry in segment_sources]
    segment_notes=list(dict.fromkeys(note for note in segment_notes if re.search(r'\d{1,3}:\d{2}',note)))
    record={'id':rid,'sourceId':sid,'title':title,'district':district,'places':places,'legalDong':legal,'administrativeDong':admin,'dongCandidates':candidates,'broadCandidates':broad_candidates,
      'url':url,'identity':None if conflict else key,'urlStatus':'ID 충돌' if conflict else '형식 확인·접근 미검증' if url else 'URL 미확보',
      'sourceUrl':identity(source_url)[1], 'channel':field(values,'출처기관','기관명','제작·소장기관','제공기관·채널','제작기관','제작·생산기관','원본 채널/공식 기관'),
      'period':field(values,'역사적대상시기','대상시기','기록 시기'),
      'date':field(values,'자료일자','날짜','대표날짜','촬영·제작·대상시기'), 'dateType':field(values,'날짜유형'),
      'description':field(values,'사이트용소개문초안','요약','내용요약','내용설명','자료요약','역사내용·근거','설명·검토 메모'),
      'review':status,'playback':field(values,'실제재생확인여부','실제 재생 여부'),
      'rights':field(values,'개별이용조건','영상이용조건·사용승인상태','이용조건','이용조건및근거','저작권·이용조건상태','저작권·초상권'),
      'locationBlocked':location_blocked,'address':field(values,'현재주소','현재 주소','주소','현재주소·지번'),
      'platform':field(values,'영상플랫폼','플랫폼'), 'duration':field(values,'전체재생시간','영상 길이'),
      'filmed':field(values,'촬영일'), 'published':field(values,'게시·발행일','게시일'),
      'notes':notes,'segmentNotes':segment_notes,'segments':segments,'independentlyVerified':False,'original':sanitize(raw),'supporting':sanitize(supporting.get(sid,[])),'history':history}
    if rid in incoming and incoming[rid]['original']['values']!=record['original']['values']:
     raise ValueError(f'{basename} / {name}: 자료ID {sid} 중복 충돌')
    incoming[rid]=sanitize(record)
  workbook.close()

 # Fail before changing the site catalogue if any input cannot be classified.
 if errors or not incoming:
  raise ValueError(json.dumps(errors or ['가져올 조사 행이 없습니다.'],ensure_ascii=False))

 for rid,record in incoming.items():
  original=record['original']
  public={k:v for k,v in record.items() if k not in ('original','supporting','history') and v not in ('',None,[]) and (k!='locationBlocked' or v)}
  public['file'],public['sheet'],public['row']=original['file'],original['sheet'],original['row']
  existing=records.get(rid)
  if existing and existing.get('identity')!=public.get('identity'):
   raise ValueError(f"{public['file']} / {public['sourceId']}: 영상 식별자 변경은 수동 검토가 필요합니다.")
  if existing and (existing.get('segments') or public.get('segments')):
   public['segments']=list({json.dumps(seg,ensure_ascii=False,sort_keys=True):seg
                            for seg in existing.get('segments',[])+public.get('segments',[])}.values())
  records[rid]=public

 old=json.loads((out/'data/consolidated-video-research.json').read_text(encoding='utf-8'))
 old_keys={f"youtube:{v['videoId']}" for v in old['items']}
 identified={r['identity'] for r in records.values() if r.get('identity')}
 pending=sum(not r.get('identity') for r in records.values())
 district_counts={d:len({r.get('identity',r['id']) for r in records.values() if r['district']==d}) for d in districts}
 stats={'workbooks':workbook_count,'sheets':len(inventory),'nonemptySheetRows':all_rows,
        'inputRows':primary_count,'records':len(records),'identified':len(identified),
        'matchedExisting':len(identified & old_keys),'newVideos':len(identified-old_keys),
        'candidates':pending,'duplicateRows':len(records)-len(identified)-pending,
        'districtCounts':district_counts}
 all_references={r['sha256']:r for r in previous.get('references',[])+references}
 write(private/'raw-records.json',incoming)
 write(private/'report.json',{'stats':stats,'references':references,'sheets':inventory})
 catalogue.parent.mkdir(parents=True,exist_ok=True)
 # A single atomic replacement keeps the search index and its provenance in sync.
 fd,temp=tempfile.mkstemp(dir=catalogue.parent,prefix='.district-video-',suffix='.tmp')
 try:
  with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as file:
   file.write('{"records":[\n')
   file.write(',\n'.join(json.dumps(records[k],ensure_ascii=False,separators=(',',':')) for k in sorted(records)))
   file.write('\n],"references":'+json.dumps(list(all_references.values()),ensure_ascii=False)+'}\n')
  os.replace(temp,catalogue)
 finally:
  Path(temp).unlink(missing_ok=True)
 print(json.dumps(stats,ensure_ascii=False,indent=2))
 return stats

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument('source',type=Path)
 parser.add_argument('--out',type=Path,default=ROOT,help='checkout containing the existing catalogue')
 args=parser.parse_args()
 lock=args.out/'work/video-import/import.lock'
 lock.parent.mkdir(parents=True,exist_ok=True)
 try:
  handle=lock.open('x',encoding='utf-8')
 except FileExistsError:
  parser.exit(1,f'다른 가져오기가 실행 중입니다. {lock}\n')
 try:
  with handle:
   handle.write(str(os.getpid()))
  run(args.source,args.out)
 finally:
  lock.unlink()
