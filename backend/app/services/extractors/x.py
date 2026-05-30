import httpx
from bs4 import BeautifulSoup

from app.core.exceptions import XExtractionError
from app.services.extractors.base import ContentExtractor, ExtractionResult


class XExtractor(ContentExtractor):
    """Platform-Specific Extractor For X (Twitter)."""

    async def extract(self, url: str) -> ExtractionResult:
        # Convert Standard X/Twitter Domain To Fixupx.com
        fixupx_url = url.replace("x.com", "fixupx.com").replace("twitter.com", "fixupx.com")

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(fixupx_url)
                response.raise_for_status()
                html = response.text

            soup = BeautifulSoup(html, "html.parser")

            title = soup.find("meta", {"property": "og:title"})
            description = soup.find("meta", {"property": "og:description"})

            return ExtractionResult(
                content=description["content"] if description else "",
                title=title["content"] if title else "",
                source_type="X",
            )
        except Exception as e:
            raise XExtractionError(url, str(e)) from e
