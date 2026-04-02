<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-blue?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" alt="FastAPI">
  <img src="https://img.shields.io/badge/Claude_API-Anthropic-6B4FBB?logo=anthropic&logoColor=white" alt="Claude API">
  <img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white" alt="pgvector">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

# WonderChat

**Your clients paste one line of JavaScript. Their website gets an AI assistant that actually knows their business.**

WonderChat is an open-source chatbot-as-a-service platform. You host it, your clients use it. The chatbot scrapes their website, learns their content, and answers visitor questions using RAG (retrieval-augmented generation) with Claude. Works on WordPress, Wix, Shopify, Squarespace, or any site that can hold a `<script>` tag.

Think Intercom meets ChatGPT, except you own every piece of it.

---

## How it works

```
Client's website                          Your backend
┌──────────────────────┐                 ┌──────────────────────────┐
│                      │                 │  FastAPI                 │
│  <script             │    HTTPS        │  ├── RAG pipeline        │
│    src="widget.js"   │ ──────────────> │  │   ├── pgvector search │
│    data-key="wc_..."│                  │  │   └── Claude API      │
│  />                  │ <────────────── │  ├── Redis rate limiter  │
│                      │    JSON reply   │  └── Multi-tenant auth   │
│  [chat bubble]       │                 │                          │
└──────────────────────┘                 └──────────────────────────┘
```

1. You create a tenant (your client) and point the scraper at their website
2. The scraper crawls their pages, chunks the text, and stores vector embeddings in Postgres
3. Their visitors ask questions through the chat widget
4. The backend retrieves the most relevant content chunks and sends them to Claude with a system prompt scoped to that business
5. Claude answers using only that business's content. No hallucinated phone numbers, no made-up hours.

---

## What's in the box

**Backend** -- FastAPI, async everywhere, multi-tenant from the ground up
- Web scraper that crawls client sites and extracts content
- Chunking pipeline with overlap for better retrieval
- Voyage AI embeddings stored in pgvector
- RAG query endpoint backed by Claude (sonnet)
- Tenant CRUD, usage stats, widget config API
- SHA-256 hashed API keys (never stored in plaintext)
- Redis sliding-window rate limiter
- Prompt injection detection and response validation

**Embeddable widget** -- one `<script>` tag, works anywhere
- Shadow DOM so client site CSS can't break it (and it can't break theirs)
- Typing indicator, smooth animations, mobile responsive
- Session persistence within a tab
- Configurable colors, position, header text, bot name

**Infrastructure** -- Docker Compose, two containers
- PostgreSQL 16 with pgvector extension
- Redis 7 for rate limiting and caching

---

## Quick start

