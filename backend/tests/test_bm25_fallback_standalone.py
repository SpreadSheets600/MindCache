import importlib.util
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


class CommonTermBM25:
    def __init__(self, corpus):
        self.corpus = corpus

    def get_scores(self, tokens):
        return [-0.1] * len(self.corpus)


class SmallCorpusTests(unittest.TestCase):
    def test_common_terms_remain_searchable_without_false_matches(self):
        rank = ModuleType("rank_bm25")
        rank.BM25Okapi = CommonTermBM25
        config = ModuleType("app.core.config")
        config.settings = SimpleNamespace(BM25_INDEX_PATH="unused")
        logging = ModuleType("app.core.logging")
        logging.get_logger = lambda name: SimpleNamespace(info=lambda *args, **kw: None)
        path = Path(__file__).parents[1] / "app/services/bm25_service.py"
        with patch.dict(sys.modules, {"rank_bm25": rank, "app.core.config": config, "app.core.logging": logging}):
            spec = importlib.util.spec_from_file_location("isolated_bm25", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            with tempfile.TemporaryDirectory() as directory:
                index = module.BM25Service(str(Path(directory) / "index.pkl"))
                index._doc_ids = [1, 2]
                index._corpus = [["quantum", "cedar"], ["other", "topic"]]
                index._index = CommonTermBM25(index._corpus)
                self.assertEqual(index.search("quantum cedar"), [(1, 1.0)])
                self.assertEqual(index.search("unrelated"), [])


if __name__ == "__main__":
    unittest.main()
