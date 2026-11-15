import importlib.util
import unittest
import tempfile
import csv
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("checker", Path(__file__).resolve().parents[1] / "scripts/check_history_source_urls.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

class URLChecks(unittest.TestCase):
    def test_candidate_ledgers_and_report_dedup(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "grok").mkdir()
            rows = [
                (base / "records.csv", "record_id,source_url\\na,https://archives.seoul.go.kr/item/1\\n"),
                (base / "seoul_docent_cumulative_20261115_2100.csv", "자료ID,원문URL\\nb,https://archives.seoul.go.kr/item/1\\n"),
                (base / "grok/seoul_history_candidates_20261115.csv", "record_id,source_url\\nc,https://example.org/2\\n"),
            ]
            for path, content in rows:
                path.write_text(content, encoding="utf-8")
            with patch.object(checker, "DATA", base), patch.dict(checker.os.environ, {}, clear=True):
                with patch.object(checker, "INPUT", base / "records.csv"):
                    records = checker.load_candidates()
                    self.assertEqual(len(records), 3)
                    self.assertEqual(len({r["source_url"] for r in records}), 2)
                    with patch.object(checker, "OUTPUT", base / "out.csv"), patch.object(checker, "classify", return_value=("REACHABLE_UNVERIFIED","200","","test")) as classify, patch.object(checker.time, "sleep"):
                        checker.run()
                        self.assertEqual(classify.call_count, 2)
                        with (base / "out.csv").open(encoding="utf-8-sig", newline="") as f:
                            self.assertEqual(len(list(csv.DictReader(f))), 3)

    def test_allowlist(self):
        self.assertTrue(checker.permitted("https://archives.seoul.go.kr/item/7691"))
        for url in ["http://archives.seoul.go.kr/item/7691", "https://archives.seoul.go.kr.evil.test/item/1", "https://127.0.0.1/", "file:///etc/passwd", "https://user@archives.seoul.go.kr/item/1"]:
            self.assertFalse(checker.permitted(url))
    def test_homepage_not_record(self):
        self.assertEqual(checker.classify("https://museum.seoul.go.kr/")[0], "HOMEPAGE_ONLY")
    def test_unapproved_domain_skipped(self):
        self.assertEqual(checker.classify("https://example.org/item/1")[0], "SKIPPED_DOMAIN")
    def test_block_private_dns(self):
        with patch.object(checker.socket, "getaddrinfo", return_value=[(2,1,6,"",("127.0.0.1",443))]):
            self.assertEqual(checker.classify("https://archives.seoul.go.kr/item/7691")[0], "BLOCKED_DNS")
    def test_redirect_block(self):
        from urllib.request import Request
        with self.assertRaises(ValueError):
            checker.RestrictedRedirect().redirect_request(Request("https://archives.seoul.go.kr/item/1"),None,302,"",{},"https://example.org/")

if __name__ == "__main__":
    unittest.main()
