import io
import os
import unittest
from unittest.mock import patch
from app.core.ai_config import TaskModel
from app.services.ai_providers import _post, embeddings, generate


class ProviderTests(unittest.TestCase):
    def test_openai_embedding_response_order(self):
        model = TaskModel("openai", "embed", "http://localhost:8001/v1")
        with patch("app.services.ai_providers._post", return_value={"data": [{"index": 1, "embedding": [2]}, {"index": 0, "embedding": [1]}]}):
            self.assertEqual(embeddings(model, ["one", "two"]), [[1], [2]])

    def test_http_adapter_uses_environment_key(self):
        class FakeResponse(io.BytesIO):
            def __enter__(self):
                return self
            def __exit__(self, *args):
                self.close()
        class FakeOpener:
            def open(self, request, timeout):
                self.request = request
                return FakeResponse(b'{"ok": true}')
        opener = FakeOpener()
        model = TaskModel("openai", "writer", "http://localhost:8001/v1", "MINDCACHE_TEST_KEY")
        with patch.dict(os.environ, {"MINDCACHE_TEST_KEY": "private-value"}), patch("app.services.ai_providers.build_opener", return_value=opener):
            self.assertEqual(_post(model, "/chat/completions", {"content": "hello"}), {"ok": True})
        self.assertEqual(opener.request.get_header("Authorization"), "Bearer private-value")
        self.assertEqual(opener.request.full_url, "http://localhost:8001/v1/chat/completions")

    def test_generation_uses_configured_provider(self):
        model = TaskModel("ollama", "writer", "http://localhost:11434")
        with patch("app.services.ai_providers._post", return_value={"response": "answer"}) as post:
            self.assertEqual(generate(model, "question"), "answer")
            self.assertEqual(post.call_args.args[1], "/api/generate")

    def test_remote_consent_checked_before_request(self):
        model = TaskModel("openai", "writer", "https://example.com/v1")
        with patch("app.services.ai_providers._post") as post:
            with self.assertRaises(ValueError):
                generate(model, "private text")
            post.assert_not_called()
