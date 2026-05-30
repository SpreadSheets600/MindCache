import os
import pickle
import re
from pathlib import Path

from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

BM25_INDEX_PATH = str(Path(settings.DATA_DIR) / "bm25_index.pkl")


class BM25Service:
    """Service To Maintain A BM25 Lexical Index For Hybrid Keyword+Semantic Search."""

    def __init__(self) -> None:
        self._index: BM25Okapi | None = None
        self._doc_ids: list[int] = []
        self._corpus: list[list[str]] = []
        self._load_index()

    def _tokenize(self, text: str) -> list[str]:
        """Tokenizes Text Into Lowercase Alphanumeric Tokens (allowing hyphens and underscores)."""
        if not text:
            return []
        return re.findall(r"\b[a-zA-Z0-9_-]+\b", text.lower())

    def _load_index(self) -> None:
        """Loads BM25 Index From Disk If It Exists."""

        if os.path.exists(BM25_INDEX_PATH) and os.path.getsize(BM25_INDEX_PATH) > 0:
            try:
                with open(BM25_INDEX_PATH, "rb") as f:
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

    def save(self) -> None:
        """Serializes The BM25 Corpus And Doc IDs To Disk."""

        try:
            os.makedirs(os.path.dirname(BM25_INDEX_PATH), exist_ok=True)

            with open(BM25_INDEX_PATH, "wb") as f:
                pickle.dump({"doc_ids": self._doc_ids, "corpus": self._corpus}, f)

            logger.debug(f"BM25 Index Saved. Documents: {len(self._doc_ids)}.")

        except Exception as e:
            logger.error(f"Failed To Save BM25 Index: {e}", exc_info=True)

    def add_document(self, doc_id: int, title: str, content: str, keywords: list[str]) -> None:
        """Adds Or Updates A Document In The BM25 Index."""

        # Build A Rich Text Representation For Lexical Matching
        index_text = f"{title} {title} {title} {' '.join(keywords)} {' '.join(keywords)} {content[:4000]}"

        tokens = self._tokenize(index_text)

        if doc_id in self._doc_ids:
            idx = self._doc_ids.index(doc_id)
            self._corpus[idx] = tokens
        else:
            self._doc_ids.append(doc_id)
            self._corpus.append(tokens)

        self._index = BM25Okapi(self._corpus)
        self.save()

    def remove_document(self, doc_id: int) -> None:
        """Removes A Document From The BM25 Index."""

        if doc_id not in self._doc_ids:
            return

        idx = self._doc_ids.index(doc_id)
        del self._doc_ids[idx]
        del self._corpus[idx]

        self._index = BM25Okapi(self._corpus) if self._corpus else None
        self.save()

    def search(self, query: str, limit: int = 25) -> list[tuple[int, float]]:
        """Searches The BM25 Index And Returns Scored Document IDs."""

        if not self._index or not self._corpus:
            return []

        query_tokens = self._tokenize(query)

        if not query_tokens:
            return []

        scores = self._index.get_scores(query_tokens)

        # Pair IDs With Scores And Sort Descending
        scored = sorted(zip(self._doc_ids, scores, strict=True), key=lambda x: x[1], reverse=True)

        return [(doc_id, float(score)) for doc_id, score in scored[:limit] if score > 0]


# Singleton Instance
bm25_service = BM25Service()
