import asyncio
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.ai_config import TaskModel, load_generation, public_view, save_generation
from app.core.config import settings
from app.services.ai_providers import download_model, generate
from app.services.document_processor import document_processor
from app.services.embedder import DIMENSION, MODEL_ID, embedder
from app.services.indexer import indexer
from app.services.source_chunks import backfill_all

router = APIRouter(prefix="/ai", tags=["AI models"])
CONFIG_PATH = settings.DATA_DIR / "models.json"
TASKS = {"embedding", "generation"}


class GenerationChoice(BaseModel):
    provider: str
    model: str = ""
    endpoint: str = ""
    api_key: str | None = None
    allow_remote: bool = False


class GenerateRequest(BaseModel):
    prompt: str


class DownloadRequest(BaseModel):
    task: str


def embedding_info():
    return {"model": MODEL_ID, "dimension": DIMENSION, "status": embedder.status(), "device": embedder.device}


@router.get("/models")
async def get_models():
    return {"embedding": embedding_info(), "generation": public_view(load_generation(CONFIG_PATH))}


@router.put("/generation")
async def update_generation(body: GenerationChoice):
    existing = load_generation(CONFIG_PATH)
    key = existing.api_key if body.api_key is None else body.api_key.strip()
    model = TaskModel(body.provider, body.model.strip(), body.endpoint.strip(), key, body.allow_remote)
    try:
        save_generation(CONFIG_PATH, model)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return public_view(model)


@router.post("/generate")
async def generate_text(body: GenerateRequest):
    if not body.prompt.strip() or len(body.prompt) > 50000:
        raise HTTPException(400, "Enter a prompt of at most 50,000 characters.")
    try:
        return {"text": await asyncio.to_thread(generate, load_generation(CONFIG_PATH), body.prompt)}
    except Exception as exc:
        raise HTTPException(503, f"Generation unavailable: {exc}") from exc


downloads = {}
download_tasks = set()


@router.get("/downloads")
async def download_status():
    return {task: dict(state) for task, state in downloads.items()}


async def run_download(task, model):
    try:
        if task == "embedding":
            await asyncio.to_thread(embedder.download)
            await document_processor.reindex_if_needed()
            await backfill_all(force=True)
            await indexer.rebuild_if_needed()
            await indexer.enqueue_unfinished(("partial",))
        else:
            await asyncio.to_thread(download_model, model)
        downloads[task].update(status="completed", error=None)
    except Exception as exc:
        downloads[task].update(status="failed", error=str(exc))


@router.post("/downloads", status_code=202)
async def start_download(body: DownloadRequest):
    if body.task not in TASKS:
        raise HTTPException(400, "Choose the embedding or generation task.")
    if downloads.get(body.task, {}).get("status") == "downloading":
        raise HTTPException(409, "A download for this task is already running.")
    model = None
    name = MODEL_ID
    if body.task == "generation":
        model = load_generation(CONFIG_PATH)
        if model.provider not in {"transformers", "ollama"}:
            raise HTTPException(400, "Choose a provider that supports downloads.")
        name = model.model
    downloads[body.task] = {
        "status": "downloading",
        "model": name,
        "started_at": datetime.now(UTC).isoformat(),
        "error": None,
    }
    future = asyncio.create_task(run_download(body.task, model))
    download_tasks.add(future)
    future.add_done_callback(download_tasks.discard)
    return dict(downloads[body.task])
