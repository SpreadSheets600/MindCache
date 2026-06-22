import re

from app.core.logging import get_logger

logger = get_logger(__name__)


class EntityExtractor:
    """Extracts key entities (technologies, companies) from text using regex patterns."""

    async def extract_entities(self, text: str) -> list[tuple[str, str]]:
        if not text.strip():
            return []

        entities = []
        text_lower = text.lower()

        techs = [
            "python", "rust", "go", "typescript", "javascript", "react", "fastapi",
            "sqlite", "faiss", "docker", "kubernetes", "pytorch", "tensorflow",
            "nextjs", "nodejs", "svelte", "vue", "django", "flask", "redis",
        ]
        companies = [
            "google", "openai", "meta", "microsoft", "apple", "amazon", "netflix",
            "anthropic", "cloudflare", "github",
        ]

        for tech in techs:
            if re.search(rf"\b{re.escape(tech)}\b", text_lower):
                entities.append((tech.capitalize(), "Technology"))
        for comp in companies:
            if re.search(rf"\b{re.escape(comp)}\b", text_lower):
                entities.append((comp.capitalize(), "Company"))

        return entities[:8]


# Singleton Instance
entity_extractor = EntityExtractor()
