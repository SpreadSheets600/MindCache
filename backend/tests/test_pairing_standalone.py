from pathlib import Path
import tempfile
import unittest

from app.core.pairing import save_trusted_ids, trusted_ids, valid_extension_id


class PairingTests(unittest.TestCase):
    def test_pair_and_revoke(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trusted.json"
            identifier = "abcdefghijklmnop" * 2
            self.assertEqual(trusted_ids(path), set())
            save_trusted_ids(path, {identifier})
            self.assertEqual(trusted_ids(path), {identifier})
            self.assertEqual(path.stat().st_mode & 0o077, 0)
            save_trusted_ids(path, set())
            self.assertEqual(trusted_ids(path), set())

    def test_invalid_ids_and_corrupt_files_fail_closed(self):
        self.assertFalse(valid_extension_id("z" * 32))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "trusted.json"
            with self.assertRaises(ValueError):
                save_trusted_ids(path, {"bad"})
            path.write_text('["bad"]')
            with self.assertRaises(ValueError):
                trusted_ids(path)
