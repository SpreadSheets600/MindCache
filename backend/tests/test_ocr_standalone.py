import subprocess
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.services.ocr import recognize_image


class OCRTests(unittest.TestCase):
    def test_uses_local_tool_and_returns_text(self):
        with patch("app.services.ocr.shutil.which", return_value="/usr/bin/tesseract"), patch("app.services.ocr.subprocess.run", return_value=SimpleNamespace(stdout=b"hello\n")) as run:
            self.assertEqual(recognize_image(b"image"), "hello")
            self.assertEqual(run.call_args.args[0], ["/usr/bin/tesseract", "stdin", "stdout"])
            self.assertEqual(run.call_args.kwargs["input"], b"image")

    def test_missing_tool_and_timeout_are_actionable(self):
        with patch("app.services.ocr.shutil.which", return_value=None):
            with self.assertRaisesRegex(ValueError, "not installed"):
                recognize_image(b"image")
        with patch("app.services.ocr.shutil.which", return_value="tesseract"), patch("app.services.ocr.subprocess.run", side_effect=subprocess.TimeoutExpired("tesseract", 30)):
            with self.assertRaisesRegex(ValueError, "timed out"):
                recognize_image(b"image")
