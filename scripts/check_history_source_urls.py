#!/usr/bin/env python3
"""Read-only URL diagnostics. HTTP success never implies historical or rights verification."""
import csv
import ipaddress
import os
import socket
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("HISTORY_RECORDS_PATH", ROOT / "research-data/records.csv"))
OUTPUT = Path(os.environ.get("HISTORY_URL_REPORT_PATH", ROOT / "research-data/source_url_report.csv"))
ALLOWED = {"archives.seoul.go.kr", "museum.seoul.go.kr"}
TIMEOUT = 8
MAX_RECORDS = 500
MAX_REDIRECTS = 5

def permitted(url):
    try:
        p = urlsplit(url)
        return (p.scheme == "https" and p.hostname in ALLOWED and
                p.username is None and p.password is None and p.port in (None, 443))
    except ValueError:
        return False

class RestrictedRedirect(HTTPRedirectHandler):
    def __init__(self):
        self.count = 0
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.count += 1
        if self.count > MAX_REDIRECTS or not permitted(newurl):
            raise ValueError("Unsafe or excessive redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def classify(url):
    if not permitted(url):
        return "SKIPPED_DOMAIN", "", "", "Not on official HTTPS allowlist"
    p = urlsplit(url)
    if p.path in ("", "/") and not p.query:
        return "HOMEPAGE_ONLY", "", "", "Institution homepage is not a record"
    try:
        # Prevent outbound requests to private/reserved addresses even if DNS is compromised.
        addresses = socket.getaddrinfo(p.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            return "BLOCKED_DNS", "", "", "Non-public DNS result"
        opener = build_opener(RestrictedRedirect)
        request = Request(url, headers={"User-Agent": "SeoulPlaceDocentSourceAudit/1.0 (research; no content retention)", "Accept": "text/html,application/pdf;q=0.8,*/*;q=0.5"})
        with opener.open(request, timeout=TIMEOUT) as response:
            final = response.geturl()
            if not permitted(final):
                return "BLOCKED_REDIRECT", "", "", "Redirected outside allowlist"
            status = response.status
            content_type = response.headers.get("Content-Type", "").split(";")[0].strip().lower()
            return ("REACHABLE_UNVERIFIED" if status == 200 else "HTTP_OTHER",
                    str(status), final, content_type)
    except HTTPError as e:
        return "HTTP_ERROR", str(e.code), "", "HTTP response"
    except (URLError, TimeoutError, socket.timeout, ValueError, OSError) as e:
        return "CHECK_FAILED", "", "", type(e).__name__

def run():
    with INPUT.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or not {"record_id", "source_url"}.issubset(reader.fieldnames):
            raise ValueError("CSV requires record_id and source_url")
        records = list(reader)
    if len(records) > MAX_RECORDS:
        raise ValueError("Too many records for a single run")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    counts = Counter()
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["record_id","source_url","url_status","http_status","final_url","details","checked_at_utc","metadata_verdict","rights_verdict"])
        writer.writeheader()
        for i, record in enumerate(records):
            if i:
                time.sleep(0.5)
            status, http, final, detail = classify(record["source_url"].strip())
            counts[status] += 1
            writer.writerow({"record_id":record["record_id"],"source_url":record["source_url"],"url_status":status,"http_status":http,"final_url":final,"details":detail,"checked_at_utc":datetime.now(timezone.utc).isoformat(),"metadata_verdict":"NOT_CHECKED","rights_verdict":"NOT_CHECKED"})
    print(f"Checked {len(records)} candidate URLs: {dict(counts)}. No metadata or rights approval.")

if __name__ == "__main__":
    run()
