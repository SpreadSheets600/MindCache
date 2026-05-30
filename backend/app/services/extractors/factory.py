from urllib.parse import urlparse

from app.services.extractors.base import ContentExtractor
from app.services.extractors.generic import GenericExtractor
from app.services.extractors.github import GitHubExtractor
from app.services.extractors.google_search import GoogleSearchExtractor
from app.services.extractors.reddit import RedditExtractor
from app.services.extractors.x import XExtractor
from app.services.extractors.youtube import YouTubeExtractor


class ExtractorFactory:
    """Centralized Factory Pattern To Select The Appropriate Content Extractor Based On URL Domain.

    This avoids having domain checks scattered across the codebase. Adding new platforms is
    as simple as implementing ContentExtractor and registering the domain here.
    """

    _generic_extractor = GenericExtractor()
    _youtube_extractor = YouTubeExtractor()
    _x_extractor = XExtractor()
    _github_extractor = GitHubExtractor()
    _google_search_extractor = GoogleSearchExtractor()
    _reddit_extractor = RedditExtractor()

    # Domain Registry mapping hostnames to their corresponding extractor instance
    _registry: dict[str, ContentExtractor] = {
        "youtube.com": _youtube_extractor,
        "youtu.be": _youtube_extractor,
        "x.com": _x_extractor,
        "twitter.com": _x_extractor,
        "github.com": _github_extractor,
        "reddit.com": _reddit_extractor,
        "old.reddit.com": _reddit_extractor,
        "redd.it": _reddit_extractor,
    }

    @classmethod
    def get_extractor(cls, url: str) -> ContentExtractor:
        """Resolves and returns the correct ContentExtractor instance for the given URL."""
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname or ""
            hostname = hostname.lower()
            path = parsed.path or ""

            # Normalize hostname by stripping 'www.'
            if hostname.startswith("www."):
                hostname = hostname[4:]

            # Check for Google Search pages specifically
            if hostname == "google.com" and path.startswith("/search"):
                return cls._google_search_extractor

            # Direct mapping check
            if hostname in cls._registry:
                return cls._registry[hostname]

            # Subdomain fallback check (e.g. m.youtube.com, shorts.youtube.com, etc.)
            for domain, extractor in cls._registry.items():
                if hostname.endswith("." + domain):
                    return extractor

        except Exception:
            # Fall back to generic extractor if parsing fails
            pass

        return cls._generic_extractor
