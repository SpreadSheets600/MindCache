import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application Settings And Configuration."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    DATA_DIR: Path = BASE_DIR / "data"

    # Database
    DATABASE_URL: str = "sqlite:///data/mindcache.db"

    # FAISS Vector Store
    FAISS_INDEX_PATH: str = "data/faiss_index.bin"
    EMBEDDING_DIMENSION: int = 384  # BGE-Small-En-V1.5 Dimension

    # AI Models
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # General
    LOG_LEVEL: str = "INFO"
    APP_NAME: str = "MindCache Backend"

    def model_post_init(self, __context) -> None:
        """Ensure Data Directories Exist"""

        # Extract DB Directory If SQLite
        if self.DATABASE_URL.startswith("sqlite:///"):
            db_path = self.DATABASE_URL.replace("sqlite:///", "")
            db_dir = Path(db_path).parent

            if db_dir:
                os.makedirs(db_dir, exist_ok=True)

        # Create FAISS Parent Directory
        faiss_dir = Path(self.FAISS_INDEX_PATH).parent

        if faiss_dir:
            os.makedirs(faiss_dir, exist_ok=True)

        os.makedirs(self.DATA_DIR, exist_ok=True)


settings = Settings()
