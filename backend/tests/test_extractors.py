from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
import requests
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import XExtractionError
from app.services.document_processor import document_processor
from app.services.extractors.base import ExtractionResult
from app.services.extractors import ExtractorFactory
from app.services.extractors.generic import GenericExtractor
from app.services.extractors.github import GitHubExtractor
from app.services.extractors.reddit import RedditExtractor
from app.services.extractors.x import XExtractor
from app.services.extractors.youtube import YouTubeExtractor, extract_youtube_id
from app.services.extractors.google_search import GoogleSearchExtractor



def test_extractor_factory_selection():
    """Verifies that ExtractorFactory resolves the correct extractor based on domain name."""
    # YouTube domains
    assert isinstance(ExtractorFactory.get_extractor("https://youtube.com/watch?v=123"), YouTubeExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://youtu.be/123"), YouTubeExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://www.youtube.com/shorts/123"), YouTubeExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://m.youtube.com/watch?v=123"), YouTubeExtractor)

    # X / Twitter domains
    assert isinstance(ExtractorFactory.get_extractor("https://x.com/jack/status/20"), XExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://twitter.com/jack/status/20"), XExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://www.x.com/jack/status/20"), XExtractor)

    # Other domains
    assert isinstance(ExtractorFactory.get_extractor("https://google.com"), GenericExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://google.com/search?q=best+rag"), GoogleSearchExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://www.google.com/search?q=hello"), GoogleSearchExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://google.com/about"), GenericExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://github.com/spreadsheets600"), GitHubExtractor)
    assert isinstance(ExtractorFactory.get_extractor("https://example.com/blog/1"), GenericExtractor)



def test_youtube_video_id_extraction():
    """Ensures YouTube video ID parser handles diverse URL formats correctly."""
    assert extract_youtube_id("https://www.youtube.com/watch?v=dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://youtu.be/dQw4w9WgXcQ?t=10") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://www.youtube.com/embed/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert extract_youtube_id("https://www.youtube.com/shorts/dQw4w9WgXcQ") == "dQw4w9WgXcQ"


@pytest.mark.asyncio
async def test_youtube_extractor_success():
    """Verifies YouTubeExtractor extracts video details and transcripts correctly."""
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    # 1. Mock yt-dlp
    mock_ydl = MagicMock()
    mock_ydl.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "title": "Rick Astley - Never Gonna Give You Up",
        "description": "The official video for Never Gonna Give You Up.",
        "uploader": "Rick Astley",
        "upload_date": "19870727",
        "tags": ["rickroll", "80s", "dance-pop"],
        "duration": 212,
    }

    # 2. Mock transcript
    mock_transcript = [
        {"text": "We're no strangers to love", "start": 0.0, "duration": 2.0},
        {"text": "You know the rules and so do I", "start": 2.0, "duration": 2.0},
    ]

    mock_api = MagicMock()
    mock_transcript_obj = MagicMock()
    mock_transcript_obj.fetch.return_value = mock_transcript
    mock_api.list.return_value.find_transcript.return_value = mock_transcript_obj

    with (
        patch("app.services.extractors.youtube.yt_dlp.YoutubeDL", return_value=mock_ydl),
        patch("app.services.extractors.youtube.YouTubeTranscriptApi", return_value=mock_api)
    ):
        extractor = YouTubeExtractor()
        result = await extractor.extract(url)

        # Assert results
        assert result.source_type == "YouTube"
        assert result.title == "Rick Astley - Never Gonna Give You Up"
        assert result.author == "Rick Astley"
        assert result.published_date == datetime(1987, 7, 27)
        assert "We're no strangers to love" in result.content
        assert "You know the rules and so do I" in result.content
        assert "The official video" in result.content

        # Check platform_metadata
        meta = result.platform_metadata
        assert meta["video_id"] == "dQw4w9WgXcQ"
        assert meta["duration"] == 212
        assert meta["channel"] == "Rick Astley"
        assert meta["tags"] == ["rickroll", "80s", "dance-pop"]
        assert meta["transcript_available"] is True


@pytest.mark.asyncio
async def test_youtube_extractor_missing_transcript_fallback():
    """Ensures YouTubeExtractor falls back cleanly to title/desc/tags when transcript is disabled/missing."""
    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    mock_ydl = MagicMock()
    mock_ydl.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = {
        "title": "Rick Astley - Never Gonna Give You Up",
        "description": "The official video.",
        "uploader": "Rick Astley",
        "upload_date": "19870727",
        "tags": ["rickroll"],
        "duration": 212,
    }

    mock_api = MagicMock()
    mock_api.list.side_effect = Exception("Transcripts disabled")

    with (
        patch("app.services.extractors.youtube.yt_dlp.YoutubeDL", return_value=mock_ydl),
        patch("app.services.extractors.youtube.YouTubeTranscriptApi", return_value=mock_api)
    ):
        extractor = YouTubeExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "YouTube"
        assert result.title == "Rick Astley - Never Gonna Give You Up"
        assert "The official video" in result.content
        assert "rickroll" in result.content
        assert result.platform_metadata["transcript_available"] is False


@pytest.mark.asyncio
async def test_x_extractor_success():
    """Verifies XExtractor parses full tweet contents using the fixupx HTML scraper mock."""
    url = "https://x.com/jack/status/20"

    mock_html = """
    <html>
        <head>
            <meta property="og:title" content="Jack (@jack)">
            <meta property="og:description" content="just setting up my twttr">
        </head>
    </html>
    """

    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.text = mock_html
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.extractors.x.httpx.AsyncClient.get", return_value=mock_response):
        extractor = XExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "X"
        assert result.title == "Jack (@jack)"
        assert result.content == "just setting up my twttr"



@pytest.mark.asyncio
async def test_x_extractor_partial_fallback():
    """Ensures XExtractor raises XExtractionError on request failure."""
    url = "https://x.com/jack/status/20"

    with patch("app.services.extractors.x.httpx.AsyncClient.get", side_effect=httpx.RequestError("No internet", request=MagicMock())):
        extractor = XExtractor()
        with pytest.raises(XExtractionError):
            await extractor.extract(url)



@pytest.mark.asyncio
async def test_pipeline_integration_youtube_and_x(client_override: AsyncSession):
    """Integration test verifying YouTube and X flow through DocumentProcessor."""
    yt_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    x_url = "https://x.com/jack/status/20"

    # Mock YouTube Extraction
    yt_result = {
        "title": "Rick Astley - Never Gonna Give You Up",
        "description": "Never Gonna Give You Up.",
        "uploader": "Rick Astley",
        "upload_date": "19870727",
        "tags": ["rickroll"],
        "duration": 212,
    }
    yt_transcript = [{"text": "We're no strangers to love"}]

    # Mock X Extraction
    x_html = """
    <html>
        <head>
            <meta property="og:title" content="Jack (@jack)">
            <meta property="og:description" content="just setting up my twttr">
        </head>
    </html>
    """
    x_response = MagicMock(spec=httpx.Response)
    x_response.status_code = 200
    x_response.text = x_html
    x_response.raise_for_status = MagicMock()

    # 1. Test YouTube Processing Flow
    mock_ydl = MagicMock()
    mock_ydl.__enter__.return_value = mock_ydl
    mock_ydl.extract_info.return_value = yt_result

    mock_api = MagicMock()
    mock_transcript_obj = MagicMock()
    mock_transcript_obj.fetch.return_value = yt_transcript
    mock_api.list.return_value.find_transcript.return_value = mock_transcript_obj

    with (
        patch("app.services.extractors.youtube.yt_dlp.YoutubeDL", return_value=mock_ydl),
        patch("app.services.extractors.youtube.YouTubeTranscriptApi", return_value=mock_api)
    ):
        status, doc = await document_processor.process_url(client_override, yt_url)
        assert status == "success"
        assert doc.source_type == "YouTube"
        assert doc.platform_metadata["video_id"] == "dQw4w9WgXcQ"
        assert doc.platform_metadata["duration"] == 212
        assert "We're no strangers to love" in doc.extracted_content

    # 2. Test X Processing Flow
    with patch("app.services.extractors.x.httpx.AsyncClient.get", return_value=x_response):
        status, doc = await document_processor.process_url(client_override, x_url)
        assert status == "success"
        assert doc.source_type == "X"
        assert doc.title == "Jack (@jack)"
        assert "just setting up my twttr" in doc.extracted_content



@pytest.mark.asyncio
async def test_github_extractor_success():
    """Verifies GitHubExtractor extracts repository details and README correctly."""
    url = "https://github.com/google-deepmind/antigravity"

    mock_html = """
    <html>
        <head>
            <meta name="description" content="Antigravity is a secret project to make code float.">
        </head>
        <body>
            <span id="repo-stars-counter-star" class="Counter js-social-count" title="3,412">3.4k</span>
            <a href="/topics/python" class="topic-tag">python</a>
            <a href="/topics/ai" class="topic-tag">ai</a>
            <article class="markdown-body">
                <h1>Antigravity</h1>
                <p>Welcome to antigravity. Just import antigravity to start floating.</p>
            </article>
        </body>
    </html>
    """

    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.text = mock_html

    with patch("app.services.extractors.github.httpx.AsyncClient.get", return_value=mock_response):
        extractor = GitHubExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "GitHub"
        assert result.title == "google-deepmind/antigravity"
        assert result.author == "google-deepmind"
        assert "Antigravity is a secret project" in result.content
        assert "Welcome to antigravity" in result.content
        assert "python" in result.content

        meta = result.platform_metadata
        assert meta["owner"] == "google-deepmind"
        assert meta["repo_name"] == "antigravity"
        assert "python" in meta["topics"]
        assert meta["stars"] == 3412
        assert meta["readme_available"] is True


@pytest.mark.asyncio
async def test_x_extractor_fxtwitter_success():
    """Verifies that XExtractor parses FxTwitter/FixupX HTML pre-rendered OpenGraph tags correctly."""
    url = "https://x.com/jerryjliu0/status/2060401682610262424"

    mock_html = """
    <html>
        <head>
            <meta property="og:title" content="Jerry Liu (@jerryjliu0)">
            <meta property="og:description" content="LlamaIndex is all you need. Quoted Tweet: Yes, context windows are huge now.">
        </head>
        <body></body>
    </html>
    """

    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.text = mock_html
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.extractors.x.httpx.AsyncClient.get", return_value=mock_response):
        extractor = XExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "X"
        assert result.title == "Jerry Liu (@jerryjliu0)"
        assert result.content == "LlamaIndex is all you need. Quoted Tweet: Yes, context windows are huge now."


@pytest.mark.asyncio
async def test_google_search_extractor_success():
    """Verifies that GoogleSearchExtractor extracts the query and search results from HTML correctly."""
    url = "https://www.google.com/search?q=best+vector+database+for+rag"

    mock_html = """
    <html>
        <body>
            <h3><a href="/url?q=https://pinecone.io">Pinecone</a></h3>
            <h3><a href="https://weaviate.io">Weaviate</a></h3>
        </body>
    </html>
    """

    with patch("app.services.document_processor.document_processor._download_page", return_value=mock_html):
        extractor = GoogleSearchExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "GoogleSearch"
        assert result.title == "Google Search: best vector database for rag"
        assert "best vector database for rag" in result.content
        assert "Pinecone" in result.content
        assert "https://pinecone.io" in result.content
        assert "Weaviate" in result.content
        assert "weaviate.io" in result.content
        assert result.platform_metadata["search_query"] == "best vector database for rag"
        assert result.platform_metadata["has_results"] is True


@pytest.mark.asyncio
async def test_google_search_extractor_ddg_fallback():
    """Verifies that GoogleSearchExtractor falls back to DDG search when HTML scraping fails."""
    url = "https://www.google.com/search?q=fallback+search+query"

    with patch("app.services.document_processor.document_processor._download_page", side_effect=Exception("Blocked")):
        mock_ddg_results = [
            {"title": "DDG Result 1", "href": "https://ddg1.com"},
            {"title": "DDG Result 2", "href": "https://ddg2.com"},
        ]
        mock_ddg_instance = MagicMock()
        mock_ddg_instance.__enter__.return_value = mock_ddg_instance
        mock_ddg_instance.text.return_value = mock_ddg_results
        
        with patch("ddgs.DDGS", return_value=mock_ddg_instance):
            extractor = GoogleSearchExtractor()
            result = await extractor.extract(url)
            
            assert result.source_type == "GoogleSearch"
            assert result.title == "Google Search: fallback search query"
            assert "DDG Result 1" in result.content
            assert "https://ddg1.com" in result.content
            assert "DDG Result 2" in result.content
            assert "https://ddg2.com" in result.content
            assert result.platform_metadata["search_query"] == "fallback search query"


@pytest.mark.asyncio
async def test_reddit_extractor_post_success():
    """Verifies that RedditExtractor successfully fetches and parses Reddit posts using old.reddit HTML."""
    url = "https://www.reddit.com/r/python/comments/12345/my_awesome_post/"

    mock_html = """
    <html>
      <head>
        <title>My Awesome Python Post : python</title>
      </head>
      <body>
        <div class="redditname">r/python</div>
        <div id="siteTable">
          <div class="thing link">
            <div class="midcol unvoted">
              <div class="score unvoted">1337</div>
            </div>
            <div class="entry unvoted">
              <p class="title">
                <a class="title" href="/r/python/comments/12345/my_awesome_post/">My Awesome Python Post</a>
              </p>
              <p class="tagline">
                submitted by <a class="author">guido</a>
              </p>
              <div class="usertext-body">
                This is a post about Python and MindCache.
              </div>
              <a class="comments" href="/r/python/comments/12345/my_awesome_post/">42 comments</a>
            </div>
          </div>
        </div>
        
        <div class="comment">
          <p class="tagline">
            <a class="author">commenter1</a>
            <span class="score unvoted">42 points</span>
          </p>
          <div class="usertext-body">
            This is a great comment!
          </div>
        </div>
      </body>
    </html>
    """

    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 200
    mock_response.text = mock_html
    mock_response.raise_for_status = MagicMock()

    with patch("app.services.extractors.reddit.httpx.AsyncClient.get", return_value=mock_response):
        extractor = RedditExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "Reddit"
        assert result.title == "My Awesome Python Post"
        assert result.author == "guido"
        assert "Subreddit: r/python" in result.content
        assert "This is a post about Python and MindCache" in result.content
        assert "u/commenter1" in result.content
        assert "This is a great comment!" in result.content
        assert result.platform_metadata["subreddit"] == "python"
        assert result.platform_metadata["author"] == "guido"
        assert result.platform_metadata["score"] == 1337
        assert result.platform_metadata["num_comments"] == 42


@pytest.mark.asyncio
async def test_reddit_extractor_fallback():
    """Verifies that RedditExtractor falls back to GenericExtractor when JSON fetching fails."""
    url = "https://www.reddit.com/r/python/comments/12345/my_awesome_post/"

    # Mock JSON fetch failure (e.g., rate limit)
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 429
    mock_response.raise_for_status = MagicMock(side_effect=httpx.HTTPStatusError("Too Many Requests", request=MagicMock(), response=mock_response))

    # Mock GenericExtractor's return result
    mock_fallback_result = ExtractionResult(
        content="Title: Fallback Title\n\nMain Content:\nFallback content from HTML parsing.",
        title="Fallback Title",
        author=None,
        source_type="Generic"
    )

    with (
        patch("app.services.extractors.reddit.httpx.AsyncClient.get", return_value=mock_response),
        patch("app.services.extractors.generic.GenericExtractor.extract", AsyncMock(return_value=mock_fallback_result))
    ):
        extractor = RedditExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "Reddit"  # Should be overridden to Reddit
        assert result.title == "Fallback Title"
        assert "Fallback content from HTML parsing" in result.content


@pytest.mark.asyncio
async def test_reddit_extractor_json_fallback():
    """Verifies That RedditExtractor Normalizes A JSON URL And Passes The Normalized URL To GenericExtractor On Fallback."""
    url = "https://www.reddit.com/r/python/comments/12345/my_awesome_post/.json"

    # Mock JSON Fetch Failure (E.G., Rate Limit)
    mock_response = MagicMock(spec=httpx.Response)
    mock_response.status_code = 429
    mock_response.raise_for_status = MagicMock(side_effect=httpx.HTTPStatusError("Too Many Requests", request=MagicMock(), response=mock_response))

    # Mock GenericExtractor's Return Result
    mock_fallback_result = ExtractionResult(
        content="Title: Fallback Title\n\nMain Content:\nFallback content.",
        title="Fallback Title",
        author=None,
        source_type="Generic"
    )

    mock_generic_extract = AsyncMock(return_value=mock_fallback_result)

    with (
        patch("app.services.extractors.reddit.httpx.AsyncClient.get", return_value=mock_response),
        patch("app.services.extractors.generic.GenericExtractor.extract", mock_generic_extract)
    ):
        extractor = RedditExtractor()
        result = await extractor.extract(url)

        assert result.source_type == "Reddit"
        assert result.title == "Fallback Title"
        # Check That generic.extract Was Called With The Normalized URL (No .json, old.reddit.com)
        mock_generic_extract.assert_called_once_with("https://old.reddit.com/r/python/comments/12345/my_awesome_post")
