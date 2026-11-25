import json
from pathlib import Path

BENCH = Path(__file__).resolve().parent.parent / "benchmarks"


def test_every_expected_file_exists_and_negatives_are_present():
    queries = json.loads((BENCH / "queries.json").read_text())
    files = {path.name for path in (BENCH / "corpus").glob("*.md")}
    assert len(files) >= 20
    assert len(queries["positive"]) >= 25
    assert len(queries["negative"]) >= 5
    assert all(item["expected"] in files for item in queries["positive"])
    assert len({item["query"] for item in queries["positive"]}) == len(queries["positive"])
