#!/usr/bin/env python3
"""Conservative metadata comparisons for Seoul Archives pages. No rights approval."""
import csv
import html
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

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
    if p.scheme != "https" or p.hostname != "archives.seoul.go.kr" or p.port not in (None, 443):
        return ""
    m = re.fullmatch(r"/item/(\d+)/?", p.path)
    return m.group(1) if m else ""

def extract_metadata(page, url):
    """Only explicit machine-readable HTML meta tags; no invented date/title."""
    metas = {}
    for tag in re.findall(r"<meta\b[^>]*>", page, re.I):
        attrs = dict((k.lower(), html.unescape(v)) for k, v in
                     re.findall(r'([\w:-]+)\s*=\s*["\']([^"\']*)["\']', tag))
        key = (attrs.get("property") or attrs.get("name") or "").lower()
        if key and attrs.get("content"):
            metas[key] = attrs["content"].strip()
    title = metas.get("og:title", "") or metas.get("dc.title", "")
    date = metas.get("article:published_time", "") or metas.get("dc.date", "")
    if date:
        m = re.search(r"\d{4}-\d{2}-\d{2}", date)
        date = m.group(0) if m else ""
    return title, date, archive_id(url)

def compare(row, observed):
    title, date, rid = observed
    expected_title = (row.get("record_title") or "").strip()
    expected_date = (row.get("production_date") or row.get("created_date") or "").strip()
    expected_id = (row.get("archive_record_id") or "").strip()
    expected_digits = re.search(r"(\d+)$", expected_id)
    expected_id_digits = expected_digits.group(1) if expected_digits else ""
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
                    with urlopen(req, timeout=8) as response:
                        if response.geturl() != url or response.status != 200:
                            raise ValueError("Unexpected redirect or HTTP status")
                        if "text/html" not in response.headers.get("Content-Type", "").lower():
                            raise ValueError("Not HTML")
                        page = response.read(512000).decode("utf-8", errors="replace")
                    title, date, rid = extract_metadata(page, url)
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
