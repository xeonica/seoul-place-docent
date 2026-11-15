#!/usr/bin/env python3
"""Check CSV structure throughout research-data, without promoting candidates to verified records."""
import csv
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "research-data"

def main():
    paths = sorted(ROOT.rglob("*.csv"))
    errors = []
    for path in paths:
        rel = path.relative_to(ROOT)
        try:
            with path.open(encoding="utf-8-sig", newline="") as handle:
                reader = csv.reader(handle, strict=True)
                headers = next(reader, None)
                if not headers or any(not h.strip() for h in headers):
                    errors.append(f"{rel}: missing/empty column header")
                    continue
                if len(headers) != len(set(headers)):
                    errors.append(f"{rel}: duplicate column headers")
                url_col = headers.index("source_url") if "source_url" in headers else None
                seen = defaultdict(list)
                count = 0
                for line, row in enumerate(reader, 2):
                    if not row or all(not cell.strip() for cell in row):
                        continue
                    count += 1
                    if len(row) != len(headers):
                        errors.append(f"{rel}:{line}: {len(row)} fields, expected {len(headers)}")
                        continue
                    if url_col is not None:
                        url = row[url_col].strip().rstrip("/")
                        if url:
                            seen[url].append(line)
                duplicate_groups = [lines for lines in seen.values() if len(lines) > 1]
                print(f"CHECKED {rel}: {count} rows; {len(duplicate_groups)} duplicate URL groups")
                for lines in duplicate_groups:
                    print(f"::warning file=research-data/{rel}::Repeated source_url on lines {','.join(map(str, lines))}")
        except (OSError, UnicodeError, csv.Error) as exc:
            errors.append(f"{rel}: {exc}")
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if not paths:
        print("ERROR: no CSV files found", file=sys.stderr)
    if errors or not paths:
        return 1
    print(f"PASS: checked {len(paths)} CSV files (recursive)")
    return 0

if __name__ == "__main__":
    sys.exit(main())
