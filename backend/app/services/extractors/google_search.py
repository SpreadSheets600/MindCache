from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup

from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


class GoogleSearchExtractor(ContentExtractor):
    """Platform-Specific Extractor for Google Searches.

    Extracts the search query from the URL and optionally parses the top search results
    from the pre-rendered HTML if accessible.
    """

    async def extract(self, url: str) -> ExtractionResult:
        logger.info(f"GoogleSearchExtractor Selected For URL: '{url}'")

        # 1. Parse query parameter 'q'
        parsed_url = urlparse(url)
        query_params = parse_qs(parsed_url.query)
        search_query = query_params.get("q", [""])[0]

        if not search_query:
            # Fallback checks for other google search params
            search_query = query_params.get("as_q", [""])[0]

        if not search_query:
            search_query = "Google Search"

        search_query = search_query.strip()

        # 2. Attempt to fetch HTML and extract top search results
        results_list = []
        try:
            from app.services.document_processor import document_processor

            html = await document_processor._download_page(url)
            soup = BeautifulSoup(html, "html.parser")

            # Extract h3 tags which typically denote search result headings
            h3_tags = soup.find_all("h3")
            for h3 in h3_tags:
                title = h3.get_text().strip()
                if title:
                    # Find corresponding parent or next link
                    parent = h3.find_parent("a") or h3.find_next("a")
                    link = ""
                    if parent and parent.get("href"):
                        href = parent["href"]
                        if href.startswith("/url?q="):
                            link = parse_qs(urlparse(href).query).get("q", [""])[0]
                        elif href.startswith("http"):
                            link = href

                    if link:
                        results_list.append(f"- {title} ({link})")
                    else:
                        results_list.append(f"- {title}")

            # Keep top 10 search results
            results_list = results_list[:10]
        except Exception as e:
            logger.warning(f"Could not parse live Google search results: {e}. Falling back to query extraction only.")

        # Fallback to DuckDuckGo Search (ddgs) if Google search scraping failed or returned nothing
        if not results_list and search_query and search_query != "Google Search":
            try:
                logger.info(
                    f"GoogleSearchExtractor: Scraping failed or empty. Falling back to DDGS search for query: '{search_query}'"
                )
                import asyncio

                from ddgs import DDGS

                def _ddg_search():
                    with DDGS() as ddgs:
                        return list(ddgs.text(search_query, max_results=5))

                ddg_results = await asyncio.to_thread(_ddg_search)
                for r in ddg_results:
                    title = r.get("title")
                    link = r.get("href")
                    if title and link:
                        results_list.append(f"- {title} ({link})")
                    elif title:
                        results_list.append(f"- {title}")
            except Exception as ddg_err:
                logger.warning(f"GoogleSearchExtractor: DDGS fallback search failed: {ddg_err}")

        # 3. Construct rich content representation
        content_parts = [
            f'User Searched Google For:\n"{search_query}"',
        ]

        if results_list:
            content_parts.append("Top Search Results:\n" + "\n".join(results_list))
        else:
            content_parts.append("Top search results were not pre-rendered or accessible due to network block.")

        content = "\n\n".join(content_parts)

        return ExtractionResult(
            content=content,
            title=f"Google Search: {search_query}",
            source_type="GoogleSearch",
            platform_metadata={
                "search_query": search_query,
                "has_results": len(results_list) > 0,
            },
        )
