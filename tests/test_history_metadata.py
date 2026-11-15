import sys
import unittest
import tempfile
import csv
from unittest.mock import patch
import check_history_metadata as checker
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_history_metadata import archive_id, extract_metadata, compare

class MetadataTests(unittest.TestCase):
    def test_discovery_mixed_schemas_and_cached_requests(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "nested").mkdir()
            (root / "a.csv").write_text("record_id,source_url,record_title,production_date,archive_record_id\na,https://archives.seoul.go.kr/item/7691,제2한강교 개통식,1965-01-25,RG5-SR91-IT7691\n", encoding="utf-8")
            (root / "nested/b.csv").write_text("자료ID,원문URL,후보명,생산시기,기록번호\nb,https://archives.seoul.go.kr/item/7691,제2한강교 개통식,1965-01-25,RG5-SR91-IT7691\n", encoding="utf-8")
            with patch.object(checker, "ROOT", root), patch.object(checker, "OUTPUT", root / "report.csv"), patch.dict(checker.os.environ, {}, clear=True):
                import check_history_source_urls as urlchecker
                with patch.object(urlchecker, "DATA", root), patch.object(checker, "fetch_metadata", return_value=("제2한강교 개통식", "1965-01-25", "RG5-SR91-IT7691")) as fetch, patch.object(checker.time, "sleep"):
                    checker.run()
                    self.assertEqual(fetch.call_count, 1)
                    with (root / "report.csv").open(encoding="utf-8-sig", newline="") as f:
                        rows = list(csv.DictReader(f))
                    self.assertEqual(len(rows), 2)
                    self.assertTrue(all(r["metadata_verdict"] == "METADATA_MATCH_REVIEW" for r in rows))

    def test_official_record_id(self):
        self.assertEqual(archive_id("https://archives.seoul.go.kr/item/7691"), "7691")
        self.assertEqual(archive_id("https://example.com/item/7691"), "")
    def test_explicit_metadata(self):
        page = '<html><body>URL복사 제2한강교 개통식, 1965-01-25 기본정보 식별번호 RG5-SR91-IT7691 상세정보 일자 [생산] 1965-01-25 ~ 1965-01-25</body></html>'
        self.assertEqual(extract_metadata(page, "https://archives.seoul.go.kr/item/7691"),
                         ("제2한강교 개통식", "1965-01-25", "RG5-SR91-IT7691"))
    def test_missing_is_not_verified(self):
        row = {"record_title":"제2한강교 개통식", "production_date":"1965-01-25", "archive_record_id":"RG5-SR91-IT7691"}
        self.assertEqual(compare(row, ("제2한강교 개통식", "", "RG5-SR91-IT7691"))[0], "INSUFFICIENT_EVIDENCE")
    def test_mismatch(self):
        row = {"record_title":"다른 제목", "production_date":"1965-01-25", "archive_record_id":"RG5-SR91-IT7691"}
        self.assertEqual(compare(row, ("제2한강교 개통식", "1965-01-25", "RG5-SR91-IT7691"))[0], "MISMATCH_REVIEW")
    def test_matching_still_requires_review(self):
        row = {"record_title":"제2한강교 개통식", "production_date":"1965-01-25", "archive_record_id":"RG5-SR91-IT7691"}
        self.assertEqual(compare(row, ("제2한강교 개통식", "1965-01-25", "RG5-SR91-IT7691"))[0], "METADATA_MATCH_REVIEW")
if __name__ == "__main__":
    unittest.main()
