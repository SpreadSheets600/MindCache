import re
from datetime import UTC, datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ContentExtractionError, InvalidURLError
from app.core.logging import get_logger
from app.models.document import Document
from app.repositories.document_repository import document_repository
from app.services.bm25_service import bm25_service
from app.services.embedding_service import embedding_service
from app.services.extractors import ExtractorFactory
from app.services.keyword_extractor import keyword_extractor
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service

logger = get_logger(__name__)


class DocumentProcessor:
    """Orchestrates The Entire Asynchronous Page Fetching, Extraction, AI Analysis, And Indexing Pipeline."""

    def _validate_and_parse_url(self, url: str) -> str:
        """Validates That A URL Is Malformed Or Invalid, Returning Its Parsed Domain."""

        parsed = urlparse(url)

        if not parsed.scheme or not parsed.netloc:
            raise InvalidURLError(url, "Missing scheme or domain.")

        if parsed.scheme not in ("http", "https"):
            raise InvalidURLError(url, "Only HTTP and HTTPS protocols are supported.")

        return parsed.netloc

    async def _download_page(self, url: str) -> str:
        """Downloads A Web Page Asynchronously Using Httpx With A Standard User-Agent."""

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                return response.text

        except Exception as e:
            logger.error(f"Failed To Download URL '{url}': {e}", exc_info=True)
            raise ContentExtractionError(url, f"Network Request Failed: {e}") from e

    def _fallback_extract(self, html: str) -> tuple[str, Optional[str]]:  # noqa: UP045
        """Fallback Content Extractor Using BeautifulSoup When Trafilatura Fails.
        
        Performs a rich structural HTML-to-Markdown extraction, preserving headings, lists,
        tables, code blocks, and meta descriptions to optimize search and retrieval.
        """

        try:
            soup = BeautifulSoup(html, "html.parser")

            # Extract Title If Present
            title = soup.title.string.strip() if soup.title and soup.title.string else None

            # Extract meta tags for context preservation
            meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
            desc = meta_desc["content"].strip() if meta_desc and meta_desc.get("content") else ""

            meta_kws = soup.find("meta", attrs={"name": "keywords"})
            kws = meta_kws["content"].strip() if meta_kws and meta_kws.get("content") else ""

            # Remove Non-Content/Navigational Elements
            for tag in soup(["script", "style", "noscript", "iframe", "svg", "meta", "nav", "footer", "header"]):
                tag.decompose()

            content_parts = []

            if desc:
                content_parts.append(f"Description: {desc}")
            if kws:
                content_parts.append(f"Keywords: {kws}")

            # Structure elements into a clean representation
            for element in soup.find_all(["h1", "h2", "h3", "h4", "p", "ul", "ol", "pre", "table"]):
                tag_name = element.name

                if tag_name in ("h1", "h2", "h3", "h4"):
                    level = int(tag_name[1])
                    content_parts.append(f"\n{'#' * level} {element.get_text().strip()}\n")

                elif tag_name == "p":
                    text = element.get_text().strip()
                    if text:
                        content_parts.append(text)

                elif tag_name in ("ul", "ol"):
                    items = [f"- {li.get_text().strip()}" for li in element.find_all("li") if li.get_text().strip()]
                    if items:
                        content_parts.append("\n" + "\n".join(items) + "\n")

                elif tag_name == "pre":
                    code = element.get_text().strip()
                    if code:
                        content_parts.append(f"\n```\n{code}\n```\n")

                elif tag_name == "table":
                    rows = []
                    for tr in element.find_all("tr"):
                        cells = [td.get_text().strip() for td in tr.find_all(["td", "th"])]
                        if cells:
                            rows.append(" | ".join(cells))
                    if rows:
                        content_parts.append("\n" + "\n".join(rows) + "\n")

            # Collapse multi-newlines and spaces
            raw_text = "\n\n".join(content_parts)
            clean_text = re.sub(r"\n{3,}", "\n\n", raw_text).strip()

            # Absolute fallback if no content was matched structurally
            if not clean_text:
                clean_text = re.sub(r"\s+", " ", soup.get_text()).strip()

            return clean_text, title

        except Exception as e:
            logger.error(f"BeautifulSoup Structural Fallback Extraction Failed: {e}", exc_info=True)
            return "", None

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:  # noqa: UP045
        """Parses ISO Date String From Trafilatura Metadata."""

        if not date_str:
            return None

        try:
            # Try to parse full ISO format first (preserves time details if present)
            return datetime.fromisoformat(date_str)
        except Exception:
            try:
                # Trafilatura Dates Are Usually 'YYYY-MM-DD' Or ISO Format
                clean_date = date_str.split("T")[0]
                return datetime.strptime(clean_date, "%Y-%m-%d")
            except Exception:
                logger.debug(f"Failed To Parse Publication Date: {date_str}")
                return None

    async def process_url(self, db: AsyncSession, url: str, title: Optional[str] = None) -> tuple[str, Document]:
        """Runs The Asynchronous Pipeline To Ingest, Extract, Analyze, And Index A Webpage."""

        # 1. Validate URL
        domain = self._validate_and_parse_url(url)
        visited_at = datetime.now(UTC).replace(tzinfo=None)

        # 2. Check For Duplicate In DB
        existing_doc = await document_repository.get_by_url(db, url)

        if existing_doc:
            logger.info(f"URL Already Processed: '{url}'. Recording Visit.")

            # Record A New Visit To History
            await document_repository.add_visit(db, existing_doc.id, visited_at)

            # Update UpdatedAt
            existing_doc.updated_at = visited_at
            await db.commit()

            return "duplicate", existing_doc

        # 3. Select Extractor and Extract Content & Metadata
        logger.info(f"Processing New URL: '{url}'")
        extractor = ExtractorFactory.get_extractor(url)
        extraction_result = await extractor.extract(url)

        extracted_title = extraction_result.title
        title = extracted_title if (extracted_title and extracted_title.strip()) else title
        author = extraction_result.author
        published_date = extraction_result.published_date
        extracted_content = extraction_result.content
        source_type = extraction_result.source_type
        platform_metadata = extraction_result.platform_metadata

        if not extracted_content.strip():
            raise ContentExtractionError(url, "Webpage has no parseable text content.")

        # Limit Content Size For Keyword And Embedding Generation
        trimmed_content = extracted_content[:8000]

        # 6. Extract Keywords Using KeyBERT
        keywords = keyword_extractor.extract_keywords(trimmed_content, top_n=5)

        # 7. Generate Semantic Chunk Embeddings
        # Prepend rich metadata (Title, Domain, Source Type, Keywords) to each chunk to retain global context
        keyword_names = [kw for kw, _ in keywords]
        
        content_to_chunk = extracted_content[:40000]
        chunk_size = 3000
        overlap = 500
        chunks = []
        if len(content_to_chunk) <= chunk_size:
            chunks = [content_to_chunk]
        else:
            start = 0
            while start < len(content_to_chunk):
                end = start + chunk_size
                chunks.append(content_to_chunk[start:end])
                if end >= len(content_to_chunk):
                    break
                start += chunk_size - overlap

        chunk_texts = []
        for i, chunk in enumerate(chunks):
            chunk_text = (
                f"Title: {title or ''}\n\n"
                f"Domain: {domain}\n\n"
                f"Source Type: {source_type}\n\n"
                f"Keywords: {', '.join(keyword_names)}\n\n"
                f"Content (Chunk {i+1}/{len(chunks)}):\n{chunk}"
            )
            chunk_texts.append(chunk_text)

        embeddings = embedding_service.generate_embeddings(chunk_texts)

        # 8. SQLite Save (Document And Keywords)
        doc = await document_repository.create(
            db=db,
            url=url,
            domain=domain,
            title=title,
            author=author,
            published_date=published_date,
            extracted_content=extracted_content,
            source_type=source_type,
            platform_metadata=platform_metadata,
        )

        # Add Keywords And First Visit Record
        await document_repository.add_keywords(db, doc.id, keywords)
        await document_repository.add_visit(db, doc.id, visited_at)

        # Commit To Retrieve Generated Database ID And Finalize Relations
        await db.commit()

        # Refresh To Load Relationships
        await db.refresh(doc)

        # 9. Index Into FAISS And BM25
        vector_service.add_document_chunks(doc.id, embeddings)
        bm25_service.add_document(doc.id, title or "", extracted_content, keyword_names)

        # 10. Generate Ollama Summary (Optional Background/Graceful Summary Addition)
        if await ollama_service.check_health():
            logger.info(f"Ollama Is Online. Generating AI Summary For Document ID {doc.id}...")
            summary = await ollama_service.generate_summary(trimmed_content)

            if summary:
                await document_repository.update_summary(db, doc.id, summary)
                await db.commit()

                # Refresh To Fetch Updated Summary
                await db.refresh(doc)
                logger.info(f"Ollama Summary Saved For Document ID {doc.id}.")

        return "success", doc


# Singleton Instance
document_processor = DocumentProcessor()
