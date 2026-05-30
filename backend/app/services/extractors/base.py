from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class ExtractionResult:
    """Standardized Container For Extracted Content And Platform Metadata."""

    content: str
    title: Optional[str] = None  # noqa: UP045
    author: Optional[str] = None  # noqa: UP045
    published_date: Optional[datetime] = None  # noqa: UP045
    source_type: str = "Generic"
    platform_metadata: dict[str, Any] = field(default_factory=dict)


class ContentExtractor(ABC):
    """Common Interface For All Platform-Specific Content Extractors."""

    @abstractmethod
    async def extract(self, url: str) -> ExtractionResult:
        """Asynchronously Extracts High-Quality Text Content And Metadata From The Target URL.

        Args:
            url: The absolute target URL to extract content from.

        Returns:
            An ExtractionResult instance containing clean content and metadata.

        Raises:
            ContentExtractionError: If extraction fails and cannot be recovered.
        """
        pass
