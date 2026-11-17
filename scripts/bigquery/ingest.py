#!/usr/bin/env python3
"""Validate and explicitly ingest only the three canonical review-catalog CSVs."""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
import uuid
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
from history_catalog_utils import canonical_url  # noqa: E402

DATA = ROOT / "research-data"
TYPE_ALLOWLIST = {"PHOTO", "MAP", "DOCUMENT", "VIDEO", "ORAL", "NEWS"}
RELATION_ALLOWLIST = {"EXACT_SITE", "NEARBY", "DISTRICT_CONTEXT", "UNCERTAIN"}
FILES = {
    "historical_records": (DATA / "records.csv", "record_id"),
    "places": (DATA / "places.csv", "place_id"),
    "record_place_links": (DATA / "record_place_links.csv", None),
}
RECORD_FIELDS = [
    "record_id", "source_institution", "source_url", "record_title", "record_type", "created_year",
    "subject_start_year", "subject_end_year", "evidence_excerpt", "rights_status", "review_status",
    "newspaper_name", "published_date", "article_title", "historical_place_name", "event_type",
    "checked_date", "duplicate_status", "record_origin",
]
PLACE_FIELDS = ["place_id", "place_name", "current_address", "district", "legal_dong", "legal_dong_code", "historical_names", "historical_period", "location_review_status", "notes"]
LINK_FIELDS = ["record_id", "place_id", "relation_type", "relation_evidence", "link_review_status"]
DATE_FIELDS = {"published_date", "checked_date"}
YEAR_FIELDS = {"created_year", "subject_start_year", "subject_end_year"}


def clean(value):
    return value.strip() if isinstance(value, str) else ""


def parse_year(value):
    value = clean(value)
    if not value:
        return None
    if not re.fullmatch(r"\d{1,4}", value) or not 1 <= int(value) <= 9999:
        raise ValueError("INVALID_YEAR")
    return int(value)


def parse_date(value):
    value = clean(value)
    if not value:
        return None
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("INVALID_DATE")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise ValueError("INVALID_DATE") from exc


def read_rows(path, required, issues):
    if not path.is_file():
        issues.append({"file": str(path.relative_to(ROOT)), "line": 1, "record_id": "", "reason": "MISSING_FILE"})
        return [], []
    rows = []
    headers = []
    try:
        with path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle, strict=True)
            headers = reader.fieldnames or []
            if len(headers) != len(set(headers)):
                issues.append({"file": str(path.relative_to(ROOT)), "line": 1, "record_id": "", "reason": "DUPLICATE_COLUMNS"})
                return [], headers
            missing = [name for name in required if name not in headers]
            if missing:
                issues.append({"file": str(path.relative_to(ROOT)), "line": 1, "record_id": "", "reason": "MISSING_COLUMNS:" + ",".join(missing)})
                return [], headers
            for line, row in enumerate(reader, 2):
                key = "record_id" if "record_id" in row else "place_id"
                identity = clean(row.get(key, ""))
                if None in row:
                    issues.append({"file": str(path.relative_to(ROOT)), "line": line, "record_id": identity, "reason": "FIELD_COUNT_MISMATCH"})
                    continue
                if all(not clean(value) for value in row.values()):
                    continue
                rows.append((line, {name: clean(row.get(name, "")) for name in headers}))
    except (OSError, UnicodeError, csv.Error) as exc:
        issues.append({"file": str(path.relative_to(ROOT)), "line": 0, "record_id": "", "reason": "CSV_READ_ERROR:" + type(exc).__name__})
    return rows, headers


def duplicate_values(rows, field, normalize=lambda x: x):
    buckets = {}
    for index, row in enumerate(rows):
        value = normalize(clean(row.get(field, "")))
        if value:
            buckets.setdefault(value, []).append(index)
    return {index for indexes in buckets.values() if len(indexes) > 1 for index in indexes}


