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
    embedding_dimension: int = 1024  # voyage-3-lite dimension

    # Widget
    widget_cdn_url: str = "http://localhost:8000/static"

    # CORS
    allowed_origins: str = "*"

    # Rate limiting
    rate_limit_requests: int = 30
    rate_limit_window: int = 60  # seconds

    # RAG
    rag_top_k: int = 5
    rag_max_tokens: int = 500
    llm_model: str = "claude-sonnet-4-20250514"

    # Scraper
    scraper_max_pages: int = 50
    scraper_timeout: int = 15

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
