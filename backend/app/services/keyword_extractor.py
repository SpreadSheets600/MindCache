from app.core.logging import get_logger
from app.services.ollama_service import ollama_service

logger = get_logger(__name__)


class KeywordExtractor:
    """Service To Extract Highly Representative Keywords From Text Using Local Ollama or Term Frequency Fallback."""

    async def extract_keywords(self, text: str, top_n: int = 5) -> list[tuple[str, float]]:
        """Extracts Top N Keywords With Their Relevance Scores From The Provided Text."""

        if not text.strip():
            return []

        try:
            # Try to use Ollama for extraction
            if await ollama_service.check_health():
                keywords = await ollama_service.extract_keywords(text, top_n=top_n)
                if keywords:
                    return [(kw, 1.0 - (i * 0.1)) for i, kw in enumerate(keywords)]

        except Exception as e:
            logger.warning(f"Ollama Keyword Extraction Failed: {e}. Falling Back To Basic Term Frequency.")

        # Minimal Fallback If Ollama Fails For Any Reason
        words = [w.lower().strip(",.?!()\"'-") for w in text.split()]
        # Simple stop words filtering
        stop_words = {"this", "that", "these", "those", "there", "their", "about", "would", "could", "should", "where", "which", "whose", "under", "about", "their", "other"}
        filtered_words = [w for w in words if w.isalnum() and len(w) > 4 and w not in stop_words]
        
        # Count frequencies
        from collections import Counter
        counts = Counter(filtered_words).most_common(top_n)
        if counts:
            return [(kw, 1.0 - (i * 0.1)) for i, (kw, _) in enumerate(counts)]
            
        # Absolute fallback
        fallback_words = [w for w in words if w.isalnum() and len(w) > 4][:top_n]
        return [(w, 1.0 - (i * 0.1)) for i, w in enumerate(fallback_words)]


# Singleton Instance
keyword_extractor = KeywordExtractor()
