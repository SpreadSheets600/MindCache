import json
import re
from dataclasses import asdict, dataclass, fields
from pathlib import Path
from urllib.parse import urlsplit

from app.core.atomic_io import write_private_text

SUPPORTED_PROVIDERS = {"disabled", "transformers", "ollama", "openai"}
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


@dataclass(frozen=True)
class TaskModel:
    provider: str
    model: str
    endpoint: str = ""
    api_key: str = ""
    allow_remote: bool = False

    def validate(self):
        if self.provider not in SUPPORTED_PROVIDERS:
            raise ValueError("Unsupported provider")
        if self.provider != "disabled" and not self.model.strip():
            raise ValueError("Choose a model")
        if re.search(r"\s", self.api_key):
            raise ValueError("API key cannot contain whitespace")
        if self.provider not in {"ollama", "openai"}:
            return
        parsed = urlsplit(self.endpoint)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Enter an HTTP(S) endpoint without credentials or query parameters")
        if parsed.hostname not in LOCAL_HOSTS:
            if not self.allow_remote:
                raise ValueError("Explicit remote-processing consent is required for this endpoint")
            if parsed.scheme != "https":
                raise ValueError("Remote providers require HTTPS")


def load_generation(path: Path):
    if not path.exists():
        return TaskModel("disabled", "")
    raw = json.loads(path.read_text(encoding="utf-8"))
    saved = raw.get("generation")
    if not saved:
        return TaskModel("disabled", "")
    names = {field.name for field in fields(TaskModel)}
    model = TaskModel(**{key: value for key, value in saved.items() if key in names})
    model.validate()
    return model


def save_generation(path: Path, model: TaskModel):
    model.validate()
    write_private_text(path, json.dumps({"generation": asdict(model)}, indent=2))


def public_view(model: TaskModel):
    view = asdict(model)
    view["api_key_set"] = bool(view.pop("api_key"))
    return view
