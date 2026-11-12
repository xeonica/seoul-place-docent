#!/usr/bin/env python3
"""Conservative metadata comparisons for Seoul Archives pages. No rights approval."""
import csv
import html
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("HISTORY_RECORDS_PATH", ROOT / "research-data/records.csv"))
OUTPUT = Path(os.environ.get("HISTORY_METADATA_REPORT_PATH", ROOT / "research-data/source_metadata_report.csv"))
MAX_RECORDS = 100
FIELDS = ["record_id", "source_url", "expected_title", "observed_title", "expected_date",
          "observed_date", "expected_archive_id", "observed_archive_id",
          "metadata_verdict", "reason", "checked_at_utc", "rights_verdict"]

def normalize_title(s):
    return re.sub(r"\s+", "", re.sub(r"[^\w\s가-힣]", "", html.unescape(s or ""))).casefold()

def archive_id(url):
    p = urlsplit(url)
    if p.scheme != "https" or p.hostname != "archives.seoul.go.kr" or p.port not in (None, 443) or p.username or p.password or p.query or p.fragment:
        return ""
    m = re.fullmatch(r"/item/(\d+)/?", p.path)
    return m.group(1) if m else ""

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden:
            self.hidden -= 1
    def handle_data(self, data):
        if not self.hidden and data.strip():
            self.parts.append(data.strip())

def extract_metadata(page, url):
    """Extract explicitly labeled visible archive fields, not URL-inferred identifiers."""
    parser = VisibleText()
    parser.feed(page)
    text = " ".join(parser.parts)
    identifier = re.search(r"식별번호\s+(RG\d+-SR\d+-IT\d+)\b", text)
    date = re.search(r"\[생산\]\s*(\d{4}-\d{2}-\d{2})", text)
    # The page heading contains the record title followed by its production date.
    title = ""
    if date:
        heading = re.search(r"([^.!?<>]{2,120}?),\s*" + re.escape(date.group(1)), text)
        if heading:
            candidate = heading.group(1).strip()
            # Avoid accepting navigation labels or unrelated content as title.
            title = candidate.split("검색 ")[-1].split("URL복사 ")[-1].strip()
    return title, date.group(1) if date else "", identifier.group(1) if identifier else ""

def compare(row, observed):
    title, date, rid = observed
    expected_title = (row.get("record_title") or "").strip()
    expected_date = (row.get("production_date") or row.get("created_date") or "").strip()
    expected_id = (row.get("archive_record_id") or "").strip()
    expected_id_digits = expected_id
    fields = [(expected_title, title, normalize_title), (expected_date, date, str),
              (expected_id_digits, rid, str)]
    mismatch = [name for name, (a,b,norm) in zip(("title","date","archive_id"),fields)
                if a and b and norm(a) != norm(b)]
    missing = [name for name, (a,b,_) in zip(("title","date","archive_id"),fields)
               if not a or not b]
    if mismatch:
        return "MISMATCH_REVIEW", "Different: " + ", ".join(mismatch)
    if missing:
        return "INSUFFICIENT_EVIDENCE", "Missing comparison: " + ", ".join(missing)
    return "METADATA_MATCH_REVIEW", "Three metadata fields match; human review still required"

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def run():
    with INPUT.open(encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    if len(rows) > MAX_RECORDS:
        raise ValueError("Input exceeds 100 rows")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            url = (row.get("source_url") or "").strip()
            rid = archive_id(url)
            title = date = ""
            verdict = "SKIPPED_DOMAIN"
            reason = "Only Seoul Archives item URLs supported"
            if rid:
                try:
                    req = Request(url, headers={"User-Agent": "SeoulPlaceDocentMetadataReview/1.0"})
                    with build_opener(NoRedirect).open(req, timeout=8) as response:
                        if response.geturl() != url or response.status != 200:
                            raise ValueError("Unexpected redirect or HTTP status")
                        if "text/html" not in response.headers.get("Content-Type", "").lower():
                            raise ValueError("Not HTML")
                        page = response.read(512000).decode("utf-8", errors="replace")
                    title, date, observed_id = extract_metadata(page, url)
                    rid = observed_id
                    verdict, reason = compare(row, (title, date, rid))
                except Exception as exc:
                    verdict, reason = "FETCH_FAILED", type(exc).__name__
            writer.writerow(dict(record_id=row.get("record_id",""), source_url=url,
                expected_title=row.get("record_title",""), observed_title=title,
                expected_date=row.get("production_date") or row.get("created_date") or "",
                observed_date=date, expected_archive_id=row.get("archive_record_id",""),
                observed_archive_id=rid, metadata_verdict=verdict, reason=reason,
                checked_at_utc=datetime.now(timezone.utc).isoformat(), rights_verdict="NOT_CHECKED"))
    print(f"Produced {len(rows)} conservative metadata review rows; no rights approval.")

if __name__ == "__main__":
    run()
