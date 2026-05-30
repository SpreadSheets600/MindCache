from typing import Optional

from sentence_transformers import CrossEncoder

from app.core.logging import get_logger

logger = get_logger(__name__)


class RerankerService:
    """Service To Rerank Search Results Using A Cross-Encoder For Improved Relevance."""

    def __init__(self, model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2") -> None:
        self.model_name: str = model_name
        self._model: Optional[CrossEncoder] = None

    @property
    def model(self) -> CrossEncoder:
        """Lazily Load And Return The Cross-Encoder Model."""

        if self._model is None:
            logger.info(f"Loading Cross-Encoder Model '{self.model_name}'...")

            try:
                self._model = CrossEncoder(self.model_name)
                logger.info("Cross-Encoder Model Loaded Successfully.")

            except Exception as e:
                logger.error(f"Failed To Load Cross-Encoder Model: {e}", exc_info=True)
                raise RuntimeError(f"Cross-Encoder Model Initialization Failed: {e}") from e

        return self._model

    def rerank(self, query: str, documents: list[dict], top_k: int = 5) -> list[tuple[int, float]]:
        """Reranks Candidate Documents Using A Cross-Encoder Model.

        Args:
            query: The User's Search Query.
            documents: List Of Dicts With 'id', 'title', And 'content' Keys.
            top_k: Number Of Top Results To Return.

        Returns:
            List Of Tuples (Document_Id, Cross-Encoder Score).

        """

        if not documents:
            return []

        # Build Query-Document Pairs For The Cross-Encoder
        pairs: list[tuple[str, str]] = []

        for doc in documents:
            doc_text = f"{doc.get('title') or ''} {doc.get('content') or ''}"[:2000]
            pairs.append((query, doc_text))

        try:
            scores = self.model.predict(pairs)

            # CrossEncoder Returns A Single Float For One Pair, A List/Array For Multiple
            import numpy as np
            if isinstance(scores, (float, np.floating)):  # pyright: ignore[reportUnknownMemberType]
                scores = [float(scores)]

            elif hasattr(scores, "tolist"):
                scores = scores.tolist()

            else:
                scores = list(scores)

            # Pair Document IDs With Scores And Sort Descending
            scored = sorted(
                zip([d["id"] for d in documents], scores),
                key=lambda x: x[1],
                reverse=True,
            )

            return [(int(doc_id), float(score)) for doc_id, score in scored[:top_k]]

        except Exception as e:
            logger.warning(f"Cross-Encoder Reranking Failed: {e}. Falling Back To Original Order.", exc_info=True)

            # Fallback: Return Top K From Original Order
            return [(d["id"], 0.0) for d in documents[:top_k]]


# Singleton Instance
reranker_service = RerankerService()
