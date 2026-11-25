import asyncio
import os
from pathlib import Path
import sqlite3
import tempfile

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models.document import Document, PrivacySettings, SearchClick, SearchQuery
from app.models.item import SavedItem

router = APIRouter(prefix="/privacy", tags=["Privacy"])


class PrivacyPreferences(BaseModel):
    save_search_history: bool
    learn_from_clicks: bool


async def get_preferences(db: AsyncSession):
    preference = await db.get(PrivacySettings, 1)
    if preference is None:
        return PrivacySettings(id=1, save_search_history=True, learn_from_clicks=True)
    return preference


@router.get("")
async def privacy_status(db: AsyncSession = Depends(get_db)):
    preferences = await get_preferences(db)
    async def count(model):
        return (await db.execute(select(func.count()).select_from(model))).scalar_one()
    return {
        "save_search_history": preferences.save_search_history,
        "learn_from_clicks": preferences.learn_from_clicks,
        "documents": await count(Document),
        "items": await count(SavedItem),
        "search_queries": await count(SearchQuery),
        "search_clicks": await count(SearchClick),
        "data_directory": str(settings.DATA_DIR),
        "database_bytes": Path(settings.DATABASE_URL[len("sqlite:///"):]).stat().st_size if settings.DATABASE_URL.startswith("sqlite:///") and Path(settings.DATABASE_URL[len("sqlite:///"):]).is_file() else None,
    }


@router.put("")
async def update_preferences(body: PrivacyPreferences, db: AsyncSession = Depends(get_db)):
    preference = await db.get(PrivacySettings, 1)
    if preference is None:
        preference = PrivacySettings(id=1)
        db.add(preference)
    preference.save_search_history = body.save_search_history
    preference.learn_from_clicks = body.learn_from_clicks
    await db.commit()
    return {"save_search_history": preference.save_search_history, "learn_from_clicks": preference.learn_from_clicks}


@router.delete("/history")
async def clear_history(db: AsyncSession = Depends(get_db)):
    await db.execute(delete(SearchClick))
    await db.execute(delete(SearchQuery))
    await db.commit()
    return {"status": "cleared"}


def _copy_database(source: Path, destination: Path):
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as current:
        with sqlite3.connect(destination) as backup:
            current.backup(backup)


@router.get("/backup")
async def backup_database(background: BackgroundTasks):
    prefix = "sqlite:///"
    if not settings.DATABASE_URL.startswith(prefix):
        raise HTTPException(400, "Database backup is only supported for SQLite")
    source = Path(settings.DATABASE_URL[len(prefix):])
    if not source.is_file():
        raise HTTPException(404, "Database file not found")
    fd, filename = tempfile.mkstemp(prefix="mindcache-backup-", suffix=".sqlite3")
    os.close(fd)
    try:
        await asyncio.to_thread(_copy_database, source, Path(filename))
    except Exception as exc:
        Path(filename).unlink(missing_ok=True)
        raise HTTPException(500, "Could not create database backup") from exc
    background.add_task(Path(filename).unlink, missing_ok=True)
    return FileResponse(filename, media_type="application/vnd.sqlite3", filename="mindcache-backup.sqlite3", background=background)
