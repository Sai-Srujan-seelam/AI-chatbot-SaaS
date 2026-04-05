<div align="center">

# WonderChat

### Open-source Intercom alternative powered by AI

**Your clients paste one `<script>` tag. Their website gets an AI assistant that actually knows their business.**

No monthly per-seat pricing. No vendor lock-in. You own the whole stack.

[![Python](https://img.shields.io/badge/python-3.11+-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Claude API](https://img.shields.io/badge/Claude_API-Anthropic-6B4FBB?logo=anthropic&logoColor=white)](https://anthropic.com)
[![pgvector](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[Quick Start](#quick-start) · [Live Demo](#embed-the-widget) · [API Docs](#api-reference) · [Roadmap](#roadmap) · [Contributing](#contributing)

</div>

---

## The Problem

Intercom charges **$39/seat/month**. Drift starts at **$2,500/month**. Tidio, Zendesk, LivePerson -- they all add up fast when you're reselling to clients.

Your clients just want a chat bubble that answers "What are your hours?" without hallucinating.

## The Solution

WonderChat scrapes your client's website, chunks it, embeds it with Voyage AI, stores it in pgvector, and uses Claude to answer questions **using only that business's content**. No hallucinated phone numbers. No made-up pricing. No "as an AI language model" responses.

You host it once. Every client gets their own isolated tenant with their own API key, their own knowledge base, and their own branded widget.

---

## How It Works

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

1. **Create a tenant** for your client via the admin dashboard or API
2. **Point the scraper** at their website -- it crawls pages, chunks the text, and stores vector embeddings
3. **Give them a script tag** -- one line of HTML, works on any platform
4. **Visitors ask questions** through the chat widget, get answers grounded in real content

---

## Why WonderChat Over the Alternatives

| | WonderChat | Intercom | Drift | Tidio |
|---|---|---|---|---|
| **Pricing** | Free (self-hosted) | $39/seat/mo | $2,500/mo | $29/mo |
| **AI grounded in client content** | Yes (RAG) | Partial | Partial | No |
| **Multi-tenant (resell to clients)** | Built-in | No | No | No |
| **Own your data** | 100% | No | No | No |
| **Self-hosted** | Yes | No | No | No |
| **Open source** | MIT | No | No | No |
| **Setup time** | 5 minutes | Hours | Hours | Hours |

---

## What's In The Box

### Backend -- FastAPI, async everywhere, multi-tenant from day one
- Web scraper that crawls client sites and extracts clean content
- Chunking pipeline with semantic boundaries and overlap for better retrieval
- Voyage AI embeddings stored in pgvector with HNSW indexing
- RAG chat endpoint backed by Claude with similarity thresholds
- Tenant CRUD, usage stats, billing period tracking, widget config API
- SHA-256 hashed API keys (never stored in plaintext)
- Redis sliding-window rate limiter (proper sorted-set implementation)
- Prompt injection detection (16 patterns) and response leak validation
- Non-blocking embedding calls via thread pool executor

### Embeddable Widget -- one `<script>` tag, works anywhere
- Shadow DOM isolation -- client CSS can't break it, and it can't break theirs
- 25+ config options: colors, position, bot name, avatar, animations
- Typing indicator, smooth animations, mobile responsive
- Light/dark/auto theme with system preference detection
- Session persistence and conversation history in localStorage
- Public JS API: `WonderChat.open()`, `.close()`, `.sendMessage()`, `.clearHistory()`

### Admin Dashboard -- Next.js, full management UI
- Token-based login with your APP_SECRET_KEY
- Dashboard with server health, stat cards, and tenant overview
- Tenant management: create, edit, delete, API key rotation
- Trigger website scraping and text ingestion from the browser
- View conversation logs and document chunks per tenant
- Edit all widget config fields with live preview

### Infrastructure -- Docker Compose, two containers
- PostgreSQL 16 with pgvector extension
- Redis 7 for rate limiting

---

## Quick Start

You need Docker, Python 3.11+, and API keys for [Anthropic](https://console.anthropic.com/) and [Voyage AI](https://dash.voyageai.com/).

```bash
# Clone and configure
git clone https://github.com/Sai-Srujan-seelam/AI-chatbot-SaaS.git
cd AI-chatbot-SaaS
cp .env.example .env
# Add your keys: ANTHROPIC_API_KEY, VOYAGE_API_KEY, and APP_SECRET_KEY

# Start infrastructure
docker compose up -d

# Install and run backend
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

API docs at `http://localhost:8000/docs` once the server is running.

### Admin Dashboard (optional)

```bash
cd admin
npm install
npm run dev
# Open http://localhost:3000 and sign in with your APP_SECRET_KEY
```

Set `NEXT_PUBLIC_API_URL` if your backend isn't at `http://localhost:8000`.

### Create a Tenant and Ingest Their Site

```bash
# Create a tenant (save the api_key from the response -- shown only once)
curl -s -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "Authorization: Bearer YOUR_APP_SECRET_KEY" \
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

# Ingest their website
curl -s -X POST http://localhost:8000/api/v1/admin/tenants/{TENANT_ID}/ingest \
  -H "Authorization: Bearer YOUR_APP_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://oaktonfd.com", "max_pages": 30}' | python -m json.tool
```

### Embed the Widget

Paste this before `</body>` on any HTML page:

```html
<script
  src="http://localhost:8000/static/widget.js"
  data-key="wc_live_your_key_here"
  data-api="http://localhost:8000"
  defer
></script>
```

That's it. Open the page, click the chat bubble, ask a question.

---

## Embedding on Different Platforms

| Platform | Where to paste the script tag |
|----------|-------------------------------|
| **WordPress** | Appearance > Theme File Editor > `footer.php`, before `</body>`. Or use the WPCode plugin. |
| **Wix** | Settings > Custom Code > Body - end section. |
| **Shopify** | Online Store > Themes > Edit Code > `theme.liquid`, before `</body>`. |
| **Squarespace** | Settings > Advanced > Code Injection > Footer. |
| **Webflow** | Project Settings > Custom Code > Footer Code. |
| **Any HTML** | Before `</body>` in your template or page. |

---

## API Reference

### Public (called by the widget)

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/v1/chat` | Send a message, get a RAG-powered reply. Requires `X-Api-Key` header. |
| `GET` | `/api/v1/admin/widget-config?api_key=...` | Returns widget theme and settings for the given key. |

### Admin (requires `Authorization: Bearer` header)

| Method | Endpoint | What it does |
|--------|----------|--------------|
| `POST` | `/api/v1/admin/tenants` | Create a new tenant. Returns the API key (once). |
| `GET` | `/api/v1/admin/tenants` | List all tenants (paginated). |
| `GET` | `/api/v1/admin/tenants/{id}` | Get one tenant. |
| `PATCH` | `/api/v1/admin/tenants/{id}` | Update tenant settings or widget config. |
| `DELETE` | `/api/v1/admin/tenants/{id}` | Delete a tenant and all their data. |
| `POST` | `/api/v1/admin/tenants/{id}/rotate-key` | Generate a new API key (old one dies immediately). |
| `POST` | `/api/v1/admin/tenants/{id}/ingest` | Scrape a URL and ingest the content. |
| `POST` | `/api/v1/admin/tenants/{id}/ingest-text` | Ingest raw text (FAQs, docs, product info). |
| `GET` | `/api/v1/admin/tenants/{id}/documents` | List ingested document chunks. |
| `GET` | `/api/v1/admin/tenants/{id}/conversations` | View conversation logs. |
| `GET` | `/api/v1/admin/tenants/{id}/stats` | Usage stats, conversation counts, chunk counts. |

Full interactive docs at `/docs` (Swagger) or `/redoc` when the server is running.

---

## Architecture

```
.
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, CORS, routes
│   ├── config.py                # Pydantic settings from .env
│   ├── database.py              # Async SQLAlchemy + pgvector engine
│   ├── models/
│   │   ├── tenant.py            # Client accounts, billing, widget config
│   │   ├── document.py          # Content chunks with vector embeddings
│   │   └── conversation.py      # Chat session logs
│   ├── api/
│   │   ├── schemas.py           # Request/response validation (Pydantic)
│   │   ├── chat.py              # RAG chat endpoint with similarity filtering
│   │   └── admin.py             # Tenant CRUD, ingestion, stats, widget config
│   ├── ingestion/
│   │   ├── scraper.py           # Async BFS website crawler
│   │   ├── chunker.py           # Recursive text splitter with semantic boundaries
│   │   ├── embedder.py          # Voyage AI embeddings (thread-pool, non-blocking)
│   │   └── dimension.py         # Auto-detect embedding dimensions per model
│   └── security/
│       ├── auth.py              # API key generation, hashing, validation
│       ├── admin_auth.py        # Bearer token admin authentication
│       ├── rate_limiter.py      # Redis sorted-set sliding window
│       └── guardrails.py        # Prompt injection detection + response filtering
├── widget/
│   ├── wonderchat-widget.js     # Embeddable chat widget (Shadow DOM)
│   └── test.html                # Test page simulating a client site
├── admin/                       # Next.js admin dashboard
│   ├── src/app/                 # App router pages (login, dashboard, tenants)
│   ├── src/components/          # Sidebar, auth guard
│   └── src/lib/api.ts           # Typed API client with error handling
├── static/
│   └── widget.js                # Served by the backend at /static
├── docker-compose.yml           # PostgreSQL 16 (pgvector) + Redis 7
├── .env.example                 # Template for environment variables
└── requirements.txt             # Python dependencies
```

---

## Security

This isn't a toy. The security layer is production-aware:

- **API keys are hashed** with SHA-256 before storage. The raw key is shown once at creation, then discarded.
- **Prompt injection detection** scans every user message against known attack patterns ("ignore previous instructions", "you are now", "jailbreak", etc.) and blocks them.
- **Response validation** checks Claude's output for system prompt leakage before sending it to the visitor.
- **Rate limiting** uses a Redis sliding window (sorted sets) keyed on IP + API key. No burst exploits at window boundaries.
- **Shadow DOM isolation** keeps the widget's styles and DOM completely separate from the host page.
- **XSS prevention** -- source links are built with safe DOM APIs, not innerHTML. URL scheme validation blocks non-HTTP URLs.
- **Input sanitization** caps message length and strips control characters.
- **Tenant data isolation** is enforced at the query level. Every database query includes `tenant_id`.
- **Similarity thresholds** prevent the bot from answering with irrelevant content when it doesn't know.

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI (Python) | Async-native, fast iteration, strong typing with Pydantic |
| Database | PostgreSQL 16 + pgvector | Vectors and relational data in one place. HNSW indexing. No extra vector DB. |
| LLM | Claude via Anthropic API | Best instruction-following, stays in scope, doesn't hallucinate |
| Embeddings | Voyage AI (voyage-3-lite) | Affordable, high quality, swappable (OpenAI also supported) |
| Rate Limiting | Redis 7 | Sorted-set sliding window, battle-tested |
| Widget | Vanilla JS + Shadow DOM | Zero framework dependencies on client sites |
| Admin | Next.js + Tailwind | Fast to build, great DX |

---

## Roadmap

Things planned for upcoming releases. PRs welcome for any of these.

- [x] Multi-tenant backend with RAG pipeline
- [x] Embeddable widget with full customization (25+ config options)
- [x] Admin dashboard with tenant management, analytics, and conversation logs
- [x] Manual text ingestion (FAQs, docs, product info)
- [x] HNSW vector indexing for fast search at scale
- [x] Billing period auto-reset and usage enforcement
- [ ] Streaming responses via SSE/WebSocket
- [ ] PDF and document upload for knowledge base
- [ ] Lead capture (name, email, phone) when the bot can't answer
- [ ] Human handoff with Slack/email notifications
- [ ] Appointment booking integration (Calendly, Acuity)
- [ ] Multilingual support with auto language detection
- [ ] Webhook/n8n integrations for events like "new lead captured"
- [ ] Stripe billing integration for self-serve client signups
- [ ] One-click deploy (Railway, Render, Fly.io)
- [ ] HIPAA-compliant mode for healthcare clients

---

## Use Cases

WonderChat works for anyone who resells websites or digital services:

- **Web agencies** -- add AI chat to every client site as an upsell
- **SaaS platforms** -- embed AI support in your product
- **Freelancers** -- offer "AI assistant setup" as a service
- **Local businesses** -- answer "what are your hours" 24/7 without paying for live chat
- **E-commerce** -- product questions answered instantly from your catalog
- **Healthcare** -- patient FAQ automation (appointment info, insurance, services)
- **Real estate** -- property and listing questions answered from your site content
- **Education** -- student FAQ bots for course info, admissions, campus services

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you find a security vulnerability, please report it privately. See [SECURITY.md](SECURITY.md).

---

## Star History

If this project is useful to you, consider giving it a star. It helps others find it.

---

## License

MIT. See [LICENSE](LICENSE) for the full text.

---

<div align="center">

Built by [Sai Srujan Seelam](https://github.com/Sai-Srujan-seelam)

If you found this useful, [give it a star](https://github.com/Sai-Srujan-seelam/AI-chatbot-SaaS) -- it helps more people find it.

</div>
