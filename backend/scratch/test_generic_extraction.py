import re
import sys

import httpx
import trafilatura
from bs4 import BeautifulSoup


def main():
    if len(sys.argv) > 1:
        url = sys.argv[1]
    else:
        url = input("Enter generic website URL (e.g. https://example.com/blog): ").strip()

    if not url:
        print("No URL provided. Exiting.")
        return

    print(f"\n[+] Processing website URL: '{url}'")

    # 1. Download Website HTML
    print("\n[1] Downloading HTML content using httpx...")
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        )
    }

    html = None
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            response = client.get(url, headers=headers)
            response.raise_for_status()
            html = response.text
            print(f"    * Success! Downloaded {len(html)} characters of raw HTML.")
    except Exception as e:
        print(f"    [-] Error downloading website HTML: {e}")
        return

    # 2. Extract Content via Trafilatura
    print("\n[2] Extracting main article content using Trafilatura...")
    trafilatura_content = None
    metadata = {}
    try:
        trafilatura_content = trafilatura.extract(html, no_fallback=True)
        meta = trafilatura.extract_metadata(html)
        if meta:
            metadata = {"title": meta.title, "author": meta.author, "date": meta.date}

        if trafilatura_content:
            print(f"    * Success! Trafilatura extracted {len(trafilatura_content)} characters.")
            print(f"    * Extracted Title: {metadata.get('title')}")
            print(f"    * Extracted Author: {metadata.get('author')}")
            print(f"    * Extracted Date: {metadata.get('date')}")
        else:
            print("    [-] Trafilatura returned empty content.")
    except Exception as e:
        print(f"    [-] Trafilatura extraction hit an issue: {e}")

    # 3. Fallback Content Extraction via BeautifulSoup
    bs_content = None
    bs_title = None
    if not trafilatura_content:
        print("\n[3] Triggering fallback content parser using BeautifulSoup...")
        try:
            soup = BeautifulSoup(html, "html.parser")
            bs_title = soup.title.string.strip() if soup.title and soup.title.string else None

            # Decompose heavy, non-text tags
            for tag in soup(["script", "style", "noscript", "iframe", "svg", "meta"]):
                tag.decompose()

            text = soup.get_text(separator=" ")
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            clean_text = " ".join(chunk for chunk in chunks if chunk)
            bs_content = re.sub(r"\s+", " ", clean_text).strip()

            print(f"    * Success! BeautifulSoup fallback extracted {len(bs_content)} characters.")
            print(f"    * BeautifulSoup Title: {bs_title}")
        except Exception as e:
            print(f"    [-] BeautifulSoup fallback extraction failed: {e}")

    # 4. Compile and Save Outputs
    final_content = trafilatura_content or bs_content or "No parseable text content found on this webpage."
    final_title = metadata.get("title") or bs_title or "Unknown Website Title"

    output_lines = [
        f"URL: {url}",
        f"Title: {final_title}",
        f"Author: {metadata.get('author', 'N/A')}",
        f"Date: {metadata.get('date', 'N/A')}",
        f"Extraction Method: {'Trafilatura' if trafilatura_content else 'BeautifulSoup Fallback'}",
        "-" * 60,
        "Extracted Content:",
        final_content,
    ]

    output_text = "\n\n".join(output_lines)

    # Save output to a local text file
    filename = "generic_extraction_test_output.txt"
    with open(filename, "w", encoding="utf-8") as f:
        f.write(output_text)

    print(f"\n[+] Live extraction test complete! Output saved to: '{filename}'")


if __name__ == "__main__":
    main()
