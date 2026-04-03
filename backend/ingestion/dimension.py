"""Resolve embedding dimension from the configured model.

Uses a lookup table for known models. Falls back to a live API probe
only if the model isn't recognized. Swap the model in .env and restart --
the dimension adjusts automatically.
"""

import logging
from backend.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Known dimensions for Voyage AI models (and common OpenAI ones for future use)
KNOWN_DIMENSIONS: dict[str, int] = {
    # Voyage 3 series
    "voyage-3-large": 1024,
    "voyage-3": 1024,
    "voyage-3-lite": 512,
    # Voyage 3.5 series
    "voyage-3.5": 1024,
    "voyage-3.5-lite": 512,
    # Voyage code series
    "voyage-code-3": 1024,
    "voyage-code-3-lite": 512,
    # Voyage finance / law / multilingual
    "voyage-finance-2": 1024,
    "voyage-law-2": 1024,
    "voyage-multilingual-2": 1024,
    # Voyage 2 series
    "voyage-2": 1024,
    "voyage-large-2": 1024,
    "voyage-large-2-instruct": 1024,
    # OpenAI (if you switch providers later)
    "text-embedding-3-small": 1536,
    "text-embedding-3-large": 3072,
    "text-embedding-ada-002": 1536,
}

_detected_dimension: int | None = None


def get_embedding_dimension() -> int:
    """Return the embedding dimension for the configured model.

    Priority:
    1. Explicit config value (EMBEDDING_DIMENSION > 0 in .env)
    2. Known model lookup (no API call)
    3. Live API probe (one call, cached for the process lifetime)
    """
    global _detected_dimension

    # 1. Explicit override
    if settings.embedding_dimension > 0:
        return settings.embedding_dimension

    # 2. Lookup table
    if settings.embedding_model in KNOWN_DIMENSIONS:
        dim = KNOWN_DIMENSIONS[settings.embedding_model]
        logger.info(
            f"Embedding dimension: {dim} (model: {settings.embedding_model}, source: lookup)"
        )
        return dim

    # 3. Auto-detect via API probe (unknown model)
    if _detected_dimension is not None:
        return _detected_dimension

    logger.info(
        f"Unknown model '{settings.embedding_model}', probing API for dimension..."
    )
    import voyageai

    client = voyageai.Client(api_key=settings.voyage_api_key)
    result = client.embed(["dimension probe"], model=settings.embedding_model)
    _detected_dimension = len(result.embeddings[0])
    logger.info(
        f"Auto-detected embedding dimension: {_detected_dimension} "
        f"(model: {settings.embedding_model})"
    )
    return _detected_dimension
