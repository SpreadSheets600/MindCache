from datetime import datetime, UTC
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models.item import RecallImport, SavedItem
from app.services.source_chunks import backfill_in_background
from app.services.recall_import import MAX_ARCHIVE, parse_recall

router = APIRouter(prefix="/imports/recall", tags=["Recall import"])


async def read_export(file: UploadFile):
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_ARCHIVE:
            raise HTTPException(413, "Export exceeds 200 MB")
        chunks.append(chunk)
    try:
        return parse_recall(b"".join(chunks))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


async def known_keys(db: AsyncSession, records: list[dict]):
    keys = [record["key"] for record in records]
    found = set()
    for offset in range(0, len(keys), 500):
        rows = await db.execute(select(RecallImport.import_key).where(RecallImport.import_key.in_(keys[offset:offset + 500])))
        found.update(rows.scalars().all())
    return found


@router.post("/preview")
async def preview(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    records = await read_export(file)
    found = await known_keys(db, records)
    unique = {record["key"] for record in records}
    return {"total": len(records), "new": len(unique - found), "duplicates": len(records) - len(unique - found),
            "missing_originals": sum(record["missing"] for record in records),
            "originals_included": sum(record["original"] is not None for record in records)}


@router.post("")
async def import_recall(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    records = await read_export(file)
    found = await known_keys(db, records)
    imported = missing = 0
    for record in records:
        if record["key"] in found:
            continue
        metadata, original = record["metadata"], record["original"]
        title = metadata.get("title") or metadata.get("type") or "Recall memory"
        if not isinstance(title, str):
            raise HTTPException(400, "Invalid memory title")
        title = title[:512]
        filename = None
        if original is not None:
            filename = PurePosixPath(str(metadata.get("path") or title).replace("\\", "/")).name[:512] or "original"
        item = SavedItem(kind="recall", title=title, content=metadata.get("content") or "",
                         filename=filename, original=original, status="partial" if record["missing"] else "ready")
        timestamp = metadata.get("created_at")
        if isinstance(timestamp, (int, float)):
            try:
                item.created_at = datetime.fromtimestamp(timestamp, UTC).replace(tzinfo=None)
            except (ValueError, OverflowError, OSError):
                pass
        db.add(item)
        await db.flush()
        db.add(RecallImport(import_key=record["key"], item_id=item.id, metadata_json=metadata))
        found.add(record["key"])
        imported += 1
        missing += int(record["missing"])
    await db.commit()
    backfill_in_background()
    return {"imported": imported, "skipped": len(records) - imported, "missing_originals": missing}
