from collections import Counter

from app.core.logging import get_logger

logger = get_logger(__name__)


class KeywordExtractor:

    async def extract_keywords(self, text: str, top_n: int = 5):
        if not text.strip():
            return []

        words = [w.lower().strip(",.?!()\"'-") for w in text.split()]
        stop_words = {
            "this", "that", "these", "those", "there", "their", "about", "would",
            "could", "should", "where", "which", "whose", "under", "other", "with", "have", "from", "they", "been", "were", "what", "when",
            "them", "than", "then", "also", "just", "more", "some", "into", "over",
            "such", "very", "each", "your", "its", "both", "after", "before",
        }
        filtered = [w for w in words if w.isalnum() and len(w) > 4 and w not in stop_words]
        counts = Counter(filtered).most_common(top_n)
        if counts:
            return [(kw, 1.0 - (i * 0.1)) for i, (kw, _) in enumerate(counts)]
        fallback = [w for w in words if w.isalnum() and len(w) > 4][:top_n]
        return [(w, 1.0 - (i * 0.1)) for i, w in enumerate(fallback)]


keyword_extractor = KeywordExtractor()
