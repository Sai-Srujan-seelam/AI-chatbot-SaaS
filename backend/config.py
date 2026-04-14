from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # App
    app_env: str = "development"
    app_secret_key: str = "change-me-in-production"
    debug: bool = False  # SQL echo + verbose logging; auto-enabled in development below

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

    # JWT (client portal auth)
    jwt_secret_key: str = "change-me-jwt-secret-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24 hours

    # Twilio (SMS)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # SendGrid (email replies) — falls back to SMTP if not set
    sendgrid_api_key: str = ""

    # SMTP (for lead confirmations and notifications)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_tls: bool = True

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Enable debug automatically in development unless explicitly overridden
        if "debug" not in kwargs and self.app_env == "development":
            object.__setattr__(self, "debug", True)

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
