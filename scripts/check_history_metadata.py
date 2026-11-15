#!/usr/bin/env python3
"""Conservative metadata comparisons for Seoul Archives pages. No rights approval."""
import csv
import html
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parents[1]
INPUT = Path(os.environ.get("HISTORY_RECORDS_PATH", ROOT / "research-data/records.csv"))
OUTPUT = Path(os.environ.get("HISTORY_METADATA_REPORT_PATH", ROOT / "research-data/source_metadata_report.csv"))
FIELDS = ["source_file", "record_id", "source_url", "expected_title", "observed_title", "expected_date",
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


def candidate_rows():
    """Reuse URL diagnostics discovery so new research CSVs are automatically included."""
    sys.path.insert(0, str(ROOT / "scripts"))
    from check_history_source_urls import candidate_files
    paths = [INPUT] if os.environ.get("HISTORY_RECORDS_PATH") else candidate_files()
    for path in paths:
        with path.open(encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            headers = set(reader.fieldnames or [])
            url_key = next((k for k in ("source_url", "원문URL") if k in headers), None)
            id_key = next((k for k in ("record_id", "자료ID") if k in headers), None)
            if not url_key or not id_key:
                continue
            for row in reader:
                if None in row:
                    raise ValueError(f"Malformed CSV row: {path}")
                yield {"source_file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path),
                       "record_id": row[id_key] or "", "source_url": row[url_key] or "",
                       "record_title": row.get("record_title") or row.get("title") or row.get("후보명") or "",
                       "production_date": row.get("production_date") or row.get("생산시기") or "",
                       "created_date": row.get("created_date") or "",
                       "archive_record_id": row.get("archive_record_id") or row.get("기록번호") or row.get("provider_id") or ""}

def fetch_metadata(url):
    req = Request(url, headers={"User-Agent": "SeoulPlaceDocentMetadataReview/1.0"})
    with build_opener(NoRedirect).open(req, timeout=8) as response:
        if response.geturl() != url or response.status != 200:
            raise ValueError("Unexpected redirect or HTTP status")
        if "text/html" not in response.headers.get("Content-Type", "").lower():
            raise ValueError("Not HTML")
        page = response.read(512000).decode("utf-8", errors="replace")
    return extract_metadata(page, url)

def run():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    cache = {}
    count = 0
    compared = 0
    with OUTPUT.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in candidate_rows():
            count += 1
            url = row["source_url"].strip()
            observed = ("", "", "")
            verdict, reason = "SKIPPED_DOMAIN", "Only Seoul Archives item URLs supported"
            if archive_id(url):
                if url not in cache:
                    if cache:
                        time.sleep(0.5)
                    try:
                        cache[url] = (fetch_metadata(url), "")
                    except Exception as exc:
                        cache[url] = (("", "", ""), type(exc).__name__)
                observed, error = cache[url]
                if error:
                    verdict, reason = "FETCH_FAILED", error
                else:
                    compared += 1
                    verdict, reason = compare(row, observed)
                    # A partial/year-only date is not evidence of an exact date match.
                    expected = (row.get("production_date") or row.get("created_date") or "").strip()
                    if expected and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", expected):
                        if verdict == "MISMATCH_REVIEW" and "date" in reason:
                            verdict, reason = "INSUFFICIENT_EVIDENCE", "Expected date not precise enough for comparison"
            title, date, rid = observed
            writer.writerow({"source_file":row["source_file"], "record_id":row["record_id"],
                "source_url":url, "expected_title":row["record_title"], "observed_title":title,
                "expected_date":row["production_date"] or row["created_date"], "observed_date":date,
                "expected_archive_id":row["archive_record_id"], "observed_archive_id":rid,
                "metadata_verdict":verdict, "reason":reason,
                "checked_at_utc":datetime.now(timezone.utc).isoformat(), "rights_verdict":"NOT_CHECKED"})
    print(f"Metadata report: {count} candidate rows, {len(cache)} unique official item URLs, {compared} fetched comparisons. No rights approval.")

if __name__ == "__main__":
    run()
