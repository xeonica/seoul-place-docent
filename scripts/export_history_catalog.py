#!/usr/bin/env python3
"""Validate review-only Seoul place history CSVs and export a human-review XLSX."""
import csv
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research-data"
OUTPUT = ROOT / "research-data" / "seoul_place_docent_review.xlsx"
TABLES = [
    ("자료 수집표", "records.csv", "record_id"),
    ("장소 기준표", "places.csv", "place_id"),
    ("자료-장소 연결표", "record_place_links.csv", None),
]
TYPES = {"PHOTO", "MAP", "DOCUMENT", "VIDEO", "ORAL", "NEWS"}
RELATIONS = {"EXACT_SITE", "NEARBY", "DISTRICT_CONTEXT", "UNCERTAIN"}

def read_csv(filename):
    with (DATA / filename).open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError(f"{filename}: missing headers")
        return reader.fieldnames, list(reader)

def canonical_url(url):
    p = urlsplit((url or "").strip())
    if p.scheme not in ("http", "https") or not p.netloc:
        raise ValueError(f"Invalid source URL: {url}")
    keep = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
            if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", urlencode(sorted(keep)), ""))

def validate(tables):
    records, places, links = [rows for _, _, rows in tables]
    ids = [r["record_id"].strip() for r in records]
    place_ids = [p["place_id"].strip() for p in places]
    if not all(ids) or len(ids) != len(set(ids)):
        raise ValueError("Empty or duplicated record_id")
    if not all(place_ids) or len(place_ids) != len(set(place_ids)):
        raise ValueError("Empty or duplicated place_id")
    seen_urls = set()
    for r in records:
        if r["record_type"] not in TYPES:
            raise ValueError(f"Unknown record_type: {r['record_id']}")
        url = canonical_url(r["source_url"])
        if url in seen_urls:
            raise ValueError(f"Duplicate source URL: {url}")
        seen_urls.add(url)
        if r["record_type"] == "NEWS" and not all(r.get(k) for k in ("newspaper_name", "published_date", "article_title")):
            raise ValueError(f"Incomplete NEWS metadata: {r['record_id']}")
        if not r.get("rights_status") or not r.get("review_status"):
            raise ValueError(f"Missing review/rights status: {r['record_id']}")
    for link in links:
        if link["record_id"] not in ids:
            raise ValueError(f"Unknown linked record: {link['record_id']}")
        if link["place_id"] and link["place_id"] not in place_ids:
            raise ValueError(f"Unknown linked place: {link['place_id']}")
        if link["relation_type"] not in RELATIONS:
            raise ValueError(f"Unknown relation: {link['relation_type']}")
        if not link["place_id"] and link["relation_type"] != "UNCERTAIN":
            raise ValueError("Empty place_id requires UNCERTAIN")
    return Counter(r["record_type"] for r in records)

def main():
    tables = [(name, *read_csv(filename)) for name, filename, _ in TABLES]
    counts = validate(tables)
    wb = Workbook()
    wb.remove(wb.active)
    for name, headers, rows in tables:
        ws = wb.create_sheet(name)
        ws.append(headers)
        for row in rows:
            ws.append([row.get(h, "") for h in headers])
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        for cell in ws[1]:
            cell.fill = PatternFill("solid", fgColor="17365D")
            cell.font = Font(color="FFFFFF", bold=True)
        for col, header in enumerate(headers, 1):
            ws.column_dimensions[get_column_letter(col)].width = min(58, max(16, len(header) + 5))
        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(vertical="top", wrap_text=True)
    summary = wb.create_sheet("수집 현황")
    summary.append(["지표", "건수"])
    summary.append(["검토용 후보 총계", len(tables[0][2])])
    for kind in sorted(TYPES):
        summary.append([kind, counts[kind]])
    summary.append(["임시 포함 장소 수", len(tables[1][2])])
    summary.append(["자료-장소 연결 수", len(tables[2][2])])
    summary.append(["운영 DB 중복 검증", "미실시"])
    summary.append(["원본 파일 확보 검증", "미실시"])
    summary.column_dimensions["A"].width = 30
    summary.column_dimensions["B"].width = 22
    summary.freeze_panes = "A2"
    for cell in summary[1]:
        cell.fill = PatternFill("solid", fgColor="17365D")
        cell.font = Font(color="FFFFFF", bold=True)
    wb.save(OUTPUT)
    print(f"VALIDATED: {len(tables[0][2])} review candidates; exported {OUTPUT}")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError) as e:
        print(f"CATALOG VALIDATION FAILED: {e}", file=sys.stderr)
        sys.exit(1)
