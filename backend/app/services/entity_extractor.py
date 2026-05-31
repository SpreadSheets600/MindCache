import re
import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class EntityExtractor:
    """Service To Extract Key Entities (Persons, Companies, Technologies, Libraries, Projects) From Text Using Local Ollama."""

    def __init__(self) -> None:
        self.base_url: str = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model: str = settings.OLLAMA_MODEL

    async def check_health(self) -> bool:
        """Checks If Local Ollama Service Is Reachable."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False

    async def extract_entities(self, text: str) -> list[tuple[str, str]]:
        """Extracts key entities as tuples of (Name, Type) using Ollama or a regex fallback."""
        if not text.strip():
            return []

        try:
            if await self.check_health():
                prompt = (
                    f"Analyze the following text and extract key entities. Identify: "
                    f"1. Persons (e.g., Andrej Karpathy)\n"
                    f"2. Companies (e.g., Google, OpenAI, Meta)\n"
                    f"3. Technologies, Languages, or Libraries (e.g., Rust, PyTorch, FAISS, Next.js)\n"
                    f"4. Projects (e.g., MindCache)\n\n"
                    f"Respond ONLY with a plain comma-separated list of entities in the format 'Name:Type' "
                    f"(e.g., Google:Company, Andrej Karpathy:Person, Rust:Technology). "
                    f"Do not include any introductory text, explanation, numbering, or markdown formatting. Keep it to the top 8 most important entities.\n\n"
                    f"Text:\n{text[:4000]}"
                )

                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.post(
                        f"{self.base_url}/api/generate",
                        json={
                            "model": self.model,
                            "prompt": prompt,
                            "stream": False,
                        },
                    )

                    if response.status_code == 200:
                        res_text = response.json().get("response", "").strip()
                        entities = []
                        parts = [p.strip() for p in res_text.split(",") if p.strip()]
                        for part in parts:
                            if ":" in part:
                                name, etype = part.split(":", 1)
                                name = name.strip()
                                # Clean potential quote marks or brackets
                                name = re.sub(r"^['\"\[\-]+|['\"\]]+$", "", name).strip()
                                etype = re.sub(r"^['\"\[\-]+|['\"\]]+$", "", etype.strip()).capitalize()
                                if name and etype and len(name) > 1:
                                    entities.append((name, etype))
                        if entities:
                            return entities[:8]

        except Exception as e:
            logger.warning(f"Ollama Entity Extraction Failed: {e}. Falling Back To Regex.")

        # Lightweight Regex Fallback
        entities = []
        text_lower = text.lower()
        techs = ["python", "rust", "go", "typescript", "javascript", "react", "fastapi", "sqlite", "faiss", "ollama", "docker", "kubernetes", "pytorch", "tensorflow"]
        companies = ["google", "openai", "meta", "microsoft", "apple", "amazon", "netflix"]
        
        for tech in techs:
            if re.search(rf"\b{tech}\b", text_lower):
                entities.append((tech.capitalize(), "Technology"))
        for comp in companies:
            if re.search(rf"\b{comp}\b", text_lower):
                entities.append((comp.capitalize(), "Company"))
                
        return entities[:8]


# Singleton Instance
entity_extractor = EntityExtractor()
