import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from backend.config import get_settings
from backend.database import engine, Base
from backend.api.chat import router as chat_router
from backend.api.admin import router as admin_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables (dev only — use Alembic in production)
    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.execute(
            __import__("sqlalchemy").text("CREATE EXTENSION IF NOT EXISTS vector")
        )
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database ready.")
    yield
    # Shutdown
    await engine.dispose()
    logger.info("Shutdown complete.")


app = FastAPI(
    title="WonderChat API",
    description="AI Chatbot-as-a-Service platform",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
origins = settings.allowed_origins
if origins == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in origins.split(",")],
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-Api-Key", "Authorization"],
    )

# Static files (widget JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routes
app.include_router(chat_router, prefix="/api/v1", tags=["Chat"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.1.0"}
