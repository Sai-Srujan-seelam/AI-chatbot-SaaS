import logging
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from backend.config import get_settings
from backend.models.document import Document
from backend.ingestion.scraper import scrape_site
from backend.ingestion.chunker import chunk_text

logger = logging.getLogger(__name__)
settings = get_settings()

_voyage_client = None


def _get_voyage_client():
    global _voyage_client
    if _voyage_client is None:
        import voyageai

        _voyage_client = voyageai.Client(api_key=settings.voyage_api_key)
    return _voyage_client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for a batch of texts using Voyage AI."""
    client = _get_voyage_client()
    all_embeddings = []
    batch_size = 64

    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        result = client.embed(batch, model=settings.embedding_model)
        all_embeddings.extend(result.embeddings)

    return all_embeddings


async def embed_query(text: str) -> list[float]:
    """Embed a single query text."""
    client = _get_voyage_client()
    result = client.embed([text], model=settings.embedding_model, input_type="query")
    return result.embeddings[0]


async def ingest_website(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    url: str,
    max_pages: int | None = None,
    clear_existing: bool = True,
) -> dict:
    """
    Full ingestion pipeline: scrape -> chunk -> embed -> store.
    Returns stats about the ingestion.
    """
    max_pages = max_pages or settings.scraper_max_pages

    # 1. Scrape the website
    logger.info(f"Starting scrape of {url} for tenant {tenant_id}")
    pages = await scrape_site(url, max_pages=max_pages, timeout=settings.scraper_timeout)

    if not pages:
        return {"pages_scraped": 0, "chunks_stored": 0, "error": "No content found"}

    # 2. Chunk all pages
    all_chunks: list[dict] = []
    for page in pages:
        chunks = chunk_text(page["text"])
        for idx, chunk in enumerate(chunks):
            all_chunks.append({
                "content": chunk,
                "source_url": page["url"],
                "title": page["title"],
                "chunk_index": idx,
            })

    if not all_chunks:
        return {"pages_scraped": len(pages), "chunks_stored": 0, "error": "No chunks generated"}

    # 3. Generate embeddings
    logger.info(f"Generating embeddings for {len(all_chunks)} chunks")
    texts = [c["content"] for c in all_chunks]
    embeddings = await embed_texts(texts)

    # 4. Clear existing documents for this tenant if requested
    if clear_existing:
        await db.execute(
            delete(Document).where(Document.tenant_id == tenant_id)
        )

    # 5. Store in database
    documents = []
    for chunk_data, embedding in zip(all_chunks, embeddings):
        doc = Document(
            tenant_id=tenant_id,
            source_url=chunk_data["source_url"],
            title=chunk_data["title"],
            content=chunk_data["content"],
            embedding=embedding,
            chunk_index=chunk_data["chunk_index"],
            metadata_={"char_count": len(chunk_data["content"])},
        )
        documents.append(doc)

    db.add_all(documents)
    await db.commit()

    stats = {
        "pages_scraped": len(pages),
        "chunks_stored": len(documents),
        "sources": list({p["url"] for p in pages}),
    }
    logger.info(f"Ingestion complete: {stats}")
    return stats


async def ingest_text(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    text: str,
    title: str = "Manual entry",
    source_label: str = "manual",
    clear_existing: bool = False,
) -> dict:
    """
    Ingest raw text directly: chunk -> embed -> store.
    Useful for FAQs, product descriptions, or any content not on a website.
    """
    logger.info(f"Ingesting {len(text)} chars of text for tenant {tenant_id}")

    chunks = chunk_text(text)
    if not chunks:
        return {"pages_scraped": 0, "chunks_stored": 0, "error": "No chunks generated from text"}

    logger.info(f"Generating embeddings for {len(chunks)} chunks")
    embeddings = await embed_texts(chunks)

    if clear_existing:
        await db.execute(
            delete(Document).where(Document.tenant_id == tenant_id)
        )

    documents = []
    for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        doc = Document(
            tenant_id=tenant_id,
            source_url=source_label,
            title=title,
            content=chunk,
            embedding=embedding,
            chunk_index=idx,
            metadata_={"char_count": len(chunk), "source_type": "manual"},
        )
        documents.append(doc)

    db.add_all(documents)
    await db.commit()

    stats = {
        "pages_scraped": 0,
        "chunks_stored": len(documents),
        "sources": [source_label],
    }
    logger.info(f"Text ingestion complete: {stats}")
    return stats
