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
from app.services.entity_extractor import entity_extractor
from app.services.keyword_extractor import keyword_extractor
from app.services.ollama_service import ollama_service
from app.services.vector_service import vector_service

logger = get_logger(__name__)


class DocumentProcessor:
    """Orchestrates The Entire Asynchronous Page Fetching, Extraction, AI Analysis, And Indexing Pipeline."""

    @staticmethod
    def calculate_document_quality_score(
        word_count: int,
        source_type: str,
        dwell_time: Optional[float],
        platform_metadata: Optional[dict],
        revisit_count: int = 1,
    ) -> float:
        quality_score = 0.0

        # 1. Dwell time check
        if dwell_time is not None and dwell_time > 60.0:
            quality_score += 2.0

        # 2. Word count check
        if word_count > 500:
            quality_score += 2.0

        # 3. High value document type check
        if source_type in ["PDF", "GitHub", "Documentation"]:
            quality_score += 2.0

        # 4. Transcript availability check
        if platform_metadata and platform_metadata.get("transcript_available"):
            quality_score += 1.0

        # 5. Revisit count check
        if revisit_count > 1:
            quality_score += 1.0

        return quality_score

    def _validate_and_parse_url(self, url: str) -> str:
        """Validates That A URL Is Malformed Or Invalid, Returning Its Parsed Domain."""

        parsed = urlparse(url)

        if not parsed.scheme or not parsed.netloc:
            raise InvalidURLError(url, "Missing scheme or domain.")

        if parsed.scheme not in ("http", "https"):
            raise InvalidURLError(url, "Only HTTP and HTTPS protocols are supported.")

        return parsed.netloc

    @staticmethod
    def _classify_url(url: str) -> dict:
        """Returns basic URL info: hostname, path, parsed."""
        parsed = urlparse(url)
        hostname = (parsed.hostname or "").lower()
        if hostname.startswith("www."):
            hostname = hostname[4:]
        path = parsed.path or ""

        return {
            "hostname": hostname,
            "path": path,
            "parsed": parsed,
        }

    async def _handle_duplicate(
        self, db: AsyncSession, doc: Document, visited_at: datetime, dwell_time: Optional[float]
    ) -> Document:
        """Records a revisit and updates quality score for an existing document."""
        logger.info(f"URL Already Processed: '{doc.url}'. Recording Visit.")
        await document_repository.add_visit(db, doc.id, visited_at)
        revisit_count = len(doc.visits) + 1
        words = (doc.extracted_content or "").split()
        word_count = len(words)
        if dwell_time is not None and dwell_time > 0:
            doc.total_dwell_time = (doc.total_dwell_time or 0.0) + dwell_time
        doc.quality_score = self.calculate_document_quality_score(
            word_count=word_count,
            source_type=doc.source_type,
            dwell_time=dwell_time,
            platform_metadata=doc.platform_metadata,
            revisit_count=revisit_count,
        )
        doc.updated_at = visited_at
        await db.commit()
        return doc

    @staticmethod
    def _chunk_content(content: str, max_length: int = 40000, chunk_size: int = 3000, overlap: int = 500) -> list[str]:
        """Splits content into overlapping chunks."""
        content_to_chunk = content[:max_length]
        if len(content_to_chunk) <= chunk_size:
            return [content_to_chunk]
        chunks = []
        start = 0
        while start < len(content_to_chunk):
            end = start + chunk_size
            chunks.append(content_to_chunk[start:end])
            if end >= len(content_to_chunk):
                break
            start += chunk_size - overlap
        return chunks

    @staticmethod
    def _build_chunk_texts(
        chunks: list[str], title: str, domain: str, source_type: str,
        keyword_names: list[str], entity_names: list[str], meta_str: str,
    ) -> list[str]:
        """Prepends metadata to each chunk for embedding context."""
        chunk_texts = []
        for i, chunk in enumerate(chunks):
            chunk_text = (
                f"Title: {title or ''}\n\n"
                f"Domain: {domain}\n\n"
                f"Source Type: {source_type}\n\n"
                f"Keywords: {', '.join(keyword_names)}\n\n"
                f"Entities: {', '.join(entity_names)}\n\n"
                f"Metadata: {meta_str}\n\n"
                f"Content (Chunk {i+1}/{len(chunks)}):\n{chunk}"
            )
            chunk_texts.append(chunk_text)
        return chunk_texts

    @staticmethod
    def _compute_knowledge_score(word_count: int, unique_words: int, path: str, source_type: Optional[str] = None) -> int:
        """Computes a knowledge signal score for logging purposes."""
        knowledge_score = 0
        if word_count > 300:
            knowledge_score += 2
        if unique_words > 100:
            knowledge_score += 2
        if path and path != "/":
            knowledge_score += 1
        if source_type and source_type.lower() in ["github", "youtube", "reddit", "googlesearch"]:
            knowledge_score += 2
        return knowledge_score

    async def _generate_and_store_index(
        self,
        db: AsyncSession,
        doc: Document,
        extracted_content: str,
        title: str,
        domain: str,
        source_type: str,
        keyword_names: list[str],
        entity_names: list[str],
        platform_metadata: dict,
        visited_at: datetime,
    ) -> None:
        """Chunks content, generates embeddings, indexes into FAISS and BM25, then generates summary."""
        meta_parts = []
        if platform_metadata:
            for k, v in platform_metadata.items():
                if v:
                    meta_parts.append(f"{k.capitalize()}: {v}")
        meta_str = " | ".join(meta_parts)

        chunks = self._chunk_content(extracted_content)
        chunk_texts = self._build_chunk_texts(chunks, title, domain, source_type, keyword_names, entity_names, meta_str)
        embeddings = embedding_service.generate_embeddings(chunk_texts)

        vector_service.add_document_chunks(doc.id, embeddings)
        bm25_service.add_document(doc.id, title or "", extracted_content, keyword_names, platform_metadata)

        trimmed_content = extracted_content[:8000]
        if await ollama_service.check_health():
            logger.info(f"Ollama Is Online. Generating AI Summary For Document ID {doc.id}...")
            summary = await ollama_service.generate_summary(trimmed_content)
            if summary:
                await document_repository.update_summary(db, doc.id, summary)
                await db.commit()
                await db.refresh(doc)
                logger.info(f"Ollama Summary Saved For Document ID {doc.id}.")

    async def _download_page(self, url: str) -> tuple[str, str]:
        """Downloads A Web Page Asynchronously Using Httpx With A Standard User-Agent.
        Returns (html_content, final_url) where final_url is the URL after any redirects."""

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                return response.text, str(response.url)

        except Exception as httpx_err:
            logger.warning(
                f"httpx download failed for '{url}': {httpx_err}. Retrying with urllib fallback."
            )
            try:
                # Fallback to urllib which bypasses TLS JA3 fingerprints checks (e.g. Cloudflare on Medium)
                import urllib.request
                import asyncio

                def _urllib_download():
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=10.0) as resp:
                        content_type = resp.headers.get("Content-Type", "")
                        charset = "utf-8"
                        if "charset=" in content_type:
                            charset = content_type.split("charset=")[-1].strip()
                        final_url = resp.url  # urllib follows redirects and exposes final URL
                        return resp.read().decode(charset, errors="ignore"), final_url

                return await asyncio.to_thread(_urllib_download)
            except Exception as urllib_err:
                logger.error(
                    f"Failed To Download URL '{url}' via both httpx ({httpx_err}) and urllib ({urllib_err})",
                    exc_info=True,
                )
                raise ContentExtractionError(
                    url, f"Network Request Failed (httpx: {httpx_err}, urllib: {urllib_err})"
                ) from urllib_err

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

    async def process_pre_extracted(
        self,
        db: AsyncSession,
        url: str,
        title: Optional[str] = None,
        dwell_time: Optional[float] = None,
        extracted_content: Optional[str] = None,
        extracted_content_html: Optional[str] = None,
        description: Optional[str] = None,
        author: Optional[str] = None,
        site_name: Optional[str] = None,
        published_date: Optional[str] = None,
        language: Optional[str] = None,
        schema_org: Optional[dict] = None,
        meta_tags: Optional[list[dict]] = None,
        keywords: Optional[list[str]] = None,
        highlights: Optional[list[dict]] = None,
        selection: Optional[str] = None,
        selection_html: Optional[str] = None,
    ) -> tuple[str, Optional[Document]]:
        """Processes A Pre-Extracted Page (From Client-Side Defuddle Extraction).

        Skips server-side HTTP download and content extraction entirely.
        Uses the provided content and metadata directly, then proceeds with
        the standard chunking -> keyword/entity extraction -> embeddings -> indexing pipeline.
        """
        domain = self._validate_and_parse_url(url)
        visited_at = datetime.now(UTC).replace(tzinfo=None)

        info = self._classify_url(url)

        existing_doc = await document_repository.get_by_url(db, url)
        if existing_doc:
            await self._handle_duplicate(db, existing_doc, visited_at, dwell_time)
            return "duplicate", existing_doc

        if not extracted_content or not extracted_content.strip():
            logger.warning(f"Pre-extracted content is empty for {url}. Falling back to server-side extraction.")
            return await self.process_url(db, url, title, dwell_time)

        title_from_extraction = title or description or info["parsed"].netloc

        platform_metadata = {}
        if schema_org:
            platform_metadata["schema_org"] = schema_org
        if meta_tags:
            platform_metadata["meta_tags"] = meta_tags
        if highlights:
            platform_metadata["highlights"] = highlights
        if selection:
            platform_metadata["selection"] = selection
        if selection_html:
            platform_metadata["selection_html"] = selection_html
        if language:
            platform_metadata["language"] = language
        if site_name:
            platform_metadata["site_name"] = site_name

        published_dt = self._parse_date(published_date) if published_date else None

        words = extracted_content.split()
        word_count = len(words)
        unique_words = len(set(w.lower() for w in words))
        knowledge_score = self._compute_knowledge_score(word_count, unique_words, info["path"])
        logger.info(f"Content quality score={knowledge_score} (words={word_count}, unique={unique_words}): {url}")

        trimmed_content = extracted_content[:8000]
        extracted_keywords = await keyword_extractor.extract_keywords(trimmed_content, top_n=5)
        entities = await entity_extractor.extract_entities(trimmed_content)
        keyword_names = [kw for kw, _ in extracted_keywords]
        entity_names = [f"{name}:{etype}" for name, etype in entities]

        quality_score = self.calculate_document_quality_score(
            word_count=word_count,
            source_type="Generic",
            dwell_time=dwell_time,
            platform_metadata=platform_metadata,
            revisit_count=1,
        )

        doc = await document_repository.create(
            db=db,
            url=url,
            domain=domain,
            title=title_from_extraction,
            author=author,
            published_date=published_dt,
            extracted_content=extracted_content,
            source_type="Generic",
            platform_metadata=platform_metadata if platform_metadata else None,
            quality_score=quality_score,
            total_dwell_time=dwell_time or 0.0,
        )

        await document_repository.add_keywords(db, doc.id, extracted_keywords)
        await document_repository.add_entities(db, doc.id, entities)
        await document_repository.add_visit(db, doc.id, visited_at)
        await db.commit()
        await db.refresh(doc)

        await self._generate_and_store_index(
            db, doc, extracted_content, title_from_extraction, domain, "Generic",
            keyword_names, entity_names, platform_metadata, visited_at,
        )

        return "success", doc

    async def process_url(
        self,
        db: AsyncSession,
        url: str,
        title: Optional[str] = None,
        dwell_time: Optional[float] = None,
    ) -> tuple[str, Optional[Document]]:
        """Runs The Asynchronous Pipeline To Ingest, Extract, Analyze, And Index A Webpage."""

        domain = self._validate_and_parse_url(url)
        visited_at = datetime.now(UTC).replace(tzinfo=None)

        info = self._classify_url(url)

        existing_doc = await document_repository.get_by_url(db, url)
        if existing_doc:
            await self._handle_duplicate(db, existing_doc, visited_at, dwell_time)
            return "duplicate", existing_doc

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
        final_url = extraction_result.final_url or url

        if final_url != url:
            existing_doc = await document_repository.get_by_url(db, final_url)
            if existing_doc:
                await self._handle_duplicate(db, existing_doc, visited_at, dwell_time)
                return "duplicate", existing_doc

        if not extracted_content.strip():
            raise ContentExtractionError(url, "Webpage has no parseable text content.")

        words = extracted_content.split()
        word_count = len(words)
        unique_words = len(set(w.lower() for w in words))
        knowledge_score = self._compute_knowledge_score(word_count, unique_words, info["path"], source_type)
        logger.info(f"Content quality score={knowledge_score} (words={word_count}, unique={unique_words}): {url}")

        trimmed_content = extracted_content[:8000]
        keywords = await keyword_extractor.extract_keywords(trimmed_content, top_n=5)
        entities = await entity_extractor.extract_entities(trimmed_content)
        keyword_names = [kw for kw, _ in keywords]
        entity_names = [f"{name}:{etype}" for name, etype in entities]

        quality_score = self.calculate_document_quality_score(
            word_count=word_count,
            source_type=source_type,
            dwell_time=dwell_time,
            platform_metadata=platform_metadata,
            revisit_count=1,
        )

        doc = await document_repository.create(
            db=db,
            url=final_url,
            domain=domain,
            title=title,
            author=author,
            published_date=published_date,
            extracted_content=extracted_content,
            source_type=source_type,
            platform_metadata=platform_metadata,
            quality_score=quality_score,
            total_dwell_time=dwell_time or 0.0,
        )

        await document_repository.add_keywords(db, doc.id, keywords)
        await document_repository.add_entities(db, doc.id, entities)
        await document_repository.add_visit(db, doc.id, visited_at)
        await db.commit()
        await db.refresh(doc)

        await self._generate_and_store_index(
            db, doc, extracted_content, title or "", domain, source_type,
            keyword_names, entity_names, platform_metadata, visited_at,
        )

        return "success", doc

    async def reindex_all_documents(self, db: AsyncSession) -> None:
        """Re-generates embeddings and re-indexes all documents in the database."""
        logger.info("Starting re-indexing of all documents due to dimension mismatch...")

        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Document).options(
                selectinload(Document.keywords),
                selectinload(Document.entities)
            )
        )
        documents = list(result.scalars().all())
        logger.info(f"Found {len(documents)} documents to re-index.")

        # Clear BM25 index for full rebuild with enriched metadata
        bm25_service._doc_ids = []
        bm25_service._corpus = []
        bm25_service._index = None

        for doc in documents:
            logger.info(f"Re-indexing document ID {doc.id}: {doc.title or doc.url}")
            keyword_names = [kw.keyword for kw in doc.keywords]
            entity_names = [f"{e.name}:{e.type}" for e in doc.entities]

            meta_parts = []
            if doc.platform_metadata:
                for k, v in doc.platform_metadata.items():
                    if v:
                        meta_parts.append(f"{k.capitalize()}: {v}")
            meta_str = " | ".join(meta_parts)

            chunks = self._chunk_content(doc.extracted_content)
            chunk_texts = self._build_chunk_texts(
                chunks, doc.title or "", doc.domain, doc.source_type,
                keyword_names, entity_names, meta_str,
            )

            try:
                import asyncio
                embeddings = await asyncio.to_thread(embedding_service.generate_embeddings, chunk_texts)
                await asyncio.to_thread(vector_service.add_document_chunks, doc.id, embeddings)
                bm25_service.add_document(doc.id, doc.title or "", doc.extracted_content, keyword_names, doc.platform_metadata)
            except Exception as e:
                logger.error(f"Failed to re-index document {doc.id}: {e}", exc_info=True)

        # Save BM25 index after full rebuild
        bm25_service.save()
        logger.info("Re-indexing of all documents completed.")


# Singleton Instance
document_processor = DocumentProcessor()
