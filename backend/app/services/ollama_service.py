from typing import Optional

import httpx

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaService:
    """Service To Communicate With Local Ollama Instance For Optional Document Summarization And Synthesis."""

    def __init__(self) -> None:
        self.base_url: str = settings.OLLAMA_BASE_URL.rstrip("/")
        self.model: str = settings.OLLAMA_MODEL

    async def check_health(self) -> bool:
        """Checks If Local Ollama Service Is Reachable And Has The Required Model Loaded."""

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                response = await client.get(f"{self.base_url}/api/tags")

                if response.status_code != 200:
                    return False

                # Check If The Configured Model Is Installed
                data = response.json()
                models = [m.get("name") for m in data.get("models", [])]

                # Match Name Exactly Or By Prefix (E.G., 'Llama3:Latest' Or 'Llama3')
                has_model = any(self.model in m or m in self.model for m in models)

                if not has_model:
                    logger.warning(
                        f"Ollama Is Running, But Configured Model '{self.model}' Was Not Found In Installed Models: {models}."
                    )

                return True

        except Exception as e:
            logger.debug(f"Ollama Connection Check Failed (Is It Running?): {e}")
            return False

    async def generate_summary(self, document_text: str) -> Optional[str]:  # noqa: UP045
        """Generates A Summary Of A Single Document."""

        if not document_text.strip():
            return None

        prompt = (
            f"Please generate a concise, 2-3 sentence summary of the following web page content. "
            f"Focus on the primary topic, key takeaways, and facts. Avoid introductory filler.\n\n"
            f"Content:\n{document_text[:4000]}"
        )

        try:
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
                    return response.json().get("response", "").strip()

                else:
                    logger.warning(f"Ollama Returned Status Code {response.status_code}: {response.text}")
                    return None

        except Exception as e:
            logger.warning(f"Ollama Summary Generation Failed: {e}")
            return None

    async def generate_collective_summary(self, query: str, results: list[dict]) -> Optional[str]:  # noqa: UP045
        """Generates A Synthesis/Summary Of Multiple Search Results Answering A Natural Language Query."""

        if not results:
            return "No matching search results to summarize."

        context_items = []

        for i, item in enumerate(results, 1):
            title = item.get("title") or "Untitled Webpage"
            url = item.get("url", "")
            snippet = item.get("extracted_content", "")[:800]
            context_items.append(
                f"Document [{i}]: {title}\nURL: {url}\nContent Snippet: {snippet}\n---"
            )

        context_block = "\n".join(context_items)

        prompt = (
            f"[System Instructions]\n"
            f"You are the user's personal browser memory engine. Answer the user's query directly, factually, and cohesively using ONLY the provided context of pages they visited.\n"
            f"RULES:\n"
            f"1. Do NOT use meta-language or introductory fluff (e.g. 'Based on the context...', 'The user is asking...', 'Here are the excerpts...'). Start answering the question immediately in the first sentence.\n"
            f"2. Write in a clean, human, and professional tone. Avoid typical AI boilerplate, bulleted list formats, or recitation of raw source files. Synthesize the findings into 1-2 cohesive paragraphs.\n"
            f"3. Cite specific sources by number (e.g., [1], [2]) seamlessly at the end of relevant sentences.\n"
            f"4. If the provided pages do not contain enough facts to fully answer, state what you *do* know clearly and stop, without guessing or hallucinating.\n\n"
            f"[User Query]\n"
            f"'{query}'\n\n"
            f"[Visited Pages Context]\n"
            f"{context_block}\n\n"
            f"[Cohesive Answer]"
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": self.model,
                        "prompt": prompt,
                        "stream": False,
                    },
                )

                if response.status_code == 200:
                    return response.json().get("response", "").strip()

                else:
                    logger.warning(f"Ollama Collective Synthesis Returned Status {response.status_code}: {response.text}")
                    return f"Collective summary generation failed (Ollama status: {response.status_code})."

        except Exception as e:
            logger.warning(f"Ollama Collective Summary Generation Failed: {e}")
            return "Collective summary unavailable. (Is local Ollama running?)"


# Singleton Instance
ollama_service = OllamaService()
