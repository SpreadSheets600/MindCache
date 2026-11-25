import json
import tempfile
import unittest
from pathlib import Path

from app.core.ai_config import TaskModel, load_generation, public_view, save_generation


class AIConfigurationTests(unittest.TestCase):
    def test_remote_endpoint_requires_consent(self):
        with self.assertRaises(ValueError):
            TaskModel("openai", "model", "https://example.com/v1").validate()
        TaskModel("openai", "model", "https://example.com/v1", allow_remote=True).validate()
        TaskModel("ollama", "model", "http://127.0.0.1:11434").validate()
        with self.assertRaises(ValueError):
            TaskModel("openai", "model", "http://example.com/v1", allow_remote=True).validate()

    def test_generation_round_trip_keeps_key_private(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "models.json"
            model = TaskModel("openai", "remote-model", "https://example.com/v1", "sk-secret", True)
            save_generation(path, model)
            self.assertEqual(load_generation(path), model)
            self.assertEqual(path.stat().st_mode & 0o077, 0)
            view = public_view(model)
            self.assertTrue(view["api_key_set"])
            self.assertNotIn("api_key", view)
            self.assertNotIn("sk-secret", json.dumps(view))

    def test_missing_and_old_files_fall_back_to_disabled_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "models.json"
            self.assertEqual(load_generation(path), TaskModel("disabled", ""))
            path.write_text(json.dumps({"embedding": {"provider": "ollama", "model": "x"}}))
            self.assertEqual(load_generation(path), TaskModel("disabled", ""))
