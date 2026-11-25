import asyncio
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.db.session import get_db
from app.models.item import RecallImport, SavedItem
from app.services.excerpts import matching_excerpt
from app.services.file_content import MAX_UPLOAD, extract_file
from app.services.ocr import recognize_image

router = APIRouter(prefix="/items", tags=["Notes and files"])


class Note(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    content: str = Field(min_length=1, max_length=1_000_000)


def item_json(item: SavedItem, query: str = "", include_content: bool = True):
    terms = query.split()
    reasons = []
    if terms and any(term.casefold() in item.title.casefold() for term in terms):
        reasons.append("title")
    if terms and any(term.casefold() in item.content.casefold() for term in terms):
        reasons.append("text")
    return {"id": item.id, "kind": item.kind, "title": item.title, "content": item.content if include_content else "",
            "filename": item.filename, "mime_type": item.mime_type, "status": item.status,
            "created_at": item.created_at, "updated_at": item.updated_at,
            "match_reasons": reasons, "excerpt": matching_excerpt(item.content, terms),
            "has_file": item.filename is not None}


@router.get("")
async def list_items(query: str = Query("", max_length=255), db: AsyncSession = Depends(get_db)):
    statement = select(SavedItem).options(defer(SavedItem.original))
    terms = query.split()[:16]
    if terms:
        conditions = []
        for term in terms:
            term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            conditions.extend((SavedItem.title.ilike(f"%{term}%", escape="\\"), SavedItem.content.ilike(f"%{term}%", escape="\\")))
        statement = statement.where(or_(*conditions))
    rows = (await db.execute(statement.order_by(SavedItem.updated_at.desc()).limit(100))).scalars().all()
    return [item_json(row, query, include_content=False) for row in rows]


@router.post("", status_code=201)
async def create_note(note: Note, db: AsyncSession = Depends(get_db)):
    if not note.title.strip() or not note.content.strip():
        raise HTTPException(400, "Title and content cannot be blank")
    item = SavedItem(kind="note", title=note.title.strip(), content=note.content, status="ready")
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item_json(item)


@router.post("/upload", status_code=201)
async def upload(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    filename = (file.filename or "upload").replace("\\", "/").rsplit("/", 1)[-1][:512]
    chunks, size = [], 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_UPLOAD:
            raise HTTPException(413, "File exceeds the 20 MB limit")
        chunks.append(chunk)
    data = b"".join(chunks)
    if not data:
        raise HTTPException(400, "File is empty")
    try:
        kind, mime, text, state = extract_file(data, filename)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    item = SavedItem(kind=kind, title=filename, content=text, filename=filename, mime_type=mime, original=data, status=state)
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item_json(item)


@router.get("/{item_id}")
async def get_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(SavedItem, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    data = item_json(item)
    if item.kind == "recall":
        imported = (await db.execute(select(RecallImport).where(RecallImport.item_id == item.id))).scalar_one_or_none()
        if imported:
            source = imported.metadata_json.get("source") or ""
            data["source_url"] = source if isinstance(source, str) and source.startswith(("http://", "https://")) else None
            data["recall_metadata"] = imported.metadata_json
    return data


@router.put("/{item_id}")
async def edit_note(item_id: int, note: Note, db: AsyncSession = Depends(get_db)):
    item = await db.get(SavedItem, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    if item.kind != "note":
        raise HTTPException(400, "Only notes can be edited")
    if not note.title.strip() or not note.content.strip():
        raise HTTPException(400, "Title and content cannot be blank")
    item.title, item.content = note.title.strip(), note.content
    await db.commit()
    await db.refresh(item)
    return item_json(item)


@router.get("/{item_id}/file")
async def get_file(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(SavedItem, item_id)
    if item is None or item.original is None:
        raise HTTPException(404, "File not found")
    return Response(item.original, media_type="application/octet-stream", headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(item.filename or 'download', safe='')}"})


@router.post("/{item_id}/ocr")
async def run_ocr(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(SavedItem, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    if item.kind != "image" or item.original is None:
        raise HTTPException(400, "OCR is available for uploaded images")
    try:
        text = await asyncio.to_thread(recognize_image, item.original)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    item.content = text
    item.status = "ready" if text else "partial"
    await db.commit()
    await db.refresh(item)
    return item_json(item)


@router.delete("/{item_id}")
async def delete_item(item_id: int, db: AsyncSession = Depends(get_db)):
    item = await db.get(SavedItem, item_id)
    if item is None:
        raise HTTPException(404, "Item not found")
    await db.delete(item)
    await db.commit()
    return {"status": "deleted"}