You need Docker, Python 3.11+, and API keys for [Anthropic](https://console.anthropic.com/) and [Voyage AI](https://dash.voyageai.com/).

```bash
git clone https://github.com/Sai-Srujan-seelam/AI-chatbot-SaaS.git
cd AI-chatbot-SaaS

cp .env.example .env
# Add your keys: ANTHROPIC_API_KEY and VOYAGE_API_KEY

docker compose up -d

python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

uvicorn backend.main:app --reload --port 8000
```

API docs are at `http://localhost:8000/docs` once the server is running.

### Create a tenant and ingest their site

```bash
# Create a tenant
curl -s -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Oakton Family Dental",
    "domain": "oaktonfd.com",
    "widget_config": {
      "primary_color": "#2563eb",
      "bot_name": "Oakton Assistant",
      "welcome_message": "Hi! Ask me anything about our dental services."
    }
  }' | python -m json.tool

# Save the api_key from the response -- it's shown only once

# Ingest their website
curl -s -X POST http://localhost:8000/api/v1/admin/tenants/{TENANT_ID}/ingest \
  -H "Content-Type: application/json" \
  -d '{"url": "https://oaktonfd.com", "max_pages": 30}' | python -m json.tool
```

### Embed the widget

Paste this before `</body>` on any HTML page:

```html
<script
    src="http://localhost:8000/static/widget.js"
    data-key="wc_live_your_key_here"
    data-api="http://localhost:8000"
    data-color="#2563eb"
    data-position="bottom-right"
    defer
></script>
```

That's it. Open the page, click the chat bubble, ask a question.

---

## API reference

### Public (called by the widget)

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/v1/chat` | Send a message, get a RAG-powered reply. Requires `X-Api-Key` header. |
| `GET` | `/api/v1/admin/widget-config?api_key=...` | Returns widget theme and settings for the given key. |

### Admin

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/v1/admin/tenants` | Create a new tenant. Returns the API key (once). |
| `GET` | `/api/v1/admin/tenants` | List all tenants. |
| `GET` | `/api/v1/admin/tenants/{id}` | Get one tenant. |
| `PATCH` | `/api/v1/admin/tenants/{id}` | Update tenant settings or widget config. |
| `DELETE` | `/api/v1/admin/tenants/{id}` | Delete a tenant and all their data. |
| `POST` | `/api/v1/admin/tenants/{id}/ingest` | Scrape a URL and ingest the content. |
| `GET` | `/api/v1/admin/tenants/{id}/stats` | Conversation counts, message totals, chunk counts. |

Full interactive docs at `/docs` (Swagger) or `/redoc` when the server is running.

---

## Project layout

```
.
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, CORS, routes
│   ├── config.py                # Pydantic settings from .env
│   ├── database.py              # Async SQLAlchemy + pgvector engine
│   ├── models/
│   │   ├── tenant.py            # Client accounts
│   │   ├── document.py          # Content chunks with vector embeddings
│   │   └── conversation.py      # Chat session logs
│   ├── api/
│   │   ├── schemas.py           # Request/response validation
│   │   ├── chat.py              # The RAG chat endpoint
│   │   └── admin.py             # Tenant management, ingestion, stats
│   ├── ingestion/
│   │   ├── scraper.py           # Async website crawler
│   │   ├── chunker.py           # Recursive text splitter
│   │   └── embedder.py          # Voyage AI embeddings, full pipeline
│   └── security/
│       ├── auth.py              # API key hashing and validation
│       ├── rate_limiter.py      # Redis sliding window
│       └── guardrails.py        # Prompt injection + response filtering
├── widget/
│   ├── wonderchat-widget.js     # Embeddable chat widget (Shadow DOM)
│   └── test.html                # Test page simulating a client site
├── static/
│   └── widget.js                # Served by the backend at /static
├── alembic/                     # Database migrations
├── docker-compose.yml           # Postgres (pgvector) + Redis
├── .env.example                 # Template for environment variables
└── requirements.txt             # Python dependencies
```

---

## Security

This isn't a toy. The security layer is production-aware:

- **API keys are hashed** with SHA-256 before storage. The raw key is shown once at creation, then discarded.
- **Prompt injection detection** scans every user message against known attack patterns ("ignore previous instructions", "you are now", etc.) and blocks them.
- **Response validation** checks Claude's output for system prompt leakage before sending it to the visitor.
- **Rate limiting** uses a Redis sliding window keyed on IP + API key. Default: 30 requests per 60 seconds.
- **Shadow DOM isolation** keeps the widget's styles and DOM completely separate from the host page. Closed mode means external JS can't reach in.
- **Input sanitization** caps message length at 500 characters and strips control characters.
- **Tenant data isolation** is enforced at the query level. Every database query includes `tenant_id`. There is no "get all documents" endpoint without a tenant scope.

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## Embedding on different platforms

| Platform | Where to paste the script tag |
|----------|-------------------------------|
| WordPress | Appearance > Theme File Editor > `footer.php`, before `</body>`. Or use the WPCode plugin. |
| Wix | Settings > Custom Code > Body - end section. |
| Shopify | Online Store > Themes > Edit Code > `theme.liquid`, before `</body>`. |
| Squarespace | Settings > Advanced > Code Injection > Footer. |
| Any HTML | Before `</body>` in your template or page. |

---

## Tech stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI (Python) | Async-native, fast iteration, strong typing with Pydantic |
| Database | PostgreSQL 16 + pgvector | Vectors and relational data in one place. No extra vector DB to manage. |
| LLM | Claude via Anthropic API | Solid instruction-following, good at staying in scope |
| Embeddings | Voyage AI (voyage-3-lite) | Affordable, high quality, easy to swap later |
| Cache/rate limit | Redis 7 | Simple, fast, battle-tested |
| Widget | Vanilla JS + Shadow DOM | Zero framework dependencies on client sites |

---

## Roadmap

Things I'm planning to build next. PRs welcome for any of these.

- [ ] Admin dashboard (Next.js) with onboarding flow, analytics, and conversation logs
- [ ] Lead capture (name, email, phone) when the bot can't answer
- [ ] Appointment booking integration (Calendly, Acuity)
- [ ] Human handoff with Slack/email notifications
- [ ] Multilingual support (Claude handles this natively, just needs language detection)
- [ ] PDF and document upload for knowledge base
- [ ] Webhook/n8n integrations for events like "new lead captured"
- [ ] Streaming responses via WebSocket
- [ ] HIPAA-compliant mode for healthcare clients
- [ ] Stripe billing integration for self-serve signups

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you find a security vulnerability, please report it privately. See [SECURITY.md](SECURITY.md).

---

## License

MIT. See [LICENSE](LICENSE) for the full text.

---

Built by [Sai Srujan Seelam](https://github.com/Sai-Srujan-seelam)
