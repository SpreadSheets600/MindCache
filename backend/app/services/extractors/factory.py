from urllib.parse import urlparse

from app.services.extractors.base import ContentExtractor
from app.services.extractors.generic import GenericExtractor
from app.services.extractors.github import GitHubExtractor
from app.services.extractors.google_search import GoogleSearchExtractor
from app.services.extractors.pdf import PDFExtractor
from app.services.extractors.reddit import RedditExtractor
from app.services.extractors.x import XExtractor
from app.services.extractors.youtube import YouTubeExtractor


class ExtractorFactory:

    _generic_extractor = GenericExtractor()
    _youtube_extractor = YouTubeExtractor()
    _x_extractor = XExtractor()
    _github_extractor = GitHubExtractor()
    _google_search_extractor = GoogleSearchExtractor()
    _reddit_extractor = RedditExtractor()
    _pdf_extractor = PDFExtractor()

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
    def get_extractor(cls, url: str):
        try:
            parsed = urlparse(url)
            hostname = parsed.hostname or ""
            hostname = hostname.lower()
            path = parsed.path or ""

            if hostname.startswith("www."):
                hostname = hostname[4:]

            path_lower = path.lower()
            if (
                path_lower.endswith(".pdf")
                or (hostname == "arxiv.org" and "/pdf/" in path_lower)
                or ("/pdf/" in path_lower and not path_lower.endswith((".html", ".htm", ".js", ".css", ".php", ".aspx")))
            ):
                return cls._pdf_extractor

            if hostname == "google.com" and path.startswith("/search"):
                return cls._google_search_extractor

            if hostname in cls._registry:
                return cls._registry[hostname]

            for domain, extractor in cls._registry.items():
                if hostname.endswith("." + domain):
                    return extractor

        except Exception:
            pass

        return cls._generic_extractor
