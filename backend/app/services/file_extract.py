import hashlib
from io import BytesIO


class Unreadable(Exception):
    pass


def file_hash(path):
    digest = hashlib.blake2b(digest_size=16)
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def read_pdf(data):
    from pypdf import PdfReader

    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise Unreadable("Encrypted PDFs are not supported")
        return "\n\n".join(page.extract_text() or "" for page in reader.pages)
    except Unreadable:
        raise
    except Exception as exc:
        raise Unreadable("Could not read this PDF") from exc


def read_text(data):
    if b"\x00" in data[:8192]:
        raise Unreadable("Binary content")
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("latin-1")


def extract_text(path, extension):
    with open(path, "rb") as stream:
        data = stream.read()
    text = read_pdf(data) if extension == ".pdf" else read_text(data)
    if not text.strip():
        raise Unreadable("No text found")
    return text
