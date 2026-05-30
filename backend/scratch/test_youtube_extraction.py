import re
import sys
from urllib.parse import parse_qs, urlparse

import yt_dlp
from youtube_transcript_api import YouTubeTranscriptApi


def extract_youtube_id(url: str):
    """Robustly isolates the 11-character YouTube video ID from a URL."""
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

        match = re.search(r"(?:v=|\/)([0-9A-Za-z_-]{11})", url)
        if match:
            return match.group(1)
    except Exception as e:
        print(f"Failed to parse YouTube video ID from URL: {e}")
    return None


def main():
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("Enter YouTube Video URL: ").strip()

    if not url:
        print("No URL provided. Exiting.")
        return

    print(f"\n[+] Processing YouTube URL: '{url}'")
    video_id = extract_youtube_id(url)
    if not video_id:
        print("[-] Error: Could not extract YouTube video ID from the URL.")
        return
    print(f"[+] Extracted Video ID: {video_id}")

    # 1. Fetch Metadata via yt-dlp
    print("\n[1] Fetching live metadata using yt-dlp...")
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }

    metadata = {}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if info:
                metadata = {
                    "title": info.get("title"),
                    "channel": info.get("uploader") or info.get("channel"),
                    "duration": info.get("duration"),
                    "upload_date": info.get("upload_date"),
                    "tags": info.get("tags") or [],
                    "description": info.get("description"),
                }
                print(f"    * Title: {metadata['title']}")
                print(f"    * Channel: {metadata['channel']}")
                print(f"    * Duration: {metadata['duration']} seconds")
                print(f"    * Upload Date: {metadata['upload_date']}")
    except Exception as e:
        print(f"    [-] Error fetching metadata via yt-dlp: {e}")

    # 2. Fetch Transcript via youtube-transcript-api
    print("\n[2] Fetching live transcript using youtube-transcript-api...")
    transcript = None
    try:
        # Uses the modern instanced fetch method required in version 1.2.4
        transcript_list = YouTubeTranscriptApi().fetch(video_id)
        if transcript_list:
            transcript = " ".join([entry["text"] for entry in transcript_list])
            print(f"    * Success! Transcript found: {len(transcript)} characters.")
    except Exception as e:
        print(f"    [-] Error fetching transcript: {e}")
        print("    * (This means captions are disabled, auto-caps are unavailable, or IP rate-limited)")

    # 3. Construct Output Document
    print("\n[3] Building output document structure...")
    output_lines = [
        f"URL: {url}",
        f"Title: {metadata.get('title', 'Unknown Title')}",
        f"Channel/Author: {metadata.get('channel', 'Unknown Channel')}",
        f"Upload Date: {metadata.get('upload_date', 'Unknown')}",
        f"Duration: {metadata.get('duration', 'Unknown')} seconds",
        "-" * 60,
        "Description:",
        metadata.get("description", "No description available."),
        "-" * 60,
        "Transcript:",
        transcript if transcript else "TRANSCRIPT NOT AVAILABLE (Using fallback metadata values only)",
    ]

    output_text = "\n\n".join(output_lines)

    # Save output text locally
    filename = f"youtube_{video_id}_test_output.txt"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(output_text)

    print(f"\n[+] Live extraction test complete! Output saved to: '{filename}'")


if __name__ == "__main__":
    main()
