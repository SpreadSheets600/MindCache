import asyncio
import re
from datetime import datetime
from typing import Optional

import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.core.exceptions import ContentExtractionError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


class GenericExtractor(ContentExtractor):
    """Fallback Extractor For Standard Websites Using Trafilatura And BeautifulSoup."""

    def _fallback_extract(self, html: str) -> tuple[str, Optional[str]]:  # noqa: UP045
        """Fallback Content Extractor Using BeautifulSoup When Trafilatura Fails."""
        try:
            soup = BeautifulSoup(html, "html.parser")
            title = soup.title.string.strip() if soup.title and soup.title.string else None

            # Remove Non-Text Elements
            for tag in soup(["script", "style", "noscript", "iframe", "svg", "meta"]):
                tag.decompose()

            text = soup.get_text(separator=" ")
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            clean_text = " ".join(chunk for chunk in chunks if chunk)
            clean_text = re.sub(r"\s+", " ", clean_text).strip()

            return clean_text, title
        except Exception as e:
            logger.error(f"GenericExtractor: BeautifulSoup Fallback Extraction Failed: {e}", exc_info=True)
            return "", None

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:  # noqa: UP045
        """Parses ISO Date String From Trafilatura Metadata."""
        if not date_str:
            return None
        try:
            clean_date = date_str.split("T")[0]
            return datetime.strptime(clean_date, "%Y-%m-%d")
        except Exception:
            try:
                return datetime.fromisoformat(date_str)
            except Exception:
                logger.debug(f"GenericExtractor: Failed To Parse Publication Date: {date_str}")
                return None

    def _extract_sync(
        self, html_content: str, url: str
    ) -> tuple[Optional[str], Optional[str], Optional[datetime], str, str, str, str, str]:
        from app.services.document_processor import document_processor

        title = None
        author = None
        published_date = None
        desc = ""
        kws = ""
        headings = ""
        schema_data = ""

        # Use BeautifulSoup to parse structural metadata for extra context
        try:
            soup = BeautifulSoup(html_content, "html.parser")

            # 1. Title
            title_tag = soup.title.string.strip() if soup.title and soup.title.string else None
            og_title = soup.find("meta", {"property": "og:title"})
            title = (og_title["content"].strip() if og_title and og_title.get("content") else None) or title_tag

            # 2. Meta Description
            meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find(
                "meta", attrs={"property": "og:description"}
            )
            desc = meta_desc["content"].strip() if meta_desc and meta_desc.get("content") else ""

            # 3. Keywords
            meta_kws = soup.find("meta", attrs={"name": "keywords"})
            kws = meta_kws["content"].strip() if meta_kws and meta_kws.get("content") else ""

            # 4. Headings
            headings_list = [h.get_text().strip() for h in soup.find_all(["h1", "h2", "h3"]) if h.get_text().strip()]
            headings = " | ".join(headings_list) if headings_list else ""

            # 5. Schema JSON-LD Data
            try:
                json_ld_scripts = soup.find_all("script", type="application/ld+json")
                schema_list = []
                for script in json_ld_scripts:
                    if script.string:
                        cleaned = re.sub(r"\s+", " ", script.string.strip())
                        if cleaned:
                            schema_list.append(cleaned[:500])
                schema_data = " | ".join(schema_list) if schema_list else ""
            except Exception:
                pass

        except Exception as e:
            logger.warning(f"GenericExtractor: BeautifulSoup metadata extraction had issues: {e}")

        # Use Trafilatura for the main article content
        trafilatura_text = ""
        try:
            trafilatura_text = trafilatura.extract(html_content, no_fallback=True) or ""
            metadata = trafilatura.extract_metadata(html_content)
            if metadata:
                if not title:
                    title = metadata.title
                author = metadata.author
                published_date = document_processor._parse_date(metadata.date)
        except Exception as e:
            logger.warning(f"GenericExtractor: Trafilatura Extraction had issues for {url}: {e}")

        # Fallback to BeautifulSoup structural markdown if Trafilatura is empty
        main_content = trafilatura_text.strip()
        if not main_content:
            logger.info(
                f"GenericExtractor: Trafilatura returned empty. Falling back to BS4 structural parsing for {url}."
            )
            fallback_text, bs_title = document_processor._fallback_extract(html_content)
            main_content = fallback_text
            if not title:
                title = bs_title

        return title, author, published_date, desc, kws, headings, schema_data, main_content

    async def extract(self, url: str) -> ExtractionResult:
        """Downloads and extracts webpage contents using a rich Trafilatura + BeautifulSoup combined pipeline."""
        logger.info(f"GenericExtractor Selected For URL: '{url}'")
        from app.services.document_processor import document_processor

        html_content = await document_processor._download_page(url)

        # Run heavy HTML parsing and extraction in a worker thread
        (
            title,
            author,
            published_date,
            desc,
            kws,
            headings,
            schema_data,
            main_content,
        ) = await asyncio.to_thread(self._extract_sync, html_content, url)

        if not main_content.strip():
            logger.error(f"GenericExtractor: Extraction Failed Completely for {url}")
            raise ContentExtractionError(url, "Webpage has no parseable text content.")

        # Combine Trafilatura and BS4 structural metadata into a highly searchable payload
        combined_parts = []
        if title:
            combined_parts.append(f"Title: {title}")
        if desc:
            combined_parts.append(f"Meta Description: {desc}")
        if kws:
            combined_parts.append(f"Keywords: {kws}")
        if headings:
            combined_parts.append(f"Headings: {headings}")
        if schema_data:
            combined_parts.append(f"Schema Data: {schema_data}")
        combined_parts.append(f"Main Content:\n{main_content}")

        searchable_content = "\n\n".join(combined_parts)

        logger.info(f"GenericExtractor: Extraction Success For URL: '{url}'")
        return ExtractionResult(
            content=searchable_content,
            title=title,
            author=author,
            published_date=published_date,
            source_type="Generic",
            platform_metadata={},
        )
