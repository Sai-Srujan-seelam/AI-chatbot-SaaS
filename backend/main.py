import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.base import BaseHTTPMiddleware
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
    from sqlalchemy import text as sa_text
    from backend.ingestion.dimension import get_embedding_dimension

    dim = get_embedding_dimension()
    logger.info(f"Embedding dimension: {dim} (model: {settings.embedding_model})")

    logger.info("Creating database tables...")
    async with engine.begin() as conn:
        await conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))

        # Auto-migrate: if documents table exists but vector column has wrong dimension, fix it
        row = await conn.execute(sa_text(
            "SELECT atttypmod FROM pg_attribute "
            "WHERE attrelid = 'documents'::regclass AND attname = 'embedding'"
        ))
        existing = row.scalar_one_or_none()
        if existing is not None and existing != dim:
            logger.warning(
                f"Embedding column dimension mismatch: DB has {existing}, model needs {dim}. "
                f"Migrating column (existing embeddings will be dropped)..."
            )
            await conn.execute(sa_text("DELETE FROM documents"))
            await conn.execute(sa_text(
                f"ALTER TABLE documents ALTER COLUMN embedding TYPE vector({dim})"
            ))
            logger.info(f"Migrated embedding column to vector({dim})")

        await conn.run_sync(Base.metadata.create_all)

        # Create HNSW index on embedding column for fast vector search.
        # Uses cosine distance (<=>). IF NOT EXISTS avoids errors on restart.
        await conn.execute(sa_text(
            "CREATE INDEX IF NOT EXISTS idx_documents_embedding_hnsw "
            "ON documents USING hnsw (embedding vector_cosine_ops)"
        ))
        # Composite index for tenant-scoped queries
        await conn.execute(sa_text(
            "CREATE INDEX IF NOT EXISTS idx_documents_tenant_id "
            "ON documents (tenant_id)"
        ))
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

# Middleware to prevent caching of widget JS (browsers aggressively cache .js files)
class NoCacheWidgetMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/static/widget"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheWidgetMiddleware)

# Static files (widget JS)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Routes
app.include_router(chat_router, prefix="/api/v1", tags=["Chat"])
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])


@app.get("/health")
async def health_check():
    """Health check with database connectivity test."""
    try:
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_status = "connected"
    except Exception:
        db_status = "disconnected"

    return {"status": "ok", "version": "0.1.0", "database": db_status}
