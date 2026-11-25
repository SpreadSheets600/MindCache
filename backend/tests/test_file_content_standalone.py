import unittest
from app.services.file_content import extract_file


class FileContentTests(unittest.TestCase):
    def test_text_and_images_are_identified_by_content(self):
        self.assertEqual(extract_file(b"hello", "notes.md"), ("text", "text/plain; charset=utf-8", "hello", "ready"))
        self.assertEqual(extract_file(b"\x89PNG\r\n\x1a\nrest", "photo.txt")[0], "image")

    def test_invalid_file_is_rejected(self):
        with self.assertRaises(ValueError):
            extract_file(b"not an image", "photo.png")
        with self.assertRaises(ValueError):
            extract_file(b"\xff", "note.txt")
