import asyncio
import os
import tempfile
from datetime import datetime
from typing import Any

import httpx
from pypdf import PdfReader

from app.core.exceptions import ContentExtractionError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


def parse_pdf_date(date_str: str) -> datetime | None:
    if not date_str:
        return None
    # PDF date formats look like D:20160216125042-08'00' or "2015"
    date_str = date_str.replace("D:", "")
    try:
        if len(date_str) >= 8 and date_str[:8].isdigit():
            return datetime.strptime(date_str[:8], "%Y%m%d")
        if len(date_str) >= 4 and date_str[:4].isdigit():
            return datetime.strptime(date_str[:4], "%Y")
    except Exception:
        pass
    return None


def is_generic_title(title: str | None) -> bool:
    if not title:
        return True
    title_lower = title.strip().lower()
    return title_lower in ("abstract", "introduction", "title", "document", "untitled", "draft", "preprint")


def extract_title_from_pdf_text(page_text: str) -> str | None:
    if not page_text:
        return None
    lines = [line.strip() for line in page_text.splitlines() if line.strip()]
    ignore_keywords = [
        "permission",
        "attribution",
        "reproduce",
        "journalistic",
        "scholarly",
        "arxiv:",
        "abstract",
        "downloaded from",
        "proceedings of",
        "conference on",
        "ieee",
        "acm",
        "springer",
        "elsevier",
    ]
    for line in lines[:15]:
        line_lower = line.lower()
        if "@" in line or "http" in line:
            continue
        if any(kw in line_lower for kw in ignore_keywords):
            continue
        if any(char in line for char in ["∗", "†", "‡"]):
            continue
        if 8 <= len(line) <= 120:
            return line
    return None


class PDFExtractor(ContentExtractor):
    """Extractor for PDF documents using @pspdfkit/pdf-to-markdown and pypdf metadata extraction."""

    async def extract(self, url: str) -> ExtractionResult:
        logger.info(f"PDFExtractor Selected For URL: '{url}'")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "application/pdf,*/*",
        }

        # 1. Download PDF bytes
        pdf_bytes = None
        final_url = url
        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                response.raise_for_status()
                pdf_bytes = response.content
                final_url = str(response.url)
        except Exception as httpx_err:
            logger.warning(f"httpx download failed for PDF '{url}': {httpx_err}. Retrying with urllib fallback.")
            try:
                import urllib.request

                def _urllib_download() -> tuple[bytes, str]:
                    req = urllib.request.Request(url, headers=headers)
                    with urllib.request.urlopen(req, timeout=30.0) as resp:
                        return resp.read(), resp.url

                pdf_bytes, final_url = await asyncio.to_thread(_urllib_download)
            except Exception as urllib_err:
                logger.error(f"Failed to download PDF '{url}' via both httpx and urllib", exc_info=True)
                raise ContentExtractionError(url, "Network request failed for PDF") from urllib_err

        if not pdf_bytes:
            raise ContentExtractionError(url, "Downloaded PDF bytes are empty.")

        # 2. Write to a temporary file
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temp_pdf:
            temp_pdf.write(pdf_bytes)
            temp_pdf_path = temp_pdf.name

        try:
            # 3. Read metadata and first page text with pypdf in worker thread
            meta = {}
            title = None
            author = None
            published_date = None
            try:

                def _read_meta_and_first_page_text() -> tuple[Any, str]:
                    reader = PdfReader(temp_pdf_path)
                    first_page_text = ""
                    if reader.pages:
                        try:
                            first_page_text = reader.pages[0].extract_text() or ""
                        except Exception:
                            pass
                    return reader.metadata, first_page_text

                meta_raw, first_page_text = await asyncio.to_thread(_read_meta_and_first_page_text)
                if meta_raw:
                    meta = {k.lstrip("/"): str(v) for k, v in meta_raw.items()}
                    title = meta.get("Title")
                    author = meta.get("Author")
                    date_val = (
                        meta.get("Published")
                        or meta.get("Date")
                        or meta.get("Created")
                        or meta.get("CreationDate")
                        or meta.get("ModDate")
                    )
                    if date_val:
                        published_date = parse_pdf_date(date_val)

                # Attempt to extract title from first page text if metadata title is missing/generic
                if not title or is_generic_title(title):
                    extracted_title = extract_title_from_pdf_text(first_page_text)
                    if extracted_title:
                        title = extracted_title
            except Exception as meta_err:
                logger.warning(f"Failed to extract PDF metadata: {meta_err}")

            # 4. Convert PDF to Markdown using @pspdfkit/pdf-to-markdown via npx
            cmd = ["npx", "-y", "@pspdfkit/pdf-to-markdown", temp_pdf_path]
            process = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                stderr_str = stderr.decode(errors="ignore")
                logger.error(f"pdf-to-markdown failed with exit code {process.returncode}: {stderr_str}")
                raise ContentExtractionError(url, f"PDF to Markdown conversion failed: {stderr_str}")

            markdown_content = stdout.decode("utf-8", errors="ignore").strip()

            if not markdown_content:
                raise ContentExtractionError(url, "Converted markdown content is empty.")

            # Fallback title from markdown headers (making sure they aren't generic section headers)
            if not title or is_generic_title(title):
                for line in markdown_content.splitlines():
                    line_stripped = line.strip()
                    if line_stripped.startswith("# "):
                        candidate = line_stripped.lstrip("# ").strip()
                        if not is_generic_title(candidate):
                            title = candidate
                            break
                    elif line_stripped.startswith("## "):
                        candidate = line_stripped.lstrip("# ").strip()
                        if not is_generic_title(candidate):
                            title = candidate
                            break

            # Fallback title from filename
            if not title or is_generic_title(title):
                from urllib.parse import urlparse

                path = urlparse(url).path
                filename = os.path.basename(path)
                if filename:
                    title = os.path.splitext(filename)[0].replace("-", " ").replace("_", " ").title()

            logger.info(f"PDFExtractor: Successfully extracted markdown from PDF. Title: '{title}'")
            return ExtractionResult(
                content=markdown_content,
                title=title,
                author=author,
                published_date=published_date,
                source_type="PDF",
                platform_metadata=meta,
                final_url=final_url,
            )

        finally:
            if os.path.exists(temp_pdf_path):
                try:
                    os.remove(temp_pdf_path)
                except Exception as e:
                    logger.warning(f"Failed to delete temp file {temp_pdf_path}: {e}")
