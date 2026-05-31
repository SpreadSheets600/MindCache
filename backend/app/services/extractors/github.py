import re
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

from app.core.exceptions import GitHubExtractionError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


def parse_github_url(url: str) -> tuple[Optional[str], Optional[str]]:
    """Extracts the owner and repository name from a GitHub URL."""
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        parts = path.split("/")
        if len(parts) >= 2:
            owner = parts[0]
            repo = parts[1].split("?")[0]
            # Exclude special pages/usernames if they are not repos
            if owner.lower() in ("trending", "features", "about", "marketplace", "login", "join", "search", "explore"):
                return None, None
            return owner, repo
    except Exception as e:
        logger.warning(f"GitHubExtractor: Failed to parse GitHub URL '{url}': {e}")
    return None, None


class GitHubExtractor(ContentExtractor):
    """Platform-Specific Extractor For GitHub Repositories.

    Extracts Repository Name, Description, Topics, and README Content.
    Prioritizes repository metadata and falls back gracefully.
    """

    async def extract(self, url: str) -> ExtractionResult:
        """Extracts GitHub repository metadata and README."""
        logger.info(f"GitHubExtractor Selected For URL: '{url}'")

        owner, repo = parse_github_url(url)

        if not owner or not repo:
            logger.warning(f"GitHubExtractor: Failed to parse owner/repo from '{url}'. Falling back.")
            return ExtractionResult(
                content=f"GitHub Link: {url}",
                title="GitHub Page",
                source_type="GitHub",
                platform_metadata={"url": url, "partial_extraction": True},
            )

        description = ""
        topics = []
        readme_content = ""
        partial_extraction = False
        stars_count = 0

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        }

        # Step 1: Download repo homepage
        repo_homepage_url = f"https://github.com/{owner}/{repo}"
        html_content = ""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(repo_homepage_url, headers=headers)
                if response.status_code == 200:
                    html_content = response.text
                else:
                    logger.warning(
                        f"GitHubExtractor: Scraper received status code {response.status_code} for {repo_homepage_url}"
                    )
                    partial_extraction = True
        except Exception as e:
            logger.warning(f"GitHubExtractor: Failed to fetch homepage: {e}")
            partial_extraction = True

        if html_content:
            soup = BeautifulSoup(html_content, "html.parser")

            # Extract description
            # 1. From meta tag
            meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find(
                "meta", attrs={"property": "og:description"}
            )
            if meta_desc and meta_desc.get("content"):
                description = meta_desc["content"].strip()
                # Clean up generic GitHub boilerplate in description if present
                description = re.sub(
                    r"^Contribute to [\w-]+/[\w-]+ development by creating an account on GitHub\.$",
                    "",
                    description,
                    flags=re.IGNORECASE,
                ).strip()

            # 2. Refined sidebar selector if meta description is generic/empty
            sidebar_desc_el = soup.select_one(".f4.my-3") or soup.select_one("p.f4")
            if sidebar_desc_el:
                sidebar_text = sidebar_desc_el.get_text().strip()
                if sidebar_text:
                    description = sidebar_text

            # Extract Topics
            topic_tags = soup.select("a.topic-tag") or soup.select('a[href*="/topics/"]')
            seen_topics = set()
            for tag in topic_tags:
                tag_text = tag.get_text().strip()
                if tag_text and tag_text not in seen_topics:
                    topics.append(tag_text)
                    seen_topics.add(tag_text)

            # Extract Stars count
            stars_el = soup.find(id="repo-stars-counter-star") or soup.select_one("span.Counter.js-social-count") or soup.select_one("#repo-stars-counter-star")
            if stars_el:
                stars_title = stars_el.get("title") or stars_el.get_text()
                stars_str = str(stars_title).replace(",", "").strip()
                try:
                    if stars_str.lower().endswith("k"):
                        stars_count = int(float(stars_str.lower().replace("k", "")) * 1000)
                    else:
                        stars_count = int(stars_str)
                except ValueError:
                    stars_count = 0

            # Extract Rendered README from page if available (extremely reliable and fast)
            readme_el = soup.select_one("article.markdown-body") or soup.find(id="readme")
            if readme_el:
                # Remove script and style tags inside the readme
                for tag in readme_el(["script", "style"]):
                    tag.decompose()
                readme_content = readme_el.get_text(separator="\n").strip()

        # Step 2: Fallback to fetching raw README if not found in homepage HTML
        if not readme_content and not partial_extraction:
            # Attempt to download raw README from raw.githubusercontent.com
            # We try main branch first, then master
            for branch in ("main", "master"):
                raw_readme_url = f"https://raw.githubusercontent.com/{owner}/{repo}/refs/heads/{branch}/README.md"
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        response = await client.get(raw_readme_url)
                        if response.status_code == 200 and response.text.strip():
                            readme_content = response.text.strip()
                            logger.info(f"GitHubExtractor: README successfully retrieved from raw branch '{branch}'")
                            break
                except Exception as e:
                    logger.debug(f"GitHubExtractor: Failed to fetch raw README for branch {branch}: {e}")

        # Construct final searchable content blob prioritizing metadata
        content_parts = []
        content_parts.append(f"Repository: {owner}/{repo}")
        if description:
            content_parts.append(f"Description: {description}")
        if topics:
            content_parts.append(f"Topics: {', '.join(topics)}")

        if readme_content:
            # Trim README to prevent context explosion, keeping a substantial snippet
            content_parts.append(f"README Content:\n{readme_content[:15000]}")
        elif html_content:
            # As a ultimate fallback, extract main content text from the html
            soup_clean = BeautifulSoup(html_content, "html.parser")
            for tag in soup_clean(["script", "style", "noscript", "iframe", "svg", "meta", "header", "footer"]):
                tag.decompose()
            text = soup_clean.get_text(separator=" ")
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            clean_text = " ".join(chunk for chunk in chunks if chunk)
            clean_text = re.sub(r"\s+", " ", clean_text).strip()
            content_parts.append(clean_text[:5000])

        unified_content = "\n\n".join(content_parts)
        title = f"{owner}/{repo}"

        platform_metadata = {
            "owner": owner,
            "repo_name": repo,
            "description": description,
            "topics": topics,
            "stars": stars_count,
            "readme_available": bool(readme_content),
            "partial_extraction": partial_extraction,
        }

        return ExtractionResult(
            content=unified_content,
            title=title,
            author=owner,
            published_date=None,  # GitHub repo metadata doesn't easily have a single pub date
            source_type="GitHub",
            platform_metadata=platform_metadata,
        )