def safe_canonical(value):
    if not value:
        return ""
    try:
        return canonical_url(value)
    except ValueError:
        return ""


def validate_catalog():
    issues = []
    raw_records, record_headers = read_rows(FILES["historical_records"][0], RECORD_FIELDS, issues)
    raw_places, place_headers = read_rows(FILES["places"][0], PLACE_FIELDS, issues)
    raw_links, link_headers = read_rows(FILES["record_place_links"][0], LINK_FIELDS, issues)
    record_duplicates = duplicate_values([row for _, row in raw_records], "record_id")
    place_duplicates = duplicate_values([row for _, row in raw_places], "place_id")
    url_duplicates = duplicate_values([row for _, row in raw_records], "source_url", safe_canonical)
    link_keys = [(clean(row.get("record_id")), clean(row.get("place_id")), clean(row.get("relation_type"))) for _, row in raw_links]
    duplicate_link_keys = {key for key, count in Counter(link_keys).items() if key[0] and count > 1}
    link_key_duplicates = {index for index, key in enumerate(link_keys) if key in duplicate_link_keys}
    valid_records, valid_places, valid_links = [], [], []
    record_ids = {clean(row.get("record_id")) for _, row in raw_records}
    place_ids = {clean(row.get("place_id")) for _, row in raw_places}

    for index, (line, row) in enumerate(raw_records):
        identity = clean(row.get("record_id"))
        reasons = []
        if not identity: reasons.append("EMPTY_RECORD_ID")
        if index in record_duplicates: reasons.append("DUPLICATE_RECORD_ID")
        if not clean(row.get("source_institution")) or not clean(row.get("record_title")): reasons.append("MISSING_REQUIRED_RECORD_FIELD")
        try: canonical = canonical_url(row.get("source_url", ""))
        except ValueError: canonical = ""; reasons.append("INVALID_SOURCE_URL")
        if index in url_duplicates: reasons.append("DUPLICATE_CANONICAL_SOURCE_URL")
        if row.get("record_type") not in TYPE_ALLOWLIST: reasons.append("INVALID_RECORD_TYPE")
        if not clean(row.get("rights_status")) or not clean(row.get("review_status")): reasons.append("MISSING_REVIEW_OR_RIGHTS_STATUS")
        if row.get("record_type") == "NEWS" and not all(clean(row.get(key)) for key in ("newspaper_name", "published_date", "article_title")):
            reasons.append("INCOMPLETE_NEWS_METADATA")
        cooked = dict(row)
        for key in YEAR_FIELDS:
            try: cooked[key] = parse_year(row.get(key, ""))
            except ValueError: reasons.append("INVALID_YEAR:" + key)
        start, end = cooked.get("subject_start_year"), cooked.get("subject_end_year")
        if start is not None and end is not None and start > end: reasons.append("INVALID_SUBJECT_PERIOD")
        for key in DATE_FIELDS:
            try: cooked[key] = parse_date(row.get(key, ""))
            except ValueError: reasons.append("INVALID_DATE:" + key)
        if reasons:
            issues.append({"file": str(FILES["historical_records"][0].relative_to(ROOT)), "line": line, "record_id": identity, "reason": "|".join(sorted(set(reasons)))})
        else:
            cooked["canonical_source_url"] = canonical
            valid_records.append(cooked)

    for index, (line, row) in enumerate(raw_places):
        identity = clean(row.get("place_id"))
        reasons = []
        if not identity: reasons.append("EMPTY_PLACE_ID")
        if index in place_duplicates: reasons.append("DUPLICATE_PLACE_ID")
        if not clean(row.get("place_name")) or not clean(row.get("location_review_status")): reasons.append("MISSING_REQUIRED_PLACE_FIELD")
        if reasons:
            issues.append({"file": str(FILES["places"][0].relative_to(ROOT)), "line": line, "record_id": identity, "reason": "|".join(reasons)})
        else:
            valid_places.append(dict(row))

    for link_index, (line, row) in enumerate(raw_links):
        record_id, place_id = clean(row.get("record_id")), clean(row.get("place_id"))
        reasons = []
        if not record_id or record_id not in record_ids: reasons.append("UNKNOWN_RECORD_ID")
        if record_id not in {r["record_id"] for r in valid_records}: reasons.append("REJECTED_OR_DUPLICATE_RECORD_ID")
        if place_id and place_id not in place_ids: reasons.append("UNKNOWN_PLACE_ID")
        if place_id and place_id not in {p["place_id"] for p in valid_places}: reasons.append("REJECTED_OR_DUPLICATE_PLACE_ID")
        if row.get("relation_type") not in RELATION_ALLOWLIST: reasons.append("INVALID_RELATION_TYPE")
        if not place_id and row.get("relation_type") != "UNCERTAIN": reasons.append("EMPTY_PLACE_REQUIRES_UNCERTAIN")
        if not clean(row.get("link_review_status")): reasons.append("MISSING_LINK_REVIEW_STATUS")
        if link_index in link_key_duplicates: reasons.append("DUPLICATE_RECORD_PLACE_RELATION")
        if reasons:
            issues.append({"file": str(FILES["record_place_links"][0].relative_to(ROOT)), "line": line, "record_id": record_id, "reason": "|".join(sorted(set(reasons)))})
        else:
            valid_links.append(dict(row))

    return {"records": valid_records, "places": valid_places, "links": valid_links,
            "raw_counts": {"records": len(raw_records), "places": len(raw_places), "links": len(raw_links)},
            "issues": issues, "headers": {"records": record_headers, "places": place_headers, "links": link_headers}}


