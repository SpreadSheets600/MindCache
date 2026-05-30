from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):
    """Represents A Downloaded And Processed Web Page."""

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(String(2048), unique=True, index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(253), index=True, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)  # noqa: UP045
    author: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)  # noqa: UP045
    published_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # noqa: UP045
    extracted_content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(50), default="Generic", server_default="Generic", index=True, nullable=False
    )
    platform_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # noqa: UP045
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # noqa: UP045
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    keywords: Mapped[list["Keyword"]] = relationship(
        "Keyword", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    visits: Mapped[list["VisitHistory"]] = relationship(
        "VisitHistory", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )


class Keyword(Base):
    """Represents A Keyword Extracted From A Document With A Score."""

    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="keywords")


class VisitHistory(Base):
    """Represents A Record Of When A URL Was Visited And Sent To The System."""

    __tablename__ = "visit_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    visited_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="visits")
