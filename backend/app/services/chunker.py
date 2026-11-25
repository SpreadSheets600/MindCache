import re

TARGET_CHARS = 1600
OVERLAP_CHARS = 240
PARAGRAPH = re.compile(r"\S.*?(?=\n\s*\n|\Z)", re.DOTALL)


def split_long(text, start, end):
    while end - start > TARGET_CHARS:
        window = start + TARGET_CHARS
        cut = max(text.rfind("\n", start, window), text.rfind(". ", start, window) + 1, text.rfind(" ", start, window))
        if cut <= start:
            cut = window
        yield start, cut
        start = cut
        while start < end and text[start].isspace():
            start += 1
    if start < end:
        yield start, end


def pieces(text):
    for match in PARAGRAPH.finditer(text):
        yield from split_long(text, match.start(), match.end())


def chunk_text(text):
    chunks = []
    current = []
    for start, end in pieces(text):
        if current and end - current[0][0] > TARGET_CHARS:
            chunks.append((current[0][0], current[-1][1]))
            kept = []
            total = 0
            for piece in reversed(current):
                total += piece[1] - piece[0]
                if total > OVERLAP_CHARS:
                    break
                kept.insert(0, piece)
            current = kept
        current.append((start, end))
    if current:
        chunks.append((current[0][0], current[-1][1]))
    return [(start, end, text[start:end]) for start, end in chunks]
