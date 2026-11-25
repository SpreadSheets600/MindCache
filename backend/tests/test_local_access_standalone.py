import unittest
from app.core.local_access import allowed_origin, local_host


class LocalAccessTests(unittest.TestCase):
    def test_rejects_rebinding_hosts(self):
        for host in ("evil.example", "localhost.evil.example", "localhost@evil.example", "localhost:99999"):
            self.assertFalse(local_host(host), host)
        for host in ("localhost:8000", "127.0.0.1:8000", "[::1]:8000"):
            self.assertTrue(local_host(host), host)

    def test_rejects_foreign_browser_origins(self):
        self.assertTrue(allowed_origin("http://localhost:8000", "localhost:8000"))
        self.assertTrue(allowed_origin("chrome-extension://" + "a" * 32, "localhost:8000"))
        for origin in ("https://evil.example", "http://localhost:9999", "null", "chrome-extension://invalid"):
            self.assertFalse(allowed_origin(origin, "localhost:8000"), origin)
