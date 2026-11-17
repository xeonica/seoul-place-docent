import csv
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
SPEC = importlib.util.spec_from_file_location("bigquery_ingest", ROOT / "scripts/bigquery/ingest.py")
ingest = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ingest)


class BigQueryIngestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.files = {
            "historical_records": (self.root / "records.csv", "record_id"),
            "places": (self.root / "places.csv", "place_id"),
            "record_place_links": (self.root / "links.csv", None),
        }
        self.old_files, self.old_root = ingest.FILES, ingest.ROOT
        ingest.FILES, ingest.ROOT = self.files, self.root
        self.write(self.files["historical_records"][0], ingest.RECORD_FIELDS, [{
            "record_id": "REC-1", "source_institution": "서울시", "source_url": "https://example.org/a?utm_source=test",
            "record_title": "한글 역사 자료", "record_type": "DOCUMENT", "created_year": "2020",
            "subject_start_year": "1930", "subject_end_year": "", "evidence_excerpt": "검토 전 설명",
            "rights_status": "원문 이용조건 미확인", "review_status": "NEEDS_REVIEW", "newspaper_name": "",
            "published_date": "", "article_title": "", "historical_place_name": "옛 지명", "event_type": "",
            "checked_date": "2026-11-11", "duplicate_status": "UNVERIFIED", "record_origin": "테스트",
        }])
        self.write(self.files["places"][0], ingest.PLACE_FIELDS, [{
            "place_id": "PLACE-1", "place_name": "확인 전 장소", "current_address": "", "district": "마포구",
            "legal_dong": "당인동", "legal_dong_code": "", "historical_names": "당인리", "historical_period": "",
            "location_review_status": "UNVERIFIED", "notes": "주소 검토 전",
        }])
        self.write(self.files["record_place_links"][0], ingest.LINK_FIELDS, [{
            "record_id": "REC-1", "place_id": "PLACE-1", "relation_type": "DISTRICT_CONTEXT",
            "relation_evidence": "검토 전 관계", "link_review_status": "NEEDS_REVIEW",
        }])

    def tearDown(self):
        ingest.FILES, ingest.ROOT = self.old_files, self.old_root
        self.temp.cleanup()

    @staticmethod
    def write(path, headers, rows):
        with path.open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=headers)
            writer.writeheader(); writer.writerows(rows)

    def test_utf8_bom_canonical_url_and_raw_metadata_states_are_preserved(self):
        data = ingest.validate_catalog()
        self.assertEqual(data["issues"], [])
        record = data["records"][0]
        self.assertEqual(record["canonical_source_url"], "https://example.org/a")
        self.assertEqual(record["source_url"], "https://example.org/a?utm_source=test")
        self.assertEqual(record["rights_status"], "원문 이용조건 미확인")
        self.assertEqual(record["review_status"], "NEEDS_REVIEW")
        staged = ingest.stage_rows(data, "run-1", "2026-11-16T00:00:00+00:00")
        payload = staged["historical_records"][0]["source_payload"]
        self.assertEqual(payload["subject_end_year"], "")
        self.assertNotIn("verified", json.dumps(payload, ensure_ascii=False).lower())

    def test_duplicate_ids_urls_unknown_references_and_invalid_values_are_rejected(self):
        rows = [
            {"record_id": "REC-1", "source_institution": "서울시", "source_url": "https://example.org/a", "record_title": "제목", "record_type": "DOCUMENT", "rights_status": "unknown", "review_status": "NEEDS_REVIEW"},
            {"record_id": "REC-1", "source_institution": "서울시", "source_url": "https://EXAMPLE.org/a?utm_medium=x", "record_title": "중복", "record_type": "BAD", "rights_status": "unknown", "review_status": "NEEDS_REVIEW", "created_year": "bad"},
        ]
        self.write(self.files["historical_records"][0], ingest.RECORD_FIELDS, rows)
        self.write(self.files["record_place_links"][0], ingest.LINK_FIELDS, [{"record_id":"MISSING","place_id":"NO-PLACE","relation_type":"BAD","relation_evidence":"","link_review_status":""}])
        result = ingest.validate_catalog()
        reasons = " ".join(item["reason"] for item in result["issues"])
        self.assertIn("DUPLICATE_RECORD_ID", reasons)
        self.assertIn("DUPLICATE_CANONICAL_SOURCE_URL", reasons)
        self.assertIn("INVALID_RECORD_TYPE", reasons)
        self.assertIn("INVALID_YEAR:created_year", reasons)
        self.assertIn("UNKNOWN_RECORD_ID", reasons)
        self.assertIn("UNKNOWN_PLACE_ID", reasons)

    def test_empty_place_in_uncertain_relation_is_valid_and_merge_is_idempotent(self):
        self.write(self.files["record_place_links"][0], ingest.LINK_FIELDS, [{
            "record_id":"REC-1", "place_id":"", "relation_type":"UNCERTAIN", "relation_evidence":"장소 미확인", "link_review_status":"NEEDS_REVIEW",
        }])
        data = ingest.validate_catalog()
        self.assertEqual(data["issues"], [])
        sql = ingest.merge_sql("`p.d.record_place_links`", "`p.d.stage`", ["record_id", "place_id", "relation_type"], ["record_id", "place_id", "relation_type", "content_hash"])
        self.assertIn("T.place_id IS NOT DISTINCT FROM S.place_id", sql)
        self.assertIn("WHEN MATCHED AND T.content_hash != S.content_hash THEN UPDATE", sql)

    def test_configuration_requires_explicit_project_dataset_and_location(self):
        before = dict(__import__("os").environ)
        try:
            for key in ("BIGQUERY_PROJECT_ID", "BIGQUERY_DATASET_ID", "BIGQUERY_LOCATION"):
                __import__("os").environ.pop(key, None)
            with self.assertRaisesRegex(RuntimeError, "BQ_CONFIG_MISSING"):
                ingest.read_config()
        finally:
            __import__("os").environ.clear(); __import__("os").environ.update(before)


if __name__ == "__main__":
    unittest.main()
