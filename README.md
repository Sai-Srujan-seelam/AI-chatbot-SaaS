<div align="center">

# WonderAvenues

### The open-source AI platform for client websites

**AI chatbot + client portal + lead management -- deploy once, serve every client.**

One `<script>` tag gives any website a smart assistant. One dashboard gives your clients full visibility into leads, conversations, and performance.

[![Python](https://img.shields.io/badge/python-3.11+-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-16-000?logo=next.js&logoColor=white)](https://nextjs.org)
[![Claude API](https://img.shields.io/badge/Claude-Anthropic-6B4FBB?logo=anthropic&logoColor=white)](https://anthropic.com)
[![pgvector](https://img.shields.io/badge/PostgreSQL-pgvector-4169E1?logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[Quick Start](#quick-start) · [Client Portal](#client-portal) · [API Docs](#api-reference) · [Architecture](#architecture) · [Roadmap](#roadmap)

</div>

---

## What This Is

WonderAvenues is a complete AI-powered platform you self-host and resell to clients. It has three layers:

1. **AI Chatbot Widget** -- embeddable chat bubble that answers visitor questions using the client's own website content (RAG pipeline with Claude + pgvector)
2. **Client Portal** -- per-tenant dashboard where each client manages their leads, reads conversations, configures their chatbot, and tracks analytics
3. **Admin Panel** -- your internal dashboard to onboard tenants, manage portal users, and monitor the entire platform

Every tenant is fully isolated. Their data, API keys, portal logins, and chatbot config are scoped to their `tenant_id` at the database query level.

---

## Why WonderAvenues

| | WonderAvenues | Intercom | DearDoc | Drift |
|---|---|---|---|---|
| **Pricing** | Free (self-hosted) | $39/seat/mo | Custom | $2,500/mo |
| **AI grounded in client content** | Yes (RAG) | Partial | Yes | Partial |
| **Multi-tenant** | Built-in | No | No | No |
| **Client-facing portal** | Yes | No | Yes | No |
| **Lead management** | Yes | Add-on | Yes | Yes |
| **Own your data** | 100% | No | No | No |
| **Open source** | MIT | No | No | No |

---

## Platform Overview

### AI Chatbot Widget

The chat widget works on any website with one line of HTML. It uses Shadow DOM isolation so it never conflicts with client CSS.

- RAG pipeline: scrape site, chunk text, embed with Voyage AI, store in pgvector, answer with Claude
- 25+ config options (colors, position, bot name, avatar, animations, themes)
- Lead capture form when the bot detects buying intent
- Demo booking CTA during conversations
- Session persistence in localStorage
- Public JS API: `WonderChat.open()`, `.close()`, `.sendMessage()`, `.clearHistory()`

### Client Portal

Each client gets their own login at `/portal` with JWT-based auth. The portal includes:

| Page | What it does |
|------|-------------|
| **Dashboard** | Stat cards, recent leads, status breakdown, quick actions |
| **Leads** | Filterable/searchable table with status, source, date range filters and pagination |
| **Lead Detail** | Full chatbot conversation, threaded reply inbox, status management |
| **Inbox** | Split-pane view of all AI chatbot conversations with search and lead linking |
| **Analytics** | Three tabs -- Lead Overview (funnel, sources, trends), Chatbot Metrics (volume, top questions, chat-to-lead rate), Engagement & ROI (response time distribution, weekly trends) |
| **Chatbot Config** | Four tabs -- Appearance (colors, position, avatar), Behavior (auto-open, sound, typing indicator), Lead Capture (form fields, triggers), Knowledge Base (chunk stats) |
| **Notifications** | In-app notifications for new leads and replies with unread badges |
| **Settings** | Profile editor, notification preferences, password change |
| **Tools** | Placeholders for Payments, Patient Forms, and Reputation tools |

Clients can reply to leads via **email**, **SMS** (Twilio), or **internal notes**, with template support for common responses.

### Admin Panel

Your internal control center for the whole platform:

- Create and manage tenants
- Onboard portal users (owner / manager / staff roles)
- Trigger website scraping and content ingestion
- View conversation logs and document chunks
- Master analytics across all tenants
- API key rotation and widget config editing

---

## Quick Start

**Requirements:** Docker, Python 3.11+, Node.js 18+, API keys for [Anthropic](https://console.anthropic.com/) and [Voyage AI](https://dash.voyageai.com/).

### 1. Clone and configure

```bash
git clone https://github.com/Sai-Srujan-seelam/AI-chatbot-SaaS.git
cd AI-chatbot-SaaS
cp .env.example .env
# Fill in: ANTHROPIC_API_KEY, VOYAGE_API_KEY, APP_SECRET_KEY, JWT_SECRET_KEY
```

### 2. Start infrastructure

```bash
docker compose up -d   # PostgreSQL 16 (pgvector) + Redis 7
```

### 3. Run the backend

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

### 4. Run the admin panel

```bash
cd admin && npm install && npm run dev
# Open http://localhost:3000 -- sign in with your APP_SECRET_KEY
```

### 5. Run the client portal

```bash
cd portal && npm install && npm run dev
# Open http://localhost:3001/login -- sign in with portal credentials
```

### 6. Create a tenant and embed the widget

```bash
# Create a tenant via API (or use the admin UI)
curl -s -X POST http://localhost:8000/api/v1/admin/tenants \
  -H "Authorization: Bearer YOUR_APP_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Oakton Family Dental", "domain": "oaktonfd.com"}' | python -m json.tool

# Ingest their website
curl -s -X POST http://localhost:8000/api/v1/admin/tenants/{TENANT_ID}/ingest \
  -H "Authorization: Bearer YOUR_APP_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://oaktonfd.com", "max_pages": 30}' | python -m json.tool
```

Then paste this before `</body>` on the client's site:

```html
<script
  src="http://localhost:8000/static/widget.js"
  data-key="wc_live_your_key_here"
  data-api="http://localhost:8000"
  defer
></script>
```

Create a portal user for the client from the admin panel's tenant detail page. They can then log into the client portal and see their leads, conversations, and analytics.

---

## Embedding on Different Platforms

| Platform | Where to paste the script tag |
|----------|-------------------------------|
| **WordPress** | Appearance > Theme File Editor > `footer.php`, before `</body>` |
| **Wix** | Settings > Custom Code > Body - end section |
| **Shopify** | Online Store > Themes > Edit Code > `theme.liquid`, before `</body>` |
| **Squarespace** | Settings > Advanced > Code Injection > Footer |
| **Webflow** | Project Settings > Custom Code > Footer Code |
| **Any HTML** | Before `</body>` in your template |

---

## API Reference

### Public (widget)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/chat` | Send a message, get a RAG-powered reply. Requires `X-Api-Key`. |
| `GET` | `/api/v1/admin/widget-config?api_key=...` | Widget theme and settings for the given key. |

### Client Portal (JWT auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/portal/login` | Authenticate and receive JWT token |
| `GET` | `/api/v1/portal/dashboard` | Dashboard stats and recent leads |
| `GET` | `/api/v1/portal/leads` | List leads with filters (status, source, search, date range) |
| `GET` | `/api/v1/portal/leads/{id}` | Lead detail with conversation and reply thread |
| `PATCH` | `/api/v1/portal/leads/{id}/status` | Update lead status |
| `POST` | `/api/v1/portal/leads/{id}/reply` | Reply via email, SMS, or internal note |
| `GET` | `/api/v1/portal/conversations` | List all chatbot conversations |
| `GET` | `/api/v1/portal/conversations/{id}` | Conversation detail with messages |
| `GET/PATCH` | `/api/v1/portal/chatbot-config` | Read or update chatbot configuration |
| `GET` | `/api/v1/portal/analytics` | Lead funnel, source breakdown, trends |
| `GET` | `/api/v1/portal/analytics/conversations` | Chat volume, top questions, conversion rate |
| `GET` | `/api/v1/portal/analytics/engagement` | Response times, weekly trends, ROI metrics |
| `GET` | `/api/v1/portal/notifications` | Notification list with unread count |

### Admin (Bearer token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/admin/tenants` | Create tenant (API key shown once) |
| `GET` | `/api/v1/admin/tenants` | List all tenants |
| `PATCH` | `/api/v1/admin/tenants/{id}` | Update tenant settings |
| `DELETE` | `/api/v1/admin/tenants/{id}` | Delete tenant and all data |
| `POST` | `/api/v1/admin/tenants/{id}/rotate-key` | Rotate API key |
| `POST` | `/api/v1/admin/tenants/{id}/ingest` | Scrape and ingest website content |
| `POST` | `/api/v1/admin/tenants/{id}/portal-users` | Create portal user for tenant |
| `GET` | `/api/v1/admin/master-analytics` | Cross-tenant analytics |

Full interactive docs at `/docs` (Swagger) or `/redoc`.

---

## Architecture

```
.
├── backend/
│   ├── main.py                  # FastAPI app, CORS, route registration
│   ├── config.py                # Pydantic settings from .env
│   ├── database.py              # Async SQLAlchemy + pgvector
│   ├── models/
│   │   ├── tenant.py            # Client accounts, billing, widget config
│   │   ├── document.py          # Content chunks with vector embeddings
│   │   ├── conversation.py      # Chat session logs
│   │   ├── lead.py              # Captured leads with status tracking
│   │   ├── client_user.py       # Portal login accounts (per-tenant)
│   │   ├── message.py           # Threaded replies (email/SMS/internal)
│   │   └── notification.py      # In-app notification system
│   ├── api/
│   │   ├── chat.py              # RAG chat + lead capture + notifications
│   │   ├── admin.py             # Tenant CRUD, portal user management
│   │   ├── portal.py            # Client portal API (47 routes)
│   │   ├── portal_schemas.py    # Pydantic models for portal
│   │   └── schemas.py           # Pydantic models for admin/chat
│   ├── ingestion/
│   │   ├── scraper.py           # Async BFS website crawler
│   │   ├── chunker.py           # Recursive text splitter
│   │   ├── embedder.py          # Voyage AI embeddings (non-blocking)
│   │   └── dimension.py         # Auto-detect embedding dimensions
│   ├── security/
│   │   ├── auth.py              # API key hashing and validation
│   │   ├── admin_auth.py        # Bearer token admin auth
│   │   ├── portal_auth.py       # JWT auth with tenant isolation
│   │   ├── rate_limiter.py      # Redis sliding-window rate limiter
│   │   └── guardrails.py        # Prompt injection detection
│   └── services/
│       └── sms.py               # Twilio SMS integration
├── portal/                      # Next.js client portal (11 pages)
│   └── src/
│       ├── app/                 # Dashboard, leads, inbox, analytics, config...
│       ├── components/          # Sidebar, auth guard
│       └── lib/api.ts           # Typed API client
├── admin/                       # Next.js admin dashboard
│   └── src/
│       ├── app/                 # Login, dashboard, tenant management
│       ├── components/          # Sidebar, auth guard
│       └── lib/api.ts           # Typed API client
├── widget/
│   └── wonderchat-widget.js     # Embeddable chat widget (Shadow DOM)
├── static/widget.js             # Served by backend at /static
├── docker-compose.yml           # PostgreSQL 16 + Redis 7
└── .env.example                 # Environment variable template
```

---

## Security

- **API keys** hashed with SHA-256 before storage. Raw key shown once at creation.
- **JWT auth** for portal with tenant_id validation on every request. Tokens are verified against the database user's actual tenant.
- **Tenant isolation** enforced at the query level -- every database query filters by `tenant_id`.
- **Prompt injection detection** scans messages against known attack patterns and blocks them.
- **Response validation** checks Claude's output for system prompt leakage.
- **Rate limiting** via Redis sliding window (sorted sets), keyed on IP + API key.
- **Shadow DOM isolation** keeps the widget separate from the host page.
- **XSS prevention** with safe DOM APIs, URL scheme validation, and input sanitization.
- **Timing-safe comparison** for auth operations to prevent timing attacks.
- **Password hashing** with bcrypt for portal user credentials.

See [SECURITY.md](SECURITY.md) for the vulnerability disclosure policy.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | FastAPI (async Python) | API server, RAG pipeline, multi-tenant logic |
| Database | PostgreSQL 16 + pgvector | Relational data + vector search in one database |
| LLM | Claude (Anthropic) | Grounded Q&A that stays in scope |
| Embeddings | Voyage AI | High-quality vector embeddings |
| Cache | Redis 7 | Rate limiting, session management |
| Client Portal | Next.js 16 + React 19 + Tailwind | Per-tenant lead management dashboard |
| Admin Panel | Next.js + Tailwind | Platform management UI |
| Widget | Vanilla JS + Shadow DOM | Zero-dependency embeddable chat |
| SMS | Twilio | Lead reply via text message |

---

## Roadmap

- [x] Multi-tenant backend with RAG pipeline
- [x] Embeddable widget with 25+ config options
- [x] Admin dashboard with tenant management
- [x] Client portal with JWT auth and tenant isolation
- [x] Lead management with filtering, search, and status tracking
- [x] Conversation inbox with full message history
- [x] Reply system (email, SMS, internal notes)
- [x] In-app notifications with real-time polling
- [x] Chatbot configuration editor (appearance, behavior, lead capture)
- [x] Analytics dashboard (lead funnel, chatbot metrics, engagement & ROI)
- [x] Lead capture during chatbot conversations
- [x] Demo booking CTA
- [x] HNSW vector indexing
- [ ] Streaming responses via SSE/WebSocket
- [ ] PDF and document upload for knowledge base
- [ ] Appointment booking integration (Calendly, Acuity)
- [ ] Multilingual support with auto language detection
- [ ] Webhook/n8n integrations
- [ ] Stripe billing for self-serve signups
- [ ] One-click deploy (Railway, Render, Fly.io)
- [ ] HIPAA-compliant mode for healthcare clients

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

If you find a security vulnerability, please report it privately. See [SECURITY.md](SECURITY.md).

---

## License

MIT. See [LICENSE](LICENSE) for the full text.

---

<div align="center">

Built by [Sai Srujan Seelam](https://github.com/Sai-Srujan-seelam)

</div>
