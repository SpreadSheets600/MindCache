import httpx
import re
from bs4 import BeautifulSoup
from urllib.parse import urlparse

from app.core.exceptions import RedditExtractionError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


class RedditExtractor(ContentExtractor):

    async def extract(self, url: str):
        logger.info(f"RedditExtractor Selected For URL: '{url}'")

        normalized_url = url.strip()

        if normalized_url.endswith(".json"):
            normalized_url = normalized_url[:-5]

        if normalized_url.endswith("/"):
            normalized_url = normalized_url[:-1]

        parsed_url = urlparse(normalized_url)

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

        if any(dom in parsed_url.netloc for dom in ["reddit.com", "redd.it"]):
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

            is_post = "/comments/" in normalized_url

            if is_post:
                title_el = soup.find("a", class_="title")
                title = title_el.get_text().strip() if title_el else "Reddit Post"
                if not title_el and soup.title:
                    title = soup.title.string.replace(" : HeliumBrowserHQ", "").replace(" : ", " - ").strip()

                subreddit = ""
                subreddit_el = soup.find("span", class_="redditname")
                if subreddit_el:
                    subreddit = subreddit_el.get_text().strip().replace("r/", "")
                if not subreddit:
                    match = re.search(r"/r/([^/]+)", normalized_url)
                    if match:
                        subreddit = match.group(1)

                author = "Unknown"
                author_el = soup.find("a", class_="author")
                if author_el:
                    author = author_el.get_text().strip()

                score = 0
                midcol = soup.find("div", class_="midcol")
                if midcol:
                    score_el = midcol.find("div", class_="score unvoted")
                    if score_el:
                        try:
                            score = int(score_el.get_text().strip())
                        except ValueError:
                            pass

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
            logger.info(f"RedditExtractor: old.reddit Parsing Had Issues, Falling Back To GenericExtractor: {e}")
            from app.services.extractors.generic import GenericExtractor

            try:
                generic = GenericExtractor()
                result = await generic.extract(normalized_url)
                result.source_type = "Reddit"
                return result
            except Exception as generic_err:
                raise RedditExtractionError(url, str(generic_err)) from generic_err
