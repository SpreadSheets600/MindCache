import argparse
import asyncio
import json
import os
import statistics
import sys
import tempfile
import time
from pathlib import Path

from sqlalchemy import text

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent))


def prepare_environment(models_dir):
    data = tempfile.mkdtemp(prefix="mindcache-bench-")
    os.environ["DATA_DIR"] = data
    os.environ["DATABASE_URL"] = f"sqlite:///{data}/bench.db"
    os.environ["FAISS_INDEX_PATH"] = f"{data}/f.bin"
    os.environ["BM25_INDEX_PATH"] = f"{data}/b.pkl"
    return data


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * fraction))]


async def build(modules, corpus, chunk_chars):
    chunker, chunk_store, chunk_index_module, embedder, database, base, models = modules
    chunker.TARGET_CHARS = chunk_chars
    async with database.engine.begin() as connection:
        await connection.run_sync(base.metadata.drop_all)
        await connection.run_sync(base.metadata.create_all)
        await connection.execute(text("DELETE FROM chunks_fts"))
    index = chunk_index_module.ChunkIndex(Path(os.environ["DATA_DIR"]) / f"chunks-{chunk_chars}.faiss")
    started = time.perf_counter()
    count = 0
    async with database.AsyncSessionLocal() as db:
        folder = models.WatchedFolder(path=str(corpus))
        db.add(folder)
        await db.flush()
        for path in sorted(corpus.glob("*.md")):
            file = models.IndexedFile(folder_id=folder.id, path=str(path), name=path.name, status="indexed")
            db.add(file)
            await db.flush()
            _, chunks = await chunk_store.replace_source(db, "file", file.id, path.name, path.read_text())
            vectors = embedder.embed_documents([f"{path.name}\n{chunk.text}" for chunk in chunks])
            index.add([chunk.id for chunk in chunks], vectors)
            count += len(chunks)
        await db.commit()
    return index, count, time.perf_counter() - started


async def evaluate(search, memory_search, index, queries, floor):
    memory_search.chunk_index = index
    memory_search.SEMANTIC_FLOOR = floor
    ranks = []
    latencies = []
    async with search.AsyncSessionLocal() as db:
        for item in queries["positive"]:
            started = time.perf_counter()
            results = await memory_search.search_memory(db, item["query"], 10)
            latencies.append(time.perf_counter() - started)
            titles = [result["title"] for result in results]
            ranks.append(titles.index(item["expected"]) + 1 if item["expected"] in titles else None)
        empty = 0
        for query in queries["negative"]:
            empty += not await memory_search.search_memory(db, query, 10)
    found = [rank for rank in ranks if rank]
    return {
        "recall@1": sum(rank == 1 for rank in ranks) / len(ranks),
        "recall@3": sum(bool(rank) and rank <= 3 for rank in ranks) / len(ranks),
        "mrr": sum(1 / rank for rank in found) / len(ranks),
        "empty_on_unanswerable": empty / len(queries["negative"]),
        "p50_ms": statistics.median(latencies) * 1000,
        "p95_ms": percentile(latencies, 0.95) * 1000,
    }


async def main(arguments):
    prepare_environment(arguments.models_dir)
    from app.db import session as database
    from app.db.base import Base
    from app.models import files as models
    from app.services import chunk_index as chunk_index_module
    from app.services import chunk_store, chunker, memory_search
    from app.services.embedder import Embedder

    embedder = Embedder()
    if arguments.models_dir:
        embedder.__class__ = type("Located", (Embedder,), {"models_dir": Path(arguments.models_dir)})
    memory_search.embedder = embedder
    queries = json.loads(Path(arguments.queries).read_text())
    modules = (chunker, chunk_store, chunk_index_module, embedder, database, Base, models)
    print(f"{'chars':>6} {'floor':>5} {'chunks':>6} {'chunks/s':>8} {'r@1':>5} {'r@3':>5} {'mrr':>5} {'empty':>6} {'p50ms':>6} {'p95ms':>6}")
    for chunk_chars in arguments.chunk_chars:
        index, count, seconds = await build(modules, Path(arguments.corpus), chunk_chars)
        for floor in arguments.floors:
            result = await evaluate(database, memory_search, index, queries, floor)
            print(
                f"{chunk_chars:>6} {floor:>5.2f} {count:>6} {count / seconds:>8.1f} {result['recall@1']:>5.2f} "
                f"{result['recall@3']:>5.2f} {result['mrr']:>5.2f} {result['empty_on_unanswerable']:>6.2f} "
                f"{result['p50_ms']:>6.1f} {result['p95_ms']:>6.1f}"
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--corpus", default=str(ROOT / "corpus"))
    parser.add_argument("--queries", default=str(ROOT / "queries.json"))
    parser.add_argument("--models-dir")
    parser.add_argument("--chunk-chars", type=int, nargs="+", default=[800, 1600, 3200])
    parser.add_argument("--floors", type=float, nargs="+", default=[0.0, 0.6, 0.65, 0.7, 0.75])
    asyncio.run(main(parser.parse_args()))
