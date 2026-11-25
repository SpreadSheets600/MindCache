import os
import pickle
import re

from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

BM25_INDEX_PATH = settings.BM25_INDEX_PATH


class BM25Service:

    _SUFFIXES = [
        'ization', 'ational', 'fulness', 'ousness', 'iveness',
        'tion', 'ment', 'ness', 'ance', 'ence', 'able', 'ible',
        'ling', 'ing', 'ful', 'ous', 'ive', 'ize', 'ise', 'ity',
        'ism', 'ist', 'ant', 'ent', 'ate', 'ify', 'ily',
        'ed', 'er', 'al', 'ly', 'es',
    ]

    def __init__(self, index_path: str | None = None):
        self.index_path = index_path or settings.BM25_INDEX_PATH
        self._index: BM25Okapi | None = None
        self._doc_ids: list[int] = []
        self._corpus: list[list[str]] = []
        self._load_index()

    @staticmethod
    def _stem(token: str):
        if len(token) < 4:
            return token
        for suffix in BM25Service._SUFFIXES:
            if token.endswith(suffix):
                stem = token[:-len(suffix)]
                if len(stem) >= 3:
                    return stem
        return token

    def _tokenize(self, text: str):
        if not text:
            return []
        raw_tokens = re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower())
        expanded = []
        for token in raw_tokens:
            expanded.append(token)
            if '-' in token and len(token) > 1:
                for part in token.split('-'):
                    if part:
                        expanded.append(part)
        return [self._stem(t) for t in expanded]

    def _load_index(self):

        if os.path.exists(self.index_path) and os.path.getsize(self.index_path) > 0:
            try:
                with open(self.index_path, "rb") as f:
                    data = pickle.load(f)

                self._doc_ids = data["doc_ids"]
                self._corpus = data["corpus"]
                self._index = BM25Okapi(self._corpus)
                logger.info(f"BM25 Index Loaded. Documents: {len(self._doc_ids)}.")

            except Exception as e:
                logger.warning(f"Failed To Load BM25 Index: {e}. Starting Fresh.", exc_info=True)
                self._doc_ids = []
                self._corpus = []
                self._index = None

        else:
            logger.info("No Existing BM25 Index Found. Starting Fresh.")

    def save(self):

        try:
            os.makedirs(os.path.dirname(self.index_path), exist_ok=True)

            with open(self.index_path, "wb") as f:
                pickle.dump({"doc_ids": self._doc_ids, "corpus": self._corpus}, f)

            logger.debug(f"BM25 Index Saved. Documents: {len(self._doc_ids)}.")

        except Exception as e:
            logger.error(f"Failed To Save BM25 Index: {e}", exc_info=True)

    def add_document(self, doc_id: int, title: str, content: str, keywords: list[str],
                     metadata: dict | None = None):

        parts = []

        if metadata:
            repo_name = metadata.get('repo_name', '')
            if repo_name:
                parts.append(f"{repo_name} {repo_name} {repo_name} {repo_name} {repo_name}")
            desc = metadata.get('description', '')
            if desc:
                parts.append(f"{desc} {desc} {desc}")
            topics = metadata.get('topics', [])
            if topics:
                topics_str = ' '.join(topics) if isinstance(topics, list) else str(topics)
                parts.append(f"{topics_str} {topics_str} {topics_str}")

        parts.extend([
            f"{title} {title} {title}",
            ' '.join(keywords), ' '.join(keywords),
            content[:4000],
        ])
        index_text = ' '.join(parts)

        tokens = self._tokenize(index_text)

        if doc_id in self._doc_ids:
            idx = self._doc_ids.index(doc_id)
            self._corpus[idx] = tokens
        else:
            self._doc_ids.append(doc_id)
            self._corpus.append(tokens)

        self._index = BM25Okapi(self._corpus)
        self.save()

    def remove_document(self, doc_id: int):

        if doc_id not in self._doc_ids:
            return

        idx = self._doc_ids.index(doc_id)
        del self._doc_ids[idx]
        del self._corpus[idx]

        self._index = BM25Okapi(self._corpus) if self._corpus else None
        self.save()

    def search(self, query: str, limit: int = 25):

        if not self._index or not self._corpus:
            return []

        query_tokens = self._tokenize(query)

        if not query_tokens:
            return []

        scores = self._index.get_scores(query_tokens)

        if not any(score > 0 for score in scores):
            terms = set(query_tokens)
            scores = [len(terms.intersection(document)) / len(terms) for document in self._corpus]

        scored = sorted(zip(self._doc_ids, scores, strict=True), key=lambda x: x[1], reverse=True)
        return [(doc_id, float(score)) for doc_id, score in scored[:limit] if score > 0]


bm25_service = BM25Service()