def content_hash(row):
    payload = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def catalog_hash():
    digest = hashlib.sha256()
    for key in FILES:
        path = FILES[key][0]
        digest.update(key.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()


def read_config():
    required = ["BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET_ID", "BIGQUERY_LOCATION"]
    missing = [key for key in required if not os.environ.get(key, "").strip()]
    if missing:
        raise RuntimeError("BQ_CONFIG_MISSING")
    project, dataset, location = (os.environ[key].strip() for key in required)
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project) or not re.fullmatch(r"[A-Za-z0-9_-]{1,1024}", dataset) or not re.fullmatch(r"[A-Za-z0-9_-]{2,40}", location):
        raise RuntimeError("BQ_CONFIG_MISSING")
    return project, dataset, location


def json_report(result, run_id, mode):
    print(json.dumps({"runId": run_id, "mode": mode, "source": "three-canonical-research-csvs-only",
                      "counts": result["raw_counts"], "valid": {"records": len(result["records"]), "places": len(result["places"]), "links": len(result["links"])},
                      "rejected": len(result["issues"]), "issues": result["issues"]}, ensure_ascii=False, indent=2))


def write_reject_report(path, issues):
    if not issues:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file", "line", "record_id", "reason"])
        writer.writeheader()
        writer.writerows(issues)


