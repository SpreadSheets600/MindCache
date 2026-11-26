import asyncio
import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.files import IndexedFile, WatchedFolder
from app.services.memory_search import query_terms, search_memory
from app.services.indexer import indexer
from app.services.scanner import TEXT_EXTENSIONS, inside
from app.services.watcher import watcher

router = APIRouter(tags=["Folders and files"])
add_lock = asyncio.Lock()


class FolderBody(BaseModel):
    path: str
    exclude_globs: list[str] = []


class FolderPatch(BaseModel):
    enabled: bool | None = None
    exclude_globs: list[str] | None = None


def folder_json(folder):
    return {
        "id": folder.id,
        "path": folder.path,
        "enabled": folder.enabled,
        "exclude_globs": folder.exclude_globs,
        "status": folder.status,
        "last_scan_at": folder.last_scan_at,
    }


def file_json(file):
    return {
        "id": file.id,
        "folder_id": file.folder_id,
        "path": file.path,
        "name": file.name,
        "ext": file.ext,
        "size": file.size,
        "status": file.status,
        "error": file.error,
        "chunk_count": file.chunk_count,
        "indexed_at": file.indexed_at,
    }


@router.get("/folders")
async def list_folders(db: AsyncSession = Depends(get_db)):
    return [folder_json(folder) for folder in (await db.execute(select(WatchedFolder).order_by(WatchedFolder.id))).scalars()]


@router.post("/folders", status_code=201)
async def add_folder(body: FolderBody, db: AsyncSession = Depends(get_db)):
    path = Path(body.path).expanduser()
    if not path.is_absolute() or not path.is_dir():
        raise HTTPException(400, f"{body.path} is not an existing folder. Use an absolute path.")
    resolved = path.resolve()
    if resolved == Path(resolved.anchor):
        raise HTTPException(400, "Choose a folder, not the whole filesystem.")
    async with add_lock:
        for existing in (await db.execute(select(WatchedFolder))).scalars():
            if Path(existing.path) == resolved:
                raise HTTPException(409, f"{resolved} is already watched.")
            if inside(resolved, existing.path):
                raise HTTPException(409, f"{resolved} is already covered by {existing.path}.")
            if inside(existing.path, resolved):
                raise HTTPException(409, f"{resolved} contains {existing.path}, which is already watched. Remove that folder first.")
        folder = WatchedFolder(path=str(resolved), exclude_globs=[glob.strip() for glob in body.exclude_globs if glob.strip()])
        db.add(folder)
        await db.commit()
    await db.refresh(folder)
    await watcher.refresh()
    await indexer.scan_folder_later(folder.id)
    return folder_json(folder)


@router.patch("/folders/{folder_id}")
async def update_folder(folder_id: int, body: FolderPatch, db: AsyncSession = Depends(get_db)):
    folder = await db.get(WatchedFolder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found.")
    if body.enabled is not None:
        folder.enabled = body.enabled
    if body.exclude_globs is not None:
        folder.exclude_globs = [glob.strip() for glob in body.exclude_globs if glob.strip()]
    await db.commit()
    await watcher.refresh()
    await indexer.scan_folder_later(folder.id)
    return folder_json(folder)


@router.post("/folders/{folder_id}/rescan", status_code=202)
async def rescan_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    if await db.get(WatchedFolder, folder_id) is None:
        raise HTTPException(404, "Folder not found.")
    await indexer.scan_folder_later(folder_id)
    return {"status": "scanning"}


@router.delete("/folders/{folder_id}")
async def forget_folder(folder_id: int, db: AsyncSession = Depends(get_db)):
    folder = await db.get(WatchedFolder, folder_id)
    if folder is None:
        raise HTTPException(404, "Folder not found.")
    await indexer.forget_folder(db, folder)
    await watcher.refresh()
    return {"status": "forgotten"}


@router.get("/files")
async def list_files(
    folder_id: int | None = None,
    status: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    statement = select(IndexedFile).order_by(IndexedFile.id.desc()).limit(limit)
    if folder_id is not None:
        statement = statement.where(IndexedFile.folder_id == folder_id)
    if status:
        statement = statement.where(IndexedFile.status == status)
    return [file_json(file) for file in (await db.execute(statement)).scalars()]


KINDS = {"page", "file", "note", "upload"}


@router.get("/memory/search")
async def search(
    q: str = Query(min_length=1, max_length=500),
    limit: int = Query(20, ge=1, le=100),
    mode: str = Query("full", pattern="^(fast|full)$"),
    kind: str = Query("", max_length=60),
    db: AsyncSession = Depends(get_db),
):
    kinds = {value for value in kind.split(",") if value in KINDS}
    results = await search_memory(db, q, limit, mode, kinds)
    return {"results": results, "terms": query_terms(q), "mode": mode}


INLINE_TYPES = {".pdf": "application/pdf"}


async def indexed_path(db, file_id):
    file = await db.get(IndexedFile, file_id)
    folder = await db.get(WatchedFolder, file.folder_id) if file else None
    if file is None or folder is None or file.status == "missing":
        raise HTTPException(404, "File not found.")
    path = Path(file.path)
    if not path.is_file() or not inside(path, folder.path):
        raise HTTPException(404, "File not found.")
    return file, path


@router.get("/files/{file_id}/raw")
async def file_content(file_id: int, db: AsyncSession = Depends(get_db)):
    file, path = await indexed_path(db, file_id)
    suffix = path.suffix.lower()
    headers = {"X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox"}
    if suffix in INLINE_TYPES:
        return FileResponse(path, media_type=INLINE_TYPES[suffix], content_disposition_type="inline", headers=headers)
    if suffix in TEXT_EXTENSIONS:
        return FileResponse(path, media_type="text/plain; charset=utf-8", content_disposition_type="inline", headers=headers)
    return FileResponse(path, media_type="application/octet-stream", filename=file.name, content_disposition_type="attachment", headers=headers)


class OpenBody(BaseModel):
    reveal: bool = False


def launch(target):
    if sys.platform.startswith("win"):
        os.startfile(target)
        return
    command = ["open", target] if sys.platform == "darwin" else ["xdg-open", target]
    subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


@router.post("/files/{file_id}/open")
async def open_file(file_id: int, body: OpenBody | None = None, db: AsyncSession = Depends(get_db)):
    _, path = await indexed_path(db, file_id)
    try:
        launch(str(path.parent if body and body.reveal else path))
    except OSError as exc:
        raise HTTPException(500, "This computer could not open the file.") from exc
    return {"status": "opened"}


@router.post("/files/{file_id}/reindex", status_code=202)
async def reindex_file(file_id: int, db: AsyncSession = Depends(get_db)):
    file = await db.get(IndexedFile, file_id)
    if file is None:
        raise HTTPException(404, "File not found.")
    file.status, file.content_hash = "pending", ""
    await db.commit()
    indexer.enqueue(file_id)
    return {"status": "queued"}


@router.get("/index/status")
async def index_status():
    return await indexer.status()


@router.post("/index/pause")
async def pause_index():
    indexer.pause()
    return await indexer.status()


@router.post("/index/resume")
async def resume_index():
    indexer.resume()
    return await indexer.status()
