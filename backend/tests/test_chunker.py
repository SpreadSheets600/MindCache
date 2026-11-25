from app.services.chunker import OVERLAP_CHARS, TARGET_CHARS, chunk_text


def paragraphs(count, size=300):
    return "\n\n".join(f"Paragraph {index} " + ("word " * (size // 5)) for index in range(count))


def test_blank_text_has_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("  \n\n  ") == []


def test_short_text_is_one_chunk():
    text = "A short note about nothing."
    assert chunk_text(text) == [(0, len(text), text)]


def test_offsets_match_the_original_text():
    text = paragraphs(40)
    for start, end, body in chunk_text(text):
        assert text[start:end] == body


def test_chunks_are_bounded_and_cover_all_text():
    text = paragraphs(60)
    chunks = chunk_text(text)
    assert len(chunks) > 5
    assert all(end - start <= TARGET_CHARS + OVERLAP_CHARS for start, end, _ in chunks)
    covered = set()
    for start, end, _ in chunks:
        covered.update(range(start, end))
    assert all(index in covered for index, char in enumerate(text) if not char.isspace())


def test_neighbouring_chunks_overlap():
    chunks = chunk_text(paragraphs(120, size=100))
    assert any(second[0] < first[1] for first, second in zip(chunks, chunks[1:], strict=False))


def test_chunking_is_deterministic():
    text = paragraphs(30)
    assert chunk_text(text) == chunk_text(text)


def test_text_without_spaces_is_still_split():
    text = "x" * (TARGET_CHARS * 3 + 10)
    chunks = chunk_text(text)
    assert len(chunks) >= 3
    assert "".join(body for _, _, body in chunks).count("x") >= len(text)