def schemas():
    from google.cloud import bigquery
    return {
        "historical_records": [
            bigquery.SchemaField("record_id", "STRING", mode="REQUIRED"), bigquery.SchemaField("source_institution", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("source_url", "STRING", mode="REQUIRED"), bigquery.SchemaField("record_title", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("record_type", "STRING", mode="REQUIRED"), bigquery.SchemaField("created_year", "INT64"),
            bigquery.SchemaField("subject_start_year", "INT64"), bigquery.SchemaField("subject_end_year", "INT64"), bigquery.SchemaField("evidence_excerpt", "STRING"),
            bigquery.SchemaField("rights_status", "STRING", mode="REQUIRED"), bigquery.SchemaField("review_status", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("newspaper_name", "STRING"), bigquery.SchemaField("published_date", "DATE"), bigquery.SchemaField("article_title", "STRING"),
            bigquery.SchemaField("historical_place_name", "STRING"), bigquery.SchemaField("event_type", "STRING"), bigquery.SchemaField("checked_date", "DATE"),
            bigquery.SchemaField("duplicate_status", "STRING"), bigquery.SchemaField("record_origin", "STRING"), bigquery.SchemaField("source_payload", "JSON", mode="REQUIRED"), bigquery.SchemaField("canonical_source_url", "STRING", mode="REQUIRED"),
            bigquery.SchemaField("ingested_at", "TIMESTAMP", mode="REQUIRED"), bigquery.SchemaField("updated_at", "TIMESTAMP", mode="REQUIRED"),
            bigquery.SchemaField("content_hash", "STRING", mode="REQUIRED"), bigquery.SchemaField("ingestion_run_id", "STRING", mode="REQUIRED"),
        ],
        "places": [bigquery.SchemaField(name, "STRING", mode="REQUIRED" if name in {"place_id", "place_name", "location_review_status"} else "NULLABLE") for name in PLACE_FIELDS] + [bigquery.SchemaField("source_payload", "JSON", mode="REQUIRED"),
            bigquery.SchemaField("updated_at", "TIMESTAMP", mode="REQUIRED"), bigquery.SchemaField("content_hash", "STRING", mode="REQUIRED"), bigquery.SchemaField("ingestion_run_id", "STRING", mode="REQUIRED")],
        "record_place_links": [bigquery.SchemaField(name, "STRING", mode="REQUIRED" if name in {"record_id", "relation_type", "link_review_status"} else "NULLABLE") for name in LINK_FIELDS] + [bigquery.SchemaField("source_payload", "JSON", mode="REQUIRED"),
            bigquery.SchemaField("updated_at", "TIMESTAMP", mode="REQUIRED"), bigquery.SchemaField("content_hash", "STRING", mode="REQUIRED"), bigquery.SchemaField("ingestion_run_id", "STRING", mode="REQUIRED")],
    }


def bq_tables(project, dataset):
    prefix = f"`{project}.{dataset}."
    names = ("historical_records", "places", "record_place_links", "ingestion_runs", "ingestion_run_sources")
    return {key: prefix + key + "`" for key in names}


def stage_rows(data, run_id, now):
    result = {"historical_records": [], "places": [], "record_place_links": []}
    for row in data["records"]:
        result["historical_records"].append({**row, "source_payload": {key: value for key, value in row.items() if key != "canonical_source_url"}, "ingested_at": now, "updated_at": now, "content_hash": content_hash(row), "ingestion_run_id": run_id})
    for row in data["places"]:
        result["places"].append({**row, "source_payload": row, "updated_at": now, "content_hash": content_hash(row), "ingestion_run_id": run_id})
    for row in data["links"]:
        result["record_place_links"].append({**row, "source_payload": row, "updated_at": now, "content_hash": content_hash(row), "ingestion_run_id": run_id})
    return result


def merge_sql(target, stage, key_fields, fields):
    on = " AND ".join(f"T.{key} IS NOT DISTINCT FROM S.{key}" for key in key_fields)
    updates = [field for field in fields if field not in key_fields and field != "ingested_at"]
    update = ", ".join(f"{field}=S.{field}" for field in updates)
    names = ", ".join(fields)
    values = ", ".join(f"S.{field}" for field in fields)
    return f"""MERGE {target} T USING {stage} S ON {on}
WHEN MATCHED AND T.content_hash != S.content_hash THEN UPDATE SET {update}
WHEN NOT MATCHED THEN INSERT ({names}) VALUES ({values})"""


def apply_data(data, run_id, rejected, *, limit=None, query_dry_run=False, resume=False):
    from google.cloud import bigquery
    project, dataset, location = read_config()
    timeout = int(os.environ.get("BIGQUERY_QUERY_TIMEOUT_MS", "8000")) / 1000
    max_bytes = int(os.environ.get("BIGQUERY_MAX_BYTES_BILLED", "104857600"))
    client = bigquery.Client(project=project, location=location)
    tables = bq_tables(project, dataset)
    if query_dry_run:
        query = f"SELECT COUNT(*) AS rows FROM {tables['historical_records']} WHERE review_status = 'content_checked'"
        job = client.query(query, job_config=bigquery.QueryJobConfig(dry_run=True, use_query_cache=False, maximum_bytes_billed=max_bytes), location=location)
        print(json.dumps({"queryDryRun": True, "estimatedBytesProcessed": job.total_bytes_processed, "maximumBytesBilled": max_bytes}))
        return

    ddl = (ROOT / "bigquery/schema.sql").read_text(encoding="utf-8").replace("{{project}}", project).replace("{{dataset}}", dataset)
    client.query(ddl, location=location, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes)).result(timeout=timeout)
    source_hash = catalog_hash()
    if resume:
        rows = list(client.query(
            f"SELECT source_hash,record_limit,status FROM {tables['ingestion_runs']} WHERE run_id=@run_id",
            job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("run_id", "STRING", run_id)]),
            location=location).result(timeout=timeout))
        if not rows or rows[0]["status"] not in {"FAILED", "RUNNING"} or rows[0]["source_hash"] != source_hash or (limit is not None and rows[0]["record_limit"] != limit):
            raise RuntimeError("BQ_RESUME_MISMATCH")
        limit = rows[0]["record_limit"]
        client.query(f"UPDATE {tables['ingestion_runs']} SET status='RUNNING',finished_at=NULL,error_summary=NULL WHERE run_id=@run_id",
                     job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("run_id", "STRING", run_id)]), location=location).result(timeout=timeout)
    started = datetime.now(timezone.utc)
    now = started.isoformat()
    staged = stage_rows(data, run_id, now)
    if limit:
        keep_ids = {row["record_id"] for row in staged["historical_records"][:limit]}
        staged["historical_records"] = staged["historical_records"][:limit]
        needed_places = {row["place_id"] for row in staged["record_place_links"] if row["record_id"] in keep_ids and row["place_id"]}
        staged["places"] = [row for row in staged["places"] if row["place_id"] in needed_places]
        staged["record_place_links"] = [row for row in staged["record_place_links"] if row["record_id"] in keep_ids]

    cursor = "historical_records:0"
    run_row = {"run_id": run_id, "started_at": now, "finished_at": None, "source_name": "research-data/records.csv,places.csv,record_place_links.csv",
               "attempted_count": sum(len(rows) for rows in staged.values()) + rejected,
               "inserted_count": 0, "updated_count": 0, "duplicate_count": 0, "rejected_count": rejected,
               "status": "RUNNING", "error_summary": None, "source_hash": source_hash, "record_limit": limit, "resume_cursor": cursor}
    if not resume:
        insert_errors = client.insert_rows_json(tables["ingestion_runs"], [run_row])
        if insert_errors:
            raise RuntimeError("BQ_RUN_LOG_WRITE_FAILED")
        source_rows = []
        for table_name in ("historical_records", "places", "record_place_links"):
            path = FILES[table_name][0]
            rejected_for_file = sum(1 for issue in data["issues"] if issue["file"] == str(path.relative_to(ROOT)))
            source_rows.append({"run_id": run_id, "source_name": str(path.relative_to(ROOT)),
                                "source_hash": hashlib.sha256(path.read_bytes()).hexdigest(),
                                "attempted_count": len(staged[table_name]) + rejected_for_file,
                                "inserted_count": 0, "updated_count": 0, "duplicate_count": 0,
                                "rejected_count": rejected_for_file, "status": "RUNNING",
                                "resume_cursor": "0", "error_summary": None, "updated_at": now})
        source_errors = client.insert_rows_json(tables["ingestion_run_sources"], source_rows)
        if source_errors:
            finish_run(client, tables["ingestion_runs"], run_id, "FAILED", 0, 0, 0, rejected, "BQ_SOURCE_RUN_LOG_WRITE_FAILED")
            raise RuntimeError("BQ_SOURCE_RUN_LOG_WRITE_FAILED")
    if rejected:
        for table_name in ("historical_records", "places", "record_place_links"):
            path = str(FILES[table_name][0].relative_to(ROOT))
            update_source_run(client, tables["ingestion_run_sources"], run_id, table_name, "REJECTED", "0", "CSV validation rejected rows", timeout)
        finish_run(client, tables["ingestion_runs"], run_id, "REJECTED", 0, 0, 0, rejected, "CSV validation rejected rows; data tables were not changed.")
        raise RuntimeError("BQ_INGEST_VALIDATION_FAILED")

    schemas_by_table = schemas()
    staging_ids = {}
    expires = datetime.now(timezone.utc) + timedelta(days=1)
    merged = {"inserted": 0, "updated": 0, "duplicates": 0}
    current_source = None
    try:
        chunk_size = int(os.environ.get("BIGQUERY_INGEST_BATCH_SIZE", "5000"))
        if not 1 <= chunk_size <= 10000:
            raise RuntimeError("BQ_INVALID_BATCH_SIZE")
        for table_name in ("historical_records", "places", "record_place_links"):
            current_source = table_name
            stage_name = f"_staging_{table_name}_{run_id.replace('-', '')}"
            stage_id = f"{project}.{dataset}.{stage_name}"
            staging_ids[table_name] = f"`{stage_id}`"
            config = bigquery.LoadJobConfig(schema=schemas_by_table[table_name], write_disposition="WRITE_TRUNCATE", source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON)
            chunk_tables = []
            chunks = [staged[table_name][i:i + chunk_size] for i in range(0, len(staged[table_name]), chunk_size)]
            for chunk_index, chunk in enumerate(chunks):
                chunk_name = f"_bqchunk_{table_name}_{run_id.replace('-', '')}_{chunk_index:06d}"
                chunk_id = f"{project}.{dataset}.{chunk_name}"
                chunk_tables.append(f"`{chunk_id}`")
                try:
                    existing = client.get_table(chunk_id)
                except Exception as exc:
                    if type(exc).__name__ not in {"NotFound", "NotFoundError"}:
                        raise
                    existing = None
                if existing is not None and existing.num_rows == len(chunk):
                    pass
                else:
                    for attempt in range(3):
                        try:
                            job = client.load_table_from_json(chunk, chunk_id, job_config=config, location=location)
                            job.result(timeout=timeout)
                            break
                        except Exception:
                            if attempt == 2:
                                raise
                            time.sleep(2 ** attempt)
                part_table = client.get_table(chunk_id)
                part_table.expires = expires
                client.update_table(part_table, ["expires"])
                cursor = f"{table_name}:{chunk_index + 1}"
                update_resume_cursor(client, tables["ingestion_runs"], run_id, cursor, timeout)
                update_source_run(client, tables["ingestion_run_sources"], run_id, table_name, "RUNNING", str(chunk_index + 1), None, timeout)
            if chunk_tables:
                union = " UNION ALL ".join(f"SELECT * FROM {part}" for part in chunk_tables)
                client.query(f"CREATE OR REPLACE TABLE {staging_ids[table_name]} AS {union}", location=location,
                             job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes)).result(timeout=timeout)
            else:
                client.query(f"CREATE OR REPLACE TABLE {staging_ids[table_name]} AS SELECT * FROM {tables[table_name]} WHERE FALSE", location=location).result(timeout=timeout)
            stage_table = client.get_table(stage_id)
            stage_table.expires = expires
            client.update_table(stage_table, ["expires"])
            update_source_run(client, tables["ingestion_run_sources"], run_id, table_name, "STAGED", str(len(chunks)), None, timeout)

        # Canonical URLs are unique across different record IDs; the CSV check catches intra-batch duplicates.
        duplicates = list(client.query(f"SELECT S.record_id FROM {staging_ids['historical_records']} S JOIN {tables['historical_records']} T ON T.canonical_source_url=S.canonical_source_url AND T.record_id!=S.record_id LIMIT 20", location=location).result(timeout=timeout))
        if duplicates:
            raise RuntimeError("BQ_DUPLICATE_SOURCE_URL")

        keys = {"historical_records": ["record_id"], "places": ["place_id"], "record_place_links": ["record_id", "place_id", "relation_type"]}
        for table_name, stage in staging_ids.items():
            fields = [field.name for field in schemas_by_table[table_name]]
            join = " AND ".join(f"T.{key} IS NOT DISTINCT FROM S.{key}" for key in keys[table_name])
            stats = list(client.query(f"SELECT COUNTIF(T.content_hash IS NULL) AS inserted, COUNTIF(T.content_hash!=S.content_hash) AS updated, COUNTIF(T.content_hash=S.content_hash) AS duplicates FROM {stage} S LEFT JOIN {tables[table_name]} T ON {join}", location=location).result(timeout=timeout))[0]
            source_counts = {"inserted": int(stats["inserted"] or 0), "updated": int(stats["updated"] or 0), "duplicates": int(stats["duplicates"] or 0)}
            merged["inserted"] += source_counts["inserted"]; merged["updated"] += source_counts["updated"]; merged["duplicates"] += source_counts["duplicates"]
            if staged[table_name]:
                sql = merge_sql(tables[table_name], stage, keys[table_name], fields)
                job = client.query(sql, location=location, job_config=bigquery.QueryJobConfig(maximum_bytes_billed=max_bytes))
                job.result(timeout=timeout)
            update_source_run(client, tables["ingestion_run_sources"], run_id, table_name, "COMPLETED", str(len(chunks)), None, timeout, source_counts)
        finish_run(client, tables["ingestion_runs"], run_id, "COMPLETED", merged["inserted"], merged["updated"], merged["duplicates"], 0, None)
        print(json.dumps({"runId": run_id, "status": "COMPLETED", "attempted": run_row["attempted_count"], **merged, "rejected": 0, "stagingExpiresAt": expires.isoformat()}, ensure_ascii=False))
    except Exception as exc:
        safe_code = str(exc) if str(exc).startswith("BQ_") else type(exc).__name__
        if current_source:
            update_source_run(client, tables["ingestion_run_sources"], run_id, current_source, "FAILED", cursor, safe_code, timeout)
        client.query(f"UPDATE {tables['ingestion_run_sources']} SET status='PAUSED',updated_at=CURRENT_TIMESTAMP() WHERE run_id=@run_id AND status IN ('RUNNING','STAGED')",
                     job_config=bigquery.QueryJobConfig(query_parameters=[bigquery.ScalarQueryParameter("run_id", "STRING", run_id)]), location=location).result(timeout=timeout)
        finish_run(client, tables["ingestion_runs"], run_id, "FAILED", merged["inserted"], merged["updated"], merged["duplicates"], 0, safe_code)
        raise


