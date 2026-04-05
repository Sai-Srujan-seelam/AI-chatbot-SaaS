from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    debug: bool = True

    # Database
    database_url: str = "postgresql+asyncpg://wonder:localdev123@localhost:5433/wonderchat"
    database_url_sync: str = "postgresql://wonder:localdev123@localhost:5433/wonderchat"

    # Redis
    redis_url: str = "redis://localhost:6379"

    # Anthropic
    anthropic_api_key: str = ""

    # Embeddings
    voyage_api_key: str = ""
    openai_api_key: str = ""
    embedding_model: str = "voyage-3-lite"
    embedding_dimension: int = 0  # 0 = auto-detect from model on startup

    # Widget
    widget_cdn_url: str = "http://localhost:8000/static"

    # CORS
    allowed_origins: str = "*"

    # Rate limiting
    rate_limit_requests: int = 30
    rate_limit_window: int = 60  # seconds

    # RAG
    rag_top_k: int = 5
    rag_max_tokens: int = 1024
    llm_model: str = "claude-sonnet-4-20250514"

    # Scraper
    scraper_max_pages: int = 50
    scraper_timeout: int = 15

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Shell may export empty ANTHROPIC_API_KEY (e.g. from Claude Code).
        # If the loaded value is empty, re-read directly from .env.
        if not self.anthropic_api_key:
            self._load_from_env_file("anthropic_api_key", "ANTHROPIC_API_KEY")

    def _load_from_env_file(self, attr: str, env_key: str):
        """Fallback: read a key directly from .env when shell env is empty."""
        try:
            with open(".env") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith(f"{env_key}=") and not line.startswith("#"):
                        value = line.split("=", 1)[1].strip()
                        if value:
                            object.__setattr__(self, attr, value)
                        break
        except FileNotFoundError:
            pass


@lru_cache()
def get_settings() -> Settings:
    return Settings()
