from datetime import datetime
from sqlalchemy import JSON, DateTime, ForeignKey, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedItem(Base):
    __tablename__ = "saved_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    filename: Mapped[str | None] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    original: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="ready", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class RecallImport(Base):
    __tablename__ = "recall_imports"

    id: Mapped[int] = mapped_column(primary_key=True)
    import_key: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("saved_items.id", ondelete="CASCADE"), nullable=False, index=True)
    metadata_json: Mapped[dict] = mapped_column(JSON, nullable=False)
