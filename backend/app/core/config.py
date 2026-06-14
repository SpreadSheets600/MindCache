import os
import stat as stat_module
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
    DATABASE_URL: str = "sqlite:///" + str(BASE_DIR / "data" / "mindcache.db")

    # FAISS Vector Store
    FAISS_INDEX_PATH: str = "data/faiss_index.bin"
    BM25_INDEX_PATH: str = "data/bm25_index.pkl"
    EMBEDDING_DIMENSION: int = 384  # Default/fallback Dimension

    # AI Models
    EMBEDDING_PROVIDER: str = "huggingface"  # "huggingface" or "ollama"
    EMBEDDING_MODEL_NAME: str = "BAAI/bge-small-en-v1.5"
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3"

    # General
    LOG_LEVEL: str = "INFO"
    APP_NAME: str = "MindCache Backend"

    def model_post_init(self, __context) -> None:
        """Ensure Data Directories Exist and Validate Permissions"""

        os.makedirs(self.DATA_DIR, mode=0o755, exist_ok=True)

        # Create FAISS Parent Directory
        faiss_dir = Path(self.FAISS_INDEX_PATH).parent
        if faiss_dir:
            os.makedirs(faiss_dir, mode=0o755, exist_ok=True)

        # Ensure the database directory and file are writable
        if self.DATABASE_URL.startswith("sqlite:///"):
            db_path_str = self.DATABASE_URL.replace("sqlite:///", "")
            db_path = Path(db_path_str)
            db_dir = db_path.parent

            os.makedirs(db_dir, mode=0o755, exist_ok=True)

            # If the database file already exists, ensure it's writable
            if db_path.exists():
                file_mode = db_path.stat().st_mode
                if not (file_mode & stat_module.S_IWUSR):
                    db_path.chmod(stat_module.S_IWUSR | stat_module.S_IRUSR | stat_module.S_IRGRP | stat_module.S_IROTH)
                    import logging
                    logging.getLogger("app.core.config").warning(
                        f"Fixed read-only permissions on database file: {db_path}"
                    )


settings = Settings()
