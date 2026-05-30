from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator


class VisitRequest(BaseModel):
    """Payload Representing A Visited URL Sent From The Extension."""

    url: str = Field(..., description="The Fully Qualified URL Visited By The User.")
    title: Optional[str] = Field(None, description="The Pre-Rendered Tab Title Captured By The Extension.")

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
    created_at: datetime
    updated_at: datetime
    keywords: list[KeywordResponse] = []  # noqa: UP045
    visit_history: list[datetime] = Field(default=[], description="List Of Timestamps When This URL Was Visited.")
