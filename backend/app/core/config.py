import logging
import stat
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)

_SQLITE_PREFIX = "sqlite:///"


class Settings(BaseSettings):

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"

    DATABASE_URL: str = f"{_SQLITE_PREFIX}{BASE_DIR / 'data' / 'mindcache.db'}"

    FAISS_INDEX_PATH: str = str(BASE_DIR / "data" / "faiss_index.bin")
    BM25_INDEX_PATH: str = str(BASE_DIR / "data" / "bm25_index.pkl")
    EMBEDDING_DIMENSION: int = 1024

    EMBEDDING_MODEL_PATH: str = "ai"
    EMBEDDING_MODEL_NAME: str = "Qwen/Qwen3-Embedding-0.6B"

    LOG_LEVEL: str = "INFO"
    APP_NAME: str = "MindCache Backend"

    def model_post_init(self, __context: object):
        self.DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.FAISS_INDEX_PATH = self._absolute(self.FAISS_INDEX_PATH)
        self.BM25_INDEX_PATH = self._absolute(self.BM25_INDEX_PATH)
        for index_path in (self.FAISS_INDEX_PATH, self.BM25_INDEX_PATH):
            Path(index_path).parent.mkdir(parents=True, exist_ok=True)
        self._ensure_database_writable()

    def _absolute(self, value: str):
        path = Path(value).expanduser()
        return str(path if path.is_absolute() else self.BASE_DIR / path)

    @property
    def database_path(self):
        if not self.DATABASE_URL.startswith(_SQLITE_PREFIX):
            return None
        return Path(self.DATABASE_URL[len(_SQLITE_PREFIX) :])

    @property
    def database_size_bytes(self):
        path = self.database_path
        return path.stat().st_size if path is not None and path.is_file() else None

    def _ensure_database_writable(self):
        path = self.database_path
        if path is None:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            return
        mode = path.stat().st_mode
        if mode & stat.S_IWUSR:
            return
        path.chmod(mode | stat.S_IWUSR | stat.S_IRUSR)
        logger.warning("fixed read-only permissions on database file: %s", path)


settings = Settings()
