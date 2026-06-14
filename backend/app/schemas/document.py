from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


class VisitRequest(BaseModel):
    """Payload Representing A Visited URL Sent From The Extension."""

    url: str = Field(..., description="The Fully Qualified URL Visited By The User.")
    title: Optional[str] = Field(None, description="The Pre-Rendered Tab Title Captured By The Extension.")
    dwell_time: Optional[float] = Field(None, description="The dwell time in seconds for this visit.")

    extracted_content: Optional[str] = Field(None, description="Client-extracted clean markdown body. When present, backend skips server-side download and extraction.")
    extracted_content_html: Optional[str] = Field(None, description="Client-extracted clean HTML body.")
    description: Optional[str] = Field(None, description="Client-extracted meta description.")
    author: Optional[str] = Field(None, description="Client-extracted author name.")
    site_name: Optional[str] = Field(None, description="Client-extracted site name.")
    published_date: Optional[str] = Field(None, description="Client-extracted published date string.")
    language: Optional[str] = Field(None, description="Client-extracted page language.")

    schema_org: Optional[Any] = Field(None, description="JSON-LD schema.org data extracted client-side.")
    meta_tags: Optional[list[dict[str, Any]]] = Field(None, description="Meta tags extracted client-side.")
    keywords: Optional[list[str]] = Field(None, description="Client-extracted keywords.")

    auto_extract: Optional[bool] = Field(True, description="When false and no extracted_content, skip server-side download and return recorded status.")

    highlights: Optional[list[dict[str, Any]]] = Field(None, description="Highlighted text fragments from the page.")
    selection: Optional[str] = Field(None, description="Currently selected text on the page.")
    selection_html: Optional[str] = Field(None, description="HTML of the current selection.")

    @field_validator("url")
    @classmethod
    def validate_http_url(cls, v: str) -> str:
        # Custom Basic Validation For HTTP/HTTPS Schemas

        v_stripped = v.strip()

        if not (v_stripped.startswith("http://") or v_stripped.startswith("https://")):
            raise ValueError("URL Must Start With http:// OR https://")

        return v_stripped


class VisitResponse(BaseModel):
    """Response Representing The Processing State Of A Visited URL."""

    status: str = Field(..., description="Processing Status : 'success', 'duplicate', OR 'error'.")
    message: str = Field(..., description="Human-Readable Processing Details.")
    document_id: Optional[int] = Field(None, description="The Internal Database ID of the document.")  # noqa: UP045
    title: Optional[str] = Field(None, description="The Extracted Webpage Title.")  # noqa: UP045
    domain: Optional[str] = Field(None, description="The Extracted Webpage Domain.")  # noqa: UP045


class SearchRequest(BaseModel):
    """Payload For Natural Language Semantic Search."""

    query: str = Field(..., min_length=1, description="Natural Language Search Query.")
    limit: int = Field(5, ge=1, le=50, description="Maximum Number of Search Results to Return.")

    generate_summary: bool = Field(
        False, description="Flag to Generate a Collective AI Summary Using Local Ollama Model."
    )
    start_time: Optional[datetime] = Field(None, description="ISO Timestamp: Filter results visited after or at this time.")
    end_time: Optional[datetime] = Field(None, description="ISO Timestamp: Filter results visited before or at this time.")


class KeywordResponse(BaseModel):
    """Representation Of An Extracted Keyword."""

    keyword: str
    score: float


class EntityResponse(BaseModel):
    """Representation Of An Extracted Entity."""

    name: str
    type: str  # Person, Company, Technology, Project, etc.


class SearchResultItem(BaseModel):
    """Single Matching Document Result From Vector Search."""

    id: int
    url: str
    domain: str
    title: Optional[str] = None  # noqa: UP045
    summary: Optional[str] = None  # noqa: UP045
    score: float = Field(..., description="FAISS Cosine Similarity/Distance Score.")
    published_date: Optional[datetime] = None  # noqa: UP045
    last_visited_at: datetime = Field(..., description="The Timestamp Of The Most Recent Visit.")
    keywords: list[KeywordResponse] = []  # noqa: UP045
    total_dwell_time: float = 0.0
    source_type: str = "Generic"


class SearchResponse(BaseModel):
    """Search Operation Results Wrapper."""

    query: str
    results: list[SearchResultItem]
    ai_summary: Optional[str] = Field(None, description="Collective AI Summary Of Search Results (If Requested).")  # noqa: UP045


class DocumentResponse(BaseModel):
    """Detailed View Of Stored Document."""

    id: int
    url: str
    domain: str
    title: Optional[str] = None  # noqa: UP045
    author: Optional[str] = None  # noqa: UP045
    published_date: Optional[datetime] = None  # noqa: UP045
    extracted_content: str
    source_type: str = "Generic"
    platform_metadata: Optional[dict] = None  # noqa: UP045
    summary: Optional[str] = None  # noqa: UP045
    total_dwell_time: float = 0.0
    created_at: datetime
    updated_at: datetime
    keywords: list[KeywordResponse] = []  # noqa: UP045
    entities: list[EntityResponse] = []  # noqa: UP045
    visit_history: list[datetime] = Field(default=[], description="List Of Timestamps When This URL Was Visited.")


class ClickRequest(BaseModel):
    """Payload representing a clicked search result."""
    query: str = Field(..., description="The query string the user searched for.")
    document_id: int = Field(..., description="The document ID that the user clicked on.")
