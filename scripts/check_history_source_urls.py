#!/usr/bin/env python3
"""Read-only source URL diagnostics for historical research candidates.

A reachable URL is NOT evidence that a record, its metadata, or its rights are verified.
"""
import csv
import json
import os
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("HISTORY_RECORDS_PATH", str(ROOT / "research-data/records.csv")))
OUTPUT = Path(os.environ.get("HISTORY_URL_REPORT_PATH", str(ROOT / "research-data/source_url_report.csv")))
MAX_RECORDS = int(os.environ.get("HISTORY_URL_MAX_RECORDS", "500"))
TIMEOUT = 8
ALLOWED = {"archives.seoul.go.kr", "museum.seoul.go.kr"}
class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not allowed_url(newurl):
            raise ValueError("Redirect outside allowlist")
        return super().redirect_request(req, fp, code, msg, headers, newurl)

def allowed_url(url):
    p = urlsplit(url)
    return p.scheme == "https" and p.hostname in ALLOWED and not p.username and not p.password and p.port in (None, 443)

def check(url):
    if not allowed_url(url):
        return "SKIPPED_NOT_ALLOWLISTED", "", "Only official HTTPS domains checked"
    opener = build_opener(SafeRedirect)
    try:
        req = Request(url, headers={"User-Agent": "SeoulPlaceDocentResearchAudit/1.0"}, method="GET")
        with opener.open(req, timeout=TIMEOUT) as response:
            final = response.geturl()
            if not allowed_url(final):
                return "SKIPPED_NOT_ALLOWLISTED", "", "Unexpected destination"
            return ("REACHABLE" if response.status == 200 else "HTTP_OTHER", str(response.status), final)
    except HTTPError as e:
        return "HTTP_ERROR", str(e.code), "HTTP response (not a metadata verdict)"
    except (URLError, TimeoutError, socket.timeout, ValueError, OSError) as e:
        return "CHECK_FAILED", "", type(e).__name__

def main():
    with INPUT.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or not {"record_id", "source_url"}.issubset(reader.fieldnames):
            raise ValueError("Expected record_id and source_url columns")
        records = list(reader)
    if len(records) > MAX_RECORDS:
        raise ValueError("Too many records; increase HISTORY_URL_MAX_RECORDS explicitly")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["record_id", "source_url", "url_status", "http_status", "details", "checked_at_utc", "metadata_verdict", "rights_verdict"])
        writer.writeheader()
        for record in records:
            status, http, details = check(record["source_url"].strip())
            writer.writerow({"record_id": record["record_id"], "source_url": record["source_url"], "url_status": status, "http_status": http, "details": details, "checked_at_utc": datetime.now(timezone.utc).isoformat(), "metadata_verdict": "NOT_CHECKED", "rights_verdict": "NOT_CHECKED"})
    print(f"URL diagnostic report: {len(records)} candidates; no metadata/rights approvals")
if __name__ == "__main__":
    main()
