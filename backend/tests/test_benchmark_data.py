import json
from pathlib import Path

from app.services import chunker

BENCH = Path(__file__).resolve().parent.parent / "benchmarks"


def test_every_expected_file_exists_and_negatives_are_present():
    queries = json.loads((BENCH / "queries.json").read_text())
    files = {path.name for path in (BENCH / "corpus").glob("*.md")}
    assert len(files) >= 20
    assert len(queries["positive"]) >= 25
    assert len(queries["negative"]) >= 5
    assert all(item["expected"] in files for item in queries["positive"])
    assert len({item["query"] for item in queries["positive"]}) == len(queries["positive"])


def test_long_documents_exercise_chunk_sizes_and_have_passage_targets(monkeypatch):
    queries = json.loads((BENCH / "queries.json").read_text())
    passage_queries = [item for item in queries["positive"] if "passage" in item]
    assert len(passage_queries) >= 4
    documents = {item["expected"] for item in passage_queries}
    assert len(documents) >= 2
    for name in documents:
        content = (BENCH / "corpus" / name).read_text()
        counts = []
        for size in (800, 1600, 3200):
            monkeypatch.setattr(chunker, "TARGET_CHARS", size)
            counts.append(len(chunker.chunk_text(content)))
        assert counts[0] > counts[1] > counts[2] > 1
    for item in passage_queries:
        content = (BENCH / "corpus" / item["expected"]).read_text()
        assert item["passage"].casefold() in content.casefold()
