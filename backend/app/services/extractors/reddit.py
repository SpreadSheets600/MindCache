import httpx
import re
from bs4 import BeautifulSoup
from typing import Any, Optional
from urllib.parse import urlparse

from app.core.exceptions import RedditExtractionError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


class RedditExtractor(ContentExtractor):
    """Platform-Specific Extractor For Reddit (Posts, Subreddits, And Comments) Via old.reddit.com."""

    async def extract(self, url: str) -> ExtractionResult:
        logger.info(f"RedditExtractor Selected For URL: '{url}'")

        # Normalize Reddit URL To old.reddit.com To Bypass Cloudflare Captchas And Rate-Limits
        normalized_url = url.strip()

        # Remove Trailing .json If User/Extension Sent It
        if normalized_url.endswith(".json"):
            normalized_url = normalized_url[:-5]

        # Strip Trailing Slash
        if normalized_url.endswith("/"):
            normalized_url = normalized_url[:-1]

        parsed_url = urlparse(normalized_url)

        # Handle redd.it Short URL Redirection First
        if "redd.it" in parsed_url.netloc:
            try:
                async with httpx.AsyncClient(timeout=5.0, follow_redirects=False) as client:
                    response = await client.get(normalized_url)
                    location = response.headers.get("Location")
                    if location:
                        normalized_url = location
                        parsed_url = urlparse(normalized_url)
            except Exception as redirect_err:
                logger.warning(f"RedditExtractor: Failed To Resolve redd.it Redirect: {redirect_err}")

        # Replace Domain With old.reddit.com
        if any(dom in parsed_url.netloc for dom in ["reddit.com", "redd.it"]):
            # Replace Netloc To old.reddit.com
            new_netloc = "old.reddit.com"
            normalized_url = parsed_url._replace(netloc=new_netloc).geturl()

        logger.info(f"RedditExtractor: Normalized URL For Scraping: '{normalized_url}'")

        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
        }

        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(normalized_url, headers=headers)
                response.raise_for_status()
                html_content = response.text

            soup = BeautifulSoup(html_content, "html.parser")

            # Check If This Is A Post Page (Contains /comments/) Or Listing Feed
            is_post = "/comments/" in normalized_url

            if is_post:
                # 1. Title
                title_el = soup.find("a", class_="title")
                title = title_el.get_text().strip() if title_el else "Reddit Post"
                if not title_el and soup.title:
                    title = soup.title.string.replace(" : HeliumBrowserHQ", "").replace(" : ", " - ").strip()

                # 2. Subreddit
                subreddit = ""
                subreddit_el = soup.find("span", class_="redditname")
                if subreddit_el:
                    subreddit = subreddit_el.get_text().strip().replace("r/", "")
                if not subreddit:
                    # Fallback From URL
                    match = re.search(r"/r/([^/]+)", normalized_url)
                    if match:
                        subreddit = match.group(1)

                # 3. Author
                author = "Unknown"
                # Locate Author Inside The Post Tag Or Tagline
                author_el = soup.find("a", class_="author")
                if author_el:
                    author = author_el.get_text().strip()

                # 4. Score
                score = 0
                # Try To Locate Score Within The Post Thing's Midcol
                midcol = soup.find("div", class_="midcol")
                if midcol:
                    score_el = midcol.find("div", class_="score unvoted")
                    if score_el:
                        try:
                            score = int(score_el.get_text().strip())
                        except ValueError:
                            pass

                # 5. Post Content (Selftext)
                content_text = ""
                site_table = soup.find("div", id="siteTable")
                if site_table:
                    post_entry = site_table.find("div", class_="entry")
                    if post_entry:
                        usertext = post_entry.find("div", class_="usertext-body")
                        if usertext:
                            content_text = usertext.get_text().strip()

                content_parts = []
                content_parts.append(f"Subreddit: r/{subreddit}")
                content_parts.append(f"Title: {title}")
                content_parts.append(f"Author: u/{author}")
                content_parts.append(f"Upvotes: {score}")

                if content_text:
                    content_parts.append(f"Post Content:\n{content_text}")

                # 6. Comments (Up To 10 Top Comments)
                comment_divs = soup.find_all("div", class_="comment")
                comments_list = []
                for comment in comment_divs[:10]:
                    c_author_el = comment.find("a", class_="author")
                    c_author = c_author_el.get_text().strip() if c_author_el else "Unknown"
                    if c_author == "Unknown":
                        continue

                    c_body_el = comment.find("div", class_="usertext-body")
                    c_body = c_body_el.get_text().strip() if c_body_el else ""
                    if not c_body:
                        continue

                    # Extract Score
                    c_score = "0 points"
                    c_score_el = (
                        comment.find("span", class_="score unvoted")
                        or comment.find("span", class_="score dislikes")
                        or comment.find("span", class_="score likes")
                    )
                    if c_score_el:
                        c_score = c_score_el.get_text().strip()

                    comments_list.append(f"- u/{c_author} ({c_score}): {c_body}")

                if comments_list:
                    content_parts.append("Top Discussion Comments:\n" + "\n".join(comments_list))

                unified_content = "\n\n".join(content_parts)

                # Get Comments Count
                num_comments = 0
                comments_link = soup.find("a", class_="comments")
                if comments_link:
                    comments_text = comments_link.get_text()
                    num_match = re.search(r"(\d+)", comments_text)
                    if num_match:
                        num_comments = int(num_match.group(1))

                logger.info(f"RedditExtractor: Post Successfully Parsed For u/{author} In r/{subreddit}")
                return ExtractionResult(
                    content=unified_content,
                    title=title,
                    author=author,
                    source_type="Reddit",
                    platform_metadata={
                        "subreddit": subreddit,
                        "author": author,
                        "score": score,
                        "num_comments": num_comments,
                    },
                )

            else:
                # Subreddit Listing Feed
                things = soup.find_all("div", class_="thing")
                content_parts = ["Reddit Listing Feed:\n"]
                for thing in things[:15]:
                    p_title_el = thing.find("a", class_="title")
                    if not p_title_el:
                        continue
                    p_title = p_title_el.get_text().strip()
                    p_url = p_title_el.get("href", "")
                    if p_url.startswith("/"):
                        p_url = f"https://old.reddit.com{p_url}"

                    p_subreddit = thing.get("data-subreddit", "")
                    if not p_subreddit:
                        p_subreddit_el = thing.find("a", class_="subreddit")
                        if p_subreddit_el:
                            p_subreddit = p_subreddit_el.get_text().strip()

                    content_parts.append(f"- r/{p_subreddit} | {p_title} ({p_url})")

                unified_content = "\n".join(content_parts)
                logger.info("RedditExtractor: Subreddit/Feed Listing Parsed Successfully.")
                return ExtractionResult(
                    content=unified_content,
                    title="Reddit Feed Listing",
                    source_type="Reddit",
                    platform_metadata={},
                )

        except Exception as e:
            # Fall Back To GenericExtractor For HTML Page Parsing
            logger.info(f"RedditExtractor: old.reddit Parsing Had Issues, Falling Back To GenericExtractor: {e}")
            from app.services.extractors.generic import GenericExtractor

            try:
                generic = GenericExtractor()
                result = await generic.extract(normalized_url)
                # Override source_type To Be "Reddit" For Consistency In Dashboard
                result.source_type = "Reddit"
                return result
            except Exception as generic_err:
                raise RedditExtractionError(url, str(generic_err)) from generic_err
