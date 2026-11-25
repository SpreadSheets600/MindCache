from io import BytesIO

MAX_UPLOAD = 20 * 1024 * 1024


def extract_file(data: bytes, filename: str):
    lower = filename.lower()
    if data.startswith(b"%PDF-"):
        from pypdf import PdfReader
        try:
            reader = PdfReader(BytesIO(data))
            if reader.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported")
            text = "\n\n".join(page.extract_text() or "" for page in reader.pages)
        except ValueError:
            raise
        except Exception as exc:
            raise ValueError("Could not read this PDF") from exc
        return "pdf", "application/pdf", text, "ready" if text.strip() else "partial"
    signatures = ((b"\x89PNG\r\n\x1a\n", "image/png"), (b"\xff\xd8\xff", "image/jpeg"), (b"GIF87a", "image/gif"), (b"GIF89a", "image/gif"), (b"RIFF", "image/webp"))
    for signature, mime in signatures:
        if data.startswith(signature) and (mime != "image/webp" or data[8:12] == b"WEBP"):
            return "image", mime, "", "partial"
    if lower.endswith((".txt", ".md")):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Text files must use UTF-8") from exc
        return "text", "text/plain; charset=utf-8", text, "ready"
    raise ValueError("Choose a PDF, PNG, JPEG, GIF, WebP, UTF-8 text or Markdown file")
