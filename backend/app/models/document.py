from datetime import datetime
from typing import Optional

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Document(Base):

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    url: Mapped[str] = mapped_column(String(2048), unique=True, index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(253), index=True, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    author: Mapped[Optional[str]] = mapped_column(String(256), nullable=True)
    published_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    extracted_content: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(50), default="Generic", server_default="Generic", index=True, nullable=False
    )
    platform_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)
    total_dwell_time: Mapped[float] = mapped_column(Float, default=0.0, server_default="0.0", nullable=False)

    keywords: Mapped[list["Keyword"]] = relationship(
        "Keyword", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    visits: Mapped[list["VisitHistory"]] = relationship(
        "VisitHistory", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    entities: Mapped[list["Entity"]] = relationship(
        "Entity", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )
    clicks: Mapped[list["SearchClick"]] = relationship(
        "SearchClick", back_populates="document", cascade="all, delete-orphan", lazy="selectin"
    )


class Keyword(Base):

    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    keyword: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="keywords")


class Entity(Base):

    __tablename__ = "entities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="entities")


class SearchClick(Base):

    __tablename__ = "search_clicks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    clicked_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="clicks")


class SearchQuery(Base):

    __tablename__ = "search_queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    searched_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)


class VisitHistory(Base):

    __tablename__ = "visit_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True
    )
    visited_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="visits")


class PrivacySettings(Base):

    __tablename__ = "privacy_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    save_search_history: Mapped[bool] = mapped_column(default=True, nullable=False)
    learn_from_clicks: Mapped[bool] = mapped_column(default=True, nullable=False)
