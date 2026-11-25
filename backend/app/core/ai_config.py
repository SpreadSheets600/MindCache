import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import urlsplit

from app.core.atomic_io import write_private_text

_SUPPORTED_PROVIDERS = {"disabled", "transformers", "ollama", "openai"}
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
_ENV_NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")


@dataclass(frozen=True)
class TaskModel:
    provider: str
    model: str
    endpoint: str = ""
    api_key_env: str = ""
    allow_remote: bool = False

    def validate(self):
        if self.provider not in _SUPPORTED_PROVIDERS:
            raise ValueError("Unsupported provider")
        if self.provider != "disabled" and not self.model.strip():
            raise ValueError("Choose a model")
        if self.api_key_env and not _ENV_NAME.fullmatch(self.api_key_env):
            raise ValueError("Invalid API key environment variable name")
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
        if parsed.hostname not in _LOCAL_HOSTS:
            if not self.allow_remote:
                raise ValueError("Explicit remote-processing consent is required for this endpoint")
            if parsed.scheme != "https":
                raise ValueError("Remote providers require HTTPS")


def default_models(embedding_model: str):
    return {
        "embedding": TaskModel("transformers", embedding_model),
        "generation": TaskModel("disabled", ""),
    }


def load_models(path: Path, embedding_model: str):
    defaults = default_models(embedding_model)
    if not path.exists():
        return defaults
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Model configuration must be a JSON object")
    for task in defaults:
        if task in raw:
            item = TaskModel(**raw[task])
            item.validate()
            defaults[task] = item
    return defaults


def save_models(path: Path, models: dict[str, TaskModel]):
    if set(models) != {"embedding", "generation"}:
        raise ValueError("Both task configurations are required")
    for model in models.values():
        model.validate()
    payload = {name: asdict(model) for name, model in models.items()}
    write_private_text(path, json.dumps(payload, indent=2))


def check_index_model(
    identity_path: Path,
    previous: TaskModel,
    selected: TaskModel,
    has_vectors: bool,
):
    if not has_vectors:
        identity_path.unlink(missing_ok=True)
        return
    if selected == previous:
        return
    indexed = previous
    if identity_path.exists():
        indexed = TaskModel(**json.loads(identity_path.read_text(encoding="utf-8")))
    if selected.provider == "disabled":
        if not identity_path.exists():
            write_private_text(identity_path, json.dumps(asdict(indexed)))
        return
    if selected != indexed:
        raise ValueError(
            "The current vector index contains data. Changing embeddings requires a safe rebuild."
        )
