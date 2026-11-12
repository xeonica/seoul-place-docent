import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_history_metadata import archive_id, extract_metadata, compare

class MetadataTests(unittest.TestCase):
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
