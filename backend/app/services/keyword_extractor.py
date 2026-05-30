from keybert import KeyBERT

from app.core.logging import get_logger
from app.services.embedding_service import embedding_service

logger = get_logger(__name__)


class KeywordExtractor:
    """Service To Extract Highly Representative Keywords From Text Using Local KeyBERT And A Shared Embedding Model."""

    def __init__(self) -> None:
        self._kw_model: KeyBERT | None = None

    @property
    def kw_model(self) -> KeyBERT:
        """Lazily Initialize KeyBERT By Sharing The Same SentenceTransformer Model."""

        if self._kw_model is None:
            logger.info("Initializing KeyBERT With Shared SentenceTransformer Model...")

            # Reuse The Already Initialized SentenceTransformer To Optimize Memory Usage
            self._kw_model = KeyBERT(model=embedding_service.model)
            logger.info("KeyBERT Initialized Successfully.")

        return self._kw_model

    def extract_keywords(self, text: str, top_n: int = 5) -> list[tuple[str, float]]:
        """Extracts Top N Keywords With Their Relevance Scores From The Provided Text."""

        if not text.strip():
            return []

        try:
            # Keyphrase_Ngram_Range=(1, 1) Ensures Single Keywords, Stop_Words Filters Filler
            keywords = self.kw_model.extract_keywords(
                text,
                keyphrase_ngram_range=(1, 1),
                stop_words="english",
                use_maxsum=True,  # Diversify Keywords
                top_n=top_n,
            )

            # Ensure Float Scores Are Standard Float Type And Not Numpy Types
            return [(str(kw), float(score)) for kw, score in keywords]

        except Exception as e:
            logger.warning(f"KeyBERT Extraction Failed: {e}. Falling Back To Basic Term Frequency.", exc_info=True)

            # Minimal Fallback If KeyBERT Fails For Any Reason
            words = [w.lower() for w in text.split() if w.isalnum() and len(w) > 4][:top_n]
            return [(w, 1.0 - (i * 0.1)) for i, w in enumerate(words)]


# Singleton Instance
keyword_extractor = KeywordExtractor()
