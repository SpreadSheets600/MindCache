import asyncio
import re
from datetime import datetime
from typing import Optional
from urllib.parse import parse_qs, urlparse

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi

from app.core.exceptions import YouTubeTranscriptUnavailableError
from app.core.logging import get_logger
from app.services.extractors.base import ContentExtractor, ExtractionResult

logger = get_logger(__name__)


def extract_youtube_id(url: str) -> str | None:
    """Robustly Extracts The 11-Character YouTube Video ID From Various URL Formats."""
    try:
        parsed = urlparse(url)
        if parsed.hostname in ("youtu.be", "www.youtu.be"):
            return parsed.path.lstrip("/")
        if parsed.path.startswith("/watch"):
            return parse_qs(parsed.query).get("v", [None])[0]
        if parsed.path.startswith(("/embed/", "/v/", "/shorts/")):
            parts = parsed.path.split("/")
            if len(parts) >= 3:
                return parts[2]

        # Fallback General Regex Match
        match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
        if match:
            return match.group(1)
    except Exception as e:
        logger.warning(f"Failed To Parse YouTube Video ID From URL '{url}': {e}")
    return None


class YouTubeExtractor(ContentExtractor):
    """Platform-Specific Extractor For YouTube Videos.

    Uses yt-dlp to retrieve metadata and youtube-transcript-api to retrieve captions/transcript.
    """

    def _parse_upload_date(self, date_str: Optional[str]) -> Optional[datetime]:  # noqa: UP045
        """Parses YYYYMMDD Format Date String Into A Datetime Object."""
        if not date_str:
            return None
        try:
            return datetime.strptime(date_str, "%Y%m%d")
        except Exception:
            return None

    async def extract(self, url: str) -> ExtractionResult:
        """Extracts YouTube video metadata and transcript, falling back gracefully if transcripts are disabled."""
        logger.info(f"YouTubeExtractor Selected For URL: '{url}'")

        video_id = extract_youtube_id(url)
        if not video_id:
            logger.error(f"YouTubeExtractor: Extraction Failure - Could not extract video ID from '{url}'")
            # We don't fail hard, we can create a generic video record
            return ExtractionResult(
                content=f"YouTube Video Link: {url}\n\nCould not extract video details.",
                title="Unknown YouTube Video",
                source_type="YouTube",
                platform_metadata={"video_id": None, "url": url},
            )

        # 1. Fetch metadata via yt-dlp
        title = None
        description = None
        channel = None
        publish_date = None
        tags = []
        duration = 0

        ydl_opts = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
        }

        try:

            def _extract_info():
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    return ydl.extract_info(url, download=False)

            info = await asyncio.to_thread(_extract_info)
            if info:
                title = info.get("title")
                description = info.get("description")
                channel = info.get("uploader") or info.get("channel")
                publish_date = self._parse_upload_date(info.get("upload_date"))
                tags = info.get("tags") or []
                duration = info.get("duration") or 0
            logger.info(f"YouTubeExtractor: Metadata successfully retrieved for video {video_id}.")
        except Exception as e:
            logger.warning(f"YouTubeExtractor: Metadata retrieval failed via yt-dlp for video {video_id}: {e}")
            # Do not fail completely, use fallbacks
            title = title or f"YouTube Video {video_id}"

        # 2. Retrieve Transcript
        transcript = None
        transcript_available = False

        try:

            def _fetch_transcript():
                return YouTubeTranscriptApi().list(video_id).find_transcript(["en"]).fetch()

            transcript_list = await asyncio.to_thread(_fetch_transcript)
            if transcript_list:

                def get_entry_text(entry):
                    if isinstance(entry, dict):
                        return entry.get("text", "")
                    elif hasattr(entry, "text"):
                        return entry.text
                    else:
                        return str(entry)

                # Format transcript with [MM:SS] timestamps every 30 seconds
                def format_timestamp(seconds: float) -> str:
                    minutes = int(seconds // 60)
                    secs = int(seconds % 60)
                    return f"{minutes:02d}:{secs:02d}"

                formatted_lines = []
                last_time_marked = -100.0  # Mark every 30 seconds
                for entry in transcript_list:
                    start_time = entry.get("start", 0.0) if isinstance(entry, dict) else (getattr(entry, "start", 0.0) if hasattr(entry, "start") else 0.0)
                    text_val = get_entry_text(entry)
                    if start_time - last_time_marked >= 30.0:
                        timestamp_str = format_timestamp(start_time)
                        formatted_lines.append(f"\n[{timestamp_str}] {text_val}")
                        last_time_marked = start_time
                    else:
                        formatted_lines.append(text_val)

                transcript = " ".join(formatted_lines).strip()
                transcript_available = True
                logger.info(f"YouTubeExtractor: Transcript Availability - Success for video {video_id}.")
        except Exception as e:
            logger.warning(f"YouTubeExtractor: Transcript Availability - Unavailable for video {video_id}: {e}")
            # Create the platform specific exception internally to follow design specs
            err = YouTubeTranscriptUnavailableError(url, str(e))
            logger.debug(f"YouTubeExtractor: Wrapped exception: {err}")

        # 3. Build Unified Searchable Document & Handle Fallbacks
        content_parts = []
        if title:
            content_parts.append(title)
        if description:
            content_parts.append(description)

        if transcript_available and transcript:
            content_parts.append(transcript)
            logger.info("YouTubeExtractor: Unified document constructed using transcript as primary source.")
        else:
            # Fallback usage
            logger.info("YouTubeExtractor: Fallback Usage - Constructing unified document from metadata.")
            if tags:
                content_parts.append("Tags: " + ", ".join(tags))

        unified_content = "\n\n".join(content_parts)

        # 4. Pack Metadata
        platform_metadata = {
            "video_id": video_id,
            "duration": duration,
            "channel": channel,
            "tags": tags,
            "transcript_available": transcript_available,
        }

        logger.info(f"YouTubeExtractor: Extraction Success For URL: '{url}'")
        return ExtractionResult(
            content=unified_content,
            title=title,
            author=channel,
            published_date=publish_date,
            source_type="YouTube",
            platform_metadata=platform_metadata,
        )
