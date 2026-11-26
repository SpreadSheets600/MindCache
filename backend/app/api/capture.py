import json

from fastapi import APIRouter
from pydantic import BaseModel, Field, field_validator

from app.core.atomic_io import write_private_text
from app.core.config import settings

router = APIRouter(prefix="/settings/capture", tags=["Browser capture"])
CAPTURE_PATH = settings.DATA_DIR / "capture-settings.json"

DEFAULT_EXCLUDED = ["localhost", "127.0.0.1", "chrome", "edge", "about", "google.com/search", "youtube.com/results"]


class CaptureSettings(BaseModel):
    auto_tracking: bool = False
    auto_extract: bool = True
    delay_seconds: int = Field(10, ge=1, le=3600)
    excluded_domains: list[str] = Field(default_factory=lambda: list(DEFAULT_EXCLUDED), max_length=500)

    @field_validator("excluded_domains")
    @classmethod
    def clean(cls, values):
        seen = []
        for value in values:
            value = value.strip().lower()
            if value and len(value) <= 253 and value not in seen:
                seen.append(value)
        return seen


def load():
    try:
        return CaptureSettings(**json.loads(CAPTURE_PATH.read_text(encoding="utf-8")))
    except (OSError, ValueError):
        return CaptureSettings()


def described(values):
    return {**values.model_dump(), "configured": CAPTURE_PATH.exists()}


@router.get("")
async def read_capture():
    return described(load())


@router.put("")
async def write_capture(body: CaptureSettings):
    write_private_text(CAPTURE_PATH, body.model_dump_json())
    return described(body)
