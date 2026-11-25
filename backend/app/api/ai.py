from dataclasses import asdict
import asyncio
from datetime import datetime, UTC

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.ai_config import TaskModel, check_index_model, load_models, save_models
from app.core.config import settings
from app.services.ai_providers import download_model, generate
from app.services.vector_service import vector_service

router = APIRouter(prefix="/ai", tags=["AI models"])
CONFIG_PATH = settings.DATA_DIR / "models.json"


class ModelChoice(BaseModel):
    provider: str
    model: str = ""
    endpoint: str = ""
    api_key_env: str = ""
    allow_remote: bool = False


class ModelSettings(BaseModel):
    embedding: ModelChoice
    generation: ModelChoice


class GenerateRequest(BaseModel):
    prompt: str


@router.get("/models")
async def get_models():
    models = load_models(CONFIG_PATH, settings.EMBEDDING_MODEL_NAME)
    return {name: asdict(model) for name, model in models.items()}


@router.put("/models")
async def update_models(body: ModelSettings):
    models = {name: TaskModel(**getattr(body, name).model_dump()) for name in ("embedding", "generation")}
    try:
        for model in models.values():
            model.validate()
        existing = load_models(CONFIG_PATH, settings.EMBEDDING_MODEL_NAME)
        try:
            check_index_model(
                settings.DATA_DIR / "index-embedding.json",
                existing["embedding"], models["embedding"],
                vector_service._index is not None and vector_service._index.ntotal > 0,
            )
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc
        save_models(CONFIG_PATH, models)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {name: asdict(model) for name, model in models.items()}


@router.post("/generate")
async def generate_text(body: GenerateRequest):
    if not body.prompt.strip() or len(body.prompt) > 50000:
        raise HTTPException(400, "Enter a prompt of at most 50,000 characters.")
    model = load_models(CONFIG_PATH, settings.EMBEDDING_MODEL_NAME)["generation"]
    try:
        return {"text": await asyncio.to_thread(generate, model, body.prompt)}
    except Exception as exc:
        raise HTTPException(503, f"Generation unavailable: {exc}") from exc


class DownloadRequest(BaseModel):
    task: str


@router.post("/download")
async def download(body: DownloadRequest):
    if body.task not in {"embedding", "generation"}:
        raise HTTPException(400, "Choose the embedding or generation task.")
    model = load_models(CONFIG_PATH, settings.EMBEDDING_MODEL_NAME)[body.task]
    try:
        await asyncio.to_thread(download_model, model)
        return {"status": "downloaded"}
    except Exception as exc:
        raise HTTPException(503, f"Download unavailable: {exc}") from exc


_downloads: dict[str, dict] = {}
_download_tasks: set[asyncio.Task] = set()


@router.get("/downloads")
async def download_status():
    return {task: dict(state) for task, state in _downloads.items()}


async def _run_download(task: str, model: TaskModel):
    try:
        await asyncio.to_thread(download_model, model)
        _downloads[task].update(status="completed", error=None)
    except Exception as exc:
        _downloads[task].update(status="failed", error=str(exc))


@router.post("/downloads", status_code=202)
async def start_download(body: DownloadRequest):
    if body.task not in {"embedding", "generation"}:
        raise HTTPException(400, "Choose the embedding or generation task.")
    if _downloads.get(body.task, {}).get("status") == "downloading":
        raise HTTPException(409, "A download for this task is already running.")
    model = load_models(CONFIG_PATH, settings.EMBEDDING_MODEL_NAME)[body.task]
    if model.provider not in {"transformers", "ollama"}:
        raise HTTPException(400, "Choose a provider that supports downloads.")
    _downloads[body.task] = {"status": "downloading", "model": model.model, "provider": model.provider,
                             "started_at": datetime.now(UTC).isoformat(), "error": None}
    future = asyncio.create_task(_run_download(body.task, model))
    _download_tasks.add(future)
    future.add_done_callback(_download_tasks.discard)
    return dict(_downloads[body.task])