def finish_run(client, run_table, run_id, status, inserted, updated, duplicates, rejected, summary):
    from google.cloud import bigquery
    query = f"""UPDATE {run_table} SET finished_at=@finished_at,status=@status,inserted_count=@inserted,updated_count=@updated,
      duplicate_count=@duplicates,rejected_count=@rejected,error_summary=@summary WHERE run_id=@run_id"""
    params = [bigquery.ScalarQueryParameter("finished_at", "TIMESTAMP", datetime.now(timezone.utc)), bigquery.ScalarQueryParameter("status", "STRING", status),
              bigquery.ScalarQueryParameter("inserted", "INT64", inserted), bigquery.ScalarQueryParameter("updated", "INT64", updated),
              bigquery.ScalarQueryParameter("duplicates", "INT64", duplicates), bigquery.ScalarQueryParameter("rejected", "INT64", rejected),
              bigquery.ScalarQueryParameter("summary", "STRING", summary), bigquery.ScalarQueryParameter("run_id", "STRING", run_id)]
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params), location=client.location).result(timeout=20)


def update_resume_cursor(client, run_table, run_id, cursor, timeout):
    from google.cloud import bigquery
    query = f"UPDATE {run_table} SET resume_cursor=@cursor WHERE run_id=@run_id"
    params = [bigquery.ScalarQueryParameter("cursor", "STRING", cursor), bigquery.ScalarQueryParameter("run_id", "STRING", run_id)]
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params), location=client.location).result(timeout=timeout)


