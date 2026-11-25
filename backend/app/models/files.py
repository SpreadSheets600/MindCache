from datetime import datetime

from sqlalchemy import DDL, JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text, event, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WatchedFolder(Base):
    __tablename__ = "watched_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    path: Mapped[str] = mapped_column(String(4096), unique=True, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    exclude_globs: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    added_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    last_scan_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class IndexedFile(Base):
    __tablename__ = "indexed_files"

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("watched_folders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    path: Mapped[str] = mapped_column(String(4096), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    ext: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    mtime_ns: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True, nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Chunk(Base):
    __tablename__ = "chunks"
    __table_args__ = (Index("ix_chunks_source", "source_kind", "source_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    source_id: Mapped[int] = mapped_column(nullable=False)
    ordinal: Mapped[int] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(String(512), default="", nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_start: Mapped[int] = mapped_column(default=0, nullable=False)
    char_end: Mapped[int] = mapped_column(default=0, nullable=False)


event.listen(
    Chunk.__table__,
    "after_create",
    DDL("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(title, text, tokenize='porter unicode61')"),
)
