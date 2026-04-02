# Changelog

All notable changes to WonderChat will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-04-01

First public release. Working prototype with the full pipeline from scraping to chat.

### Added

- FastAPI backend with async SQLAlchemy and pgvector
- Multi-tenant architecture with API key authentication
- Web scraper for crawling client websites
- Text chunking pipeline with configurable overlap
- Voyage AI embedding generation and storage
- RAG chat endpoint powered by Claude (sonnet)
- Prompt injection detection and response validation
- Redis-backed rate limiting (sliding window)
- Embeddable chat widget using Shadow DOM
- Widget supports custom colors, position, header text, and bot name
- Admin API for tenant CRUD, website ingestion, and usage stats
- Docker Compose setup for Postgres (pgvector) and Redis
- Alembic migration configuration
- Test page simulating a client website with embedded widget
