from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.files import IndexedFile, WatchedFolder
from app.services.memory_search import search_memory
from app.services.indexer import indexer
from app.services.scanner import inside
from app.services.watcher import watcher

router = APIRouter(tags=["Folders and files"])


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
        raise HTTPException(400, "Choose an existing folder with an absolute path.")
    resolved = path.resolve()
    if resolved == Path(resolved.anchor):
        raise HTTPException(400, "Choose a folder, not the whole filesystem.")
    for existing in (await db.execute(select(WatchedFolder))).scalars():
        if inside(resolved, existing.path) or inside(existing.path, resolved):
            raise HTTPException(409, "This folder overlaps one that is already watched.")
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


@router.get("/memory/search")
async def search(q: str = Query(min_length=1, max_length=500), limit: int = Query(20, ge=1, le=100), db: AsyncSession = Depends(get_db)):
    return {"results": await search_memory(db, q, limit)}


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
