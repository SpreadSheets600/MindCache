from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional


@dataclass
class ExtractionResult:

    content: str
    title: Optional[str] = None
    author: Optional[str] = None
    published_date: Optional[datetime] = None
    source_type: str = "Generic"
    platform_metadata: dict[str, Any] = field(default_factory=dict)
    final_url: Optional[str] = None


class ContentExtractor(ABC):

    @abstractmethod
    async def extract(self, url: str):
        pass
