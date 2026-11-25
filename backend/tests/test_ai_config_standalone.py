from pathlib import Path
import tempfile
import unittest
from app.core.ai_config import TaskModel, check_index_model, default_models, load_models, save_models


class AIConfigurationTests(unittest.TestCase):
    def test_remote_endpoint_requires_consent(self):
        with self.assertRaises(ValueError):
            TaskModel("openai", "model", "https://example.com/v1").validate()
        TaskModel("openai", "model", "https://example.com/v1", allow_remote=True).validate()
        TaskModel("ollama", "model", "http://127.0.0.1:11434").validate()
        with self.assertRaises(ValueError):
            TaskModel("openai", "model", "http://example.com/v1", allow_remote=True).validate()

    def test_index_model_can_be_disabled_and_restored_but_not_switched(self):
        with tempfile.TemporaryDirectory() as directory:
            identity = Path(directory) / "identity.json"
            original = TaskModel("transformers", "first")
            disabled = TaskModel("disabled", "")
            check_index_model(identity, original, disabled, True)
            check_index_model(identity, disabled, original, True)
            with self.assertRaises(ValueError):
                check_index_model(identity, disabled, TaskModel("transformers", "different"), True)
            check_index_model(identity, disabled, TaskModel("transformers", "different"), False)
            self.assertFalse(identity.exists())

    def test_independent_tasks_round_trip_without_secrets(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "models.json"
            models = default_models("local-embedding")
            models["generation"] = TaskModel("openai", "remote-model", "https://example.com/v1", "GENERATION_KEY", True)
            save_models(path, models)
            self.assertEqual(load_models(path, "unused"), models)
            self.assertNotIn("secret-value", path.read_text())
            self.assertEqual(path.stat().st_mode & 0o077, 0)