def update_source_run(client, source_table, run_id, table_name, status, cursor, error, timeout, counts=None):
    from google.cloud import bigquery
    source_name = str(FILES[table_name][0].relative_to(ROOT))
    counts = counts or {}
    query = f"UPDATE {source_table} SET status=@status,resume_cursor=@cursor,error_summary=@error,inserted_count=COALESCE(@inserted,inserted_count),updated_count=COALESCE(@updated,updated_count),duplicate_count=COALESCE(@duplicates,duplicate_count),updated_at=CURRENT_TIMESTAMP() WHERE run_id=@run_id AND source_name=@source_name"
    params = [bigquery.ScalarQueryParameter("status", "STRING", status), bigquery.ScalarQueryParameter("cursor", "STRING", cursor),
              bigquery.ScalarQueryParameter("error", "STRING", error), bigquery.ScalarQueryParameter("run_id", "STRING", run_id),
              bigquery.ScalarQueryParameter("source_name", "STRING", source_name),
              bigquery.ScalarQueryParameter("inserted", "INT64", counts.get("inserted")), bigquery.ScalarQueryParameter("updated", "INT64", counts.get("updated")),
              bigquery.ScalarQueryParameter("duplicates", "INT64", counts.get("duplicates"))]
    client.query(query, job_config=bigquery.QueryJobConfig(query_parameters=params), location=client.location).result(timeout=timeout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Actually write to BigQuery. Requires --confirm APPLY.")
    parser.add_argument("--confirm", choices=["APPLY"], help="Explicit second confirmation for writes.")
    parser.add_argument("--limit", type=int, help="Limit to this many records and their linked places for a small first import.")
    parser.add_argument("--query-dry-run", action="store_true", help="Run a BigQuery API query dry-run after the dataset/tables exist.")
    parser.add_argument("--resume", metavar="RUN_ID", help="Resume a FAILED or RUNNING import with the same CSV content and limit.")
    parser.add_argument("--reject-report", type=Path, help="Optional metadata-only CSV report path for rejected rows.")
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1: parser.error("--limit must be positive")
    if args.apply != (args.confirm == "APPLY"): parser.error("writes require both --apply and --confirm APPLY")
    if args.query_dry_run and args.apply: parser.error("--query-dry-run and --apply are separate operations")
    if args.resume and not args.apply: parser.error("--resume requires --apply --confirm APPLY")
    if args.resume and not re.fullmatch(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}", args.resume):
        parser.error("--resume must be a run ID UUID")
    run_id = args.resume or str(uuid.uuid4())
    result = validate_catalog()
    json_report(result, run_id, "apply-request" if args.apply else "pipeline-dry-run")
    if args.reject_report:
        write_reject_report(args.reject_report, result["issues"])
    if not args.apply:
        if args.query_dry_run:
            try: apply_data(result, run_id, len(result["issues"]), query_dry_run=True)
            except Exception as exc:
                print(json.dumps({"queryDryRun": False, "errorCode": str(exc) if str(exc).startswith("BQ_") else type(exc).__name__}), file=sys.stderr)
                return 1
        return 1 if result["issues"] else 0
    try:
        apply_data(result, run_id, len(result["issues"]), limit=args.limit, resume=bool(args.resume))
    except Exception as exc:
        print(json.dumps({"runId": run_id, "status": "FAILED", "errorCode": str(exc) if str(exc).startswith("BQ_") else type(exc).__name__}), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
