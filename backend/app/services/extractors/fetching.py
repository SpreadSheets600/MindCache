import asyncio
import re
import urllib.request
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.core.exceptions import ContentExtractionError
from app.core.logging import get_logger

logger = get_logger(__name__)

DEFAULT_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
DOWNLOAD_TIMEOUT_SECONDS = 10.0

_TEXT_BLOCK_TAGS = ("h1", "h2", "h3", "h4", "p", "ul", "ol", "pre", "table")
_REMOVED_TAGS = ("script", "style", "noscript", "iframe", "svg", "meta", "nav", "footer", "header")


async def download_html(url: str, *, timeout: float = DOWNLOAD_TIMEOUT_SECONDS):
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            response = await client.get(url, headers=DEFAULT_HEADERS)
            response.raise_for_status()
            return response.text, str(response.url)
    except (httpx.HTTPError, ValueError) as httpx_error:
        logger.warning("httpx download failed for %s: %s; retrying with urllib", url, httpx_error)

    try:
        return await asyncio.to_thread(_download_with_urllib, url, timeout)
    except (OSError, UnicodeError, ValueError) as urllib_error:
        raise ContentExtractionError(
            url, f"network request failed via httpx and urllib ({urllib_error})"
        ) from urllib_error


def _download_with_urllib(url: str, timeout: float):
    request = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        charset = _charset_from_header(response.headers.get("Content-Type", ""))
        return response.read().decode(charset, errors="ignore"), str(response.url)


def _charset_from_header(content_type: str):
    if "charset=" not in content_type:
        return "utf-8"
    return content_type.split("charset=")[-1].strip() or "utf-8"


def extract_html_fallback(html: str):
    try:
        soup = BeautifulSoup(html, "html.parser")
        title = soup.title.string.strip() if soup.title and soup.title.string else None
        description = _meta_content(soup, "description") or _meta_content(soup, "og:description")
        keywords = _meta_content(soup, "keywords")
        for tag in soup(_REMOVED_TAGS):
            tag.decompose()

        parts: list[str] = []
        if description:
            parts.append(f"Description: {description}")
        if keywords:
            parts.append(f"Keywords: {keywords}")
        for element in soup.find_all(list(_TEXT_BLOCK_TAGS)):
            parts.extend(_render_block(element))
        clean_text = re.sub(r"\n{3,}", "\n\n", "\n\n".join(parts)).strip()
        if not clean_text:
            clean_text = re.sub(r"\s+", " ", soup.get_text()).strip()
        return clean_text, title
    except (AssertionError, ValueError) as error:
        logger.warning("HTML fallback extraction failed: %s", error)
        return "", None


def _meta_content(soup: BeautifulSoup, name: str):
    tag = soup.find("meta", attrs={"name": name}) or soup.find("meta", attrs={"property": name})
    content = tag.get("content") if tag else None
    return str(content).strip() if content else ""


def _render_block(element: object):
    tag_name = getattr(element, "name", "")
    if tag_name in {"h1", "h2", "h3", "h4"}:
        level = int(tag_name[1])
        return [f"{'#' * level} {element.get_text().strip()}"]
    if tag_name == "p":
        text = element.get_text().strip()
        return [text] if text else []
    if tag_name in {"ul", "ol"}:
        items = [
            f"- {item.get_text().strip()}"
            for item in element.find_all("li")
            if item.get_text().strip()
        ]
        return ["\n".join(items)] if items else []
    if tag_name == "pre":
        code = element.get_text().strip()
        return [f"```\n{code}\n```"] if code else []
    if tag_name == "table":
        rows = [
            " | ".join(cell.get_text().strip() for cell in row.find_all(["td", "th"]))
            for row in element.find_all("tr")
        ]
        rows = [row for row in rows if row]
        return ["\n".join(rows)] if rows else []
    return []


def url_hostname(url: str):
    hostname = (urlparse(url).hostname or "").lower()
    return hostname.removeprefix("www.")
