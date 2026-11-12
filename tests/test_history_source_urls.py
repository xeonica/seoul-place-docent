import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("checker", Path(__file__).resolve().parents[1] / "scripts/check_history_source_urls.py")
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)

class URLChecks(unittest.TestCase):
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
