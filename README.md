# Wikipedia Smart Search & QA System

A full-stack RAG (Retrieval-Augmented Generation) application that answers questions using live Wikipedia data, semantic search, and a pluggable language model — with token streaming, JWT auth, and built-in observability.

```
┌─────────────────┐  SSE stream  ┌──────────────────────────────────────────────┐
│  React Frontend │ ────────────► │  FastAPI Backend (v4)                         │
│  Vite · :3000   │              │  1. Fetch 1–5 Wikipedia articles               │
│  streaming UI   │ ◄──────────── │  2. Split into passages (NLTK sentence chunk)  │
└─────────────────┘  token/done  │  3. Encode — sentence-transformers bi-encoder  │
                                  │  4. Vector search — FAISS  or  Pinecone        │
                                  │  5. Cross-encoder re-ranking                   │
                                  │  6. LLM answer — flan-t5 / OpenAI / Anthropic │
                                  │  7. TTL cache · Prometheus metrics             │
                                  └──────────────────────────────────────────────┘
```

---

## Features

| Category | What's included |
|----------|----------------|
| **RAG pipeline** | Bi-encoder retrieval → cross-encoder re-ranking → LLM generation |
| **Multi-article** | Fetches 1–5 Wikipedia articles, merges passages with per-source tracking |
| **Token streaming** | `/ask/stream` SSE endpoint — status events + word-by-word tokens like ChatGPT |
| **Multi-LLM** | `LLM_PROVIDER=local` (flan-t5-small) · `openai` (gpt-4o-mini) · `anthropic` (Claude Haiku) |
| **Vector store** | `VECTOR_STORE=faiss` (default, local) · `pinecone` (serverless, cloud) |
| **React chat UI** | Premium dark "Emerald Nocturne" design — streaming bubbles, passage cards with scores, related topic chips, history bento grid |
| **JWT auth** | Register/login, per-user query history in SQLite |
| **Observability** | `/metrics/prometheus` + Prometheus + Grafana dashboard (docker-compose) |
| **Evaluation** | Precision@k, MRR@k, p50/p95/p99 latency via `eval/evaluate.py` |
| **Production** | Rate limiting, API key auth, Docker, GitHub Actions CI/CD, EC2 free-tier optimised |

---

## Project Structure

```
wiki/
├── backend/
│   ├── main.py             # FastAPI — /ask, /ask/stream, /auth/*, /metrics, /evaluate
│   ├── auth.py             # JWT create/decode, bcrypt password hashing
│   ├── database.py         # SQLite — users + query history
│   ├── answer_generator.py # Multi-LLM: flan-t5 / OpenAI / Anthropic + stream_tokens()
│   ├── search.py           # FAISS IndexFlatIP + Pinecone drop-in (VECTOR_STORE flag)
│   ├── reranker.py         # Cross-encoder re-ranking (ms-marco-MiniLM-L-6-v2)
│   ├── embeddings.py       # Sentence-transformer singleton (all-MiniLM-L6-v2)
│   ├── wikipedia_api.py    # Wikipedia fetch & disambiguation handling
│   └── cache.py            # TTL in-memory response cache
├── frontend_react/         # React 18 + Vite + Tailwind CSS (Emerald Nocturne design)
│   └── src/
│       ├── App.jsx         # Root — streaming chat loop, JWT state, view routing
│       ├── api.js          # askStream() async generator + ask/login/register/history
│       └── components/
│           ├── AuthModal.jsx     # Login / register modal (Screen 1)
│           ├── ChatMessage.jsx   # User / streaming / assistant / error bubbles (Screen 3)
│           ├── QueryInput.jsx    # Glass input bar with send button (Screen 3)
│           ├── Sidebar.jsx       # Nav sidebar + SettingsPanel export (Screens 2–4)
│           ├── PassageCard.jsx   # Passage card with score badge + source link
│           └── HistoryView.jsx   # Bento-grid research history (Screen 4)
├── eval/
│   └── evaluate.py         # CLI benchmark — Precision@k, MRR, latency
├── tests/
│   └── test_api.py         # 36 pytest tests (unit + integration)
├── utils/
│   ├── text_cleaner.py     # NLTK sentence chunking, Wikipedia markup strip
│   └── logger.py           # Centralized logging
├── scripts/
│   ├── push_to_dockerhub.sh  # Build locally and push to Docker Hub
│   └── ec2_setup.sh          # EC2 one-shot setup (swap + Docker + deploy)
├── grafana/provisioning/   # Auto-provisioned Prometheus datasource + dashboard
├── prometheus.yml          # Prometheus scrape config (scrapes /metrics/prometheus)
├── data/                   # FAISS index + SQLite DB (auto-created, gitignored)
├── SCALING.md              # Scaling guide: Pinecone, GPU, async, AWS architecture
├── .env.example
├── requirements.txt
├── Dockerfile
├── docker-compose.yml
└── pytest.ini
```

---

## How It Works

| Step | Component | What happens |
|------|-----------|--------------|
| 1 | `wikipedia_api.py` | Searches Wikipedia, fetches 1–5 articles, handles disambiguation |
| 2 | `text_cleaner.py` | Strips markup/citations, splits into overlapping sentence chunks (NLTK) |
| 3 | `embeddings.py` | Encodes passages with `all-MiniLM-L6-v2` → 384-dim L2-normalised vectors |
| 4 | `search.py` | FAISS `IndexFlatIP` (cosine) **or** Pinecone serverless query |
| 5 | `reranker.py` | Cross-encoder (`ms-marco-MiniLM-L-6-v2`) re-scores top passages |
| 6 | `answer_generator.py` | Chosen LLM synthesises answer; `stream_tokens()` yields word-by-word |
| 7 | `cache.py` | 1-hour TTL cache; FAISS index persisted to disk; Prometheus metrics |

---

## Quick Start (Local)

### Prerequisites

- Python 3.10 or 3.11
- Node.js 18+

### 1 — Install Python dependencies

```bash
pip install -r requirements.txt
```

### 2 — Start the FastAPI backend

```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 3 — Start the React frontend

```bash
cd frontend_react
npm install
npm run dev
# → http://localhost:3000
```

### 4 — API docs

FastAPI interactive docs at **http://localhost:8000/docs**

---

## Docker (Recommended)

```bash
# Start all services: backend + React + Prometheus + Grafana
docker compose up --build

# Backend     → http://localhost:8000
# React       → http://localhost:3000
# Prometheus  → http://localhost:9090
# Grafana     → http://localhost:3001  (admin / admin)
```

---

## Switching LLM Provider

```bash
# Default — flan-t5-small, CPU, no API key needed
LLM_PROVIDER=local

# OpenAI (gpt-4o-mini by default)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini      # optional override

# Anthropic (Claude Haiku by default)
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-haiku-4-5-20251001   # optional override
```

API providers fall back to flan-t5 extractive if the call fails.

---

## Switching Vector Store

```bash
# Default — FAISS (local, zero config)
VECTOR_STORE=faiss

# Pinecone serverless (create index in Pinecone console first)
VECTOR_STORE=pinecone
PINECONE_API_KEY=...
PINECONE_INDEX=wiki-qa
```

---

## Cloud Deployment on AWS EC2 Free Tier

Optimised for **t2.micro** (1 GB RAM). Build the image locally and push to Docker Hub — EC2 only pulls and runs.

### Step 1 — Launch EC2

- AMI: **Ubuntu 22.04 LTS** · Instance type: **t2.micro** · Storage: **16 GB** gp2
- Security Group inbound rules:

| Port | Source | Purpose |
|------|--------|---------|
| 22 | Your IP | SSH |
| 8000 | 0.0.0.0/0 | FastAPI backend |
| 3000 | 0.0.0.0/0 | React frontend |
| 9090 | Your IP | Prometheus (restrict to your IP) |
| 3001 | Your IP | Grafana (restrict to your IP) |

### Step 2 — Build & push from your local machine

```bash
chmod +x scripts/push_to_dockerhub.sh
./scripts/push_to_dockerhub.sh yourdockerhubname
```

### Step 3 — Deploy on EC2

```bash
ssh -i your-key.pem ubuntu@<EC2_PUBLIC_IP>
scp -i your-key.pem scripts/ec2_setup.sh docker-compose.yml prometheus.yml ubuntu@<EC2_PUBLIC_IP>:~/
chmod +x ec2_setup.sh
./ec2_setup.sh yourdockerhubname/wiki-qa:latest <EC2_PUBLIC_IP>
```

### Step 4 — Access

| Service | URL |
|---------|-----|
| React UI | `http://<EC2_PUBLIC_IP>:3000` |
| API docs | `http://<EC2_PUBLIC_IP>:8000/docs` |
| Prometheus | `http://<EC2_PUBLIC_IP>:9090` |
| Grafana | `http://<EC2_PUBLIC_IP>:3001` |

---

## API Reference

### `POST /ask` — Full JSON response

```json
// Request
{
  "query": "What is Quantum Computing?",
  "top_k": 5,
  "num_articles": 2,
  "rerank": true
}

// Response
{
  "query": "What is Quantum Computing?",
  "answer": "Quantum computing uses quantum mechanical phenomena...",
  "primary_title": "Quantum computing",
  "primary_url": "https://en.wikipedia.org/wiki/Quantum_computing",
  "passages": [
    {"passage": "...", "score": 0.8921, "source": {"title": "Quantum computing", "url": "..."}}
  ],
  "sources": [{"title": "Quantum computing", "url": "..."}],
  "related_topics": ["Qubit", "Superposition", "Quantum entanglement"],
  "cached": false,
  "latency_ms": 1240
}
```

### `POST /ask/stream` — Server-Sent Events

Emits a sequence of JSON events:

```
data: {"type": "status",  "content": "Searching Wikipedia…"}
data: {"type": "status",  "content": "Generating answer…"}
data: {"type": "token",   "content": "Quantum "}
data: {"type": "token",   "content": "computing "}
data: {"type": "done",    "answer": "...", "passages": [{"passage":"...","score":0.89,"source":{...}}], ...}
```

The React frontend uses this endpoint by default for a ChatGPT-like streaming UX.

### `POST /auth/register` · `POST /auth/login`

```json
{ "username": "alice", "password": "secret123" }
→ { "access_token": "<JWT>", "username": "alice" }
```

Pass `Authorization: Bearer <token>` on `/ask` or `/ask/stream` to save query history.

### `GET /auth/history`

Returns the authenticated user's last 20 queries.

### `GET /metrics`

Live server stats — request count, cache hit rate, uptime.

### `GET /metrics/prometheus`

Prometheus-format metrics (request counts, latency histograms, error rates).

### `GET /evaluate`

Built-in benchmark — Precision@k and MRR@k across 5 queries.

### `GET /health`

Returns `{"status": "ok", "version": "4.0.0"}`.

---

## Observability

Prometheus scrapes `/metrics/prometheus` every 15 seconds. Grafana auto-connects on startup.

**Key metrics exposed:**
- `http_requests_total` — request count by endpoint and status code
- `http_request_duration_seconds` — latency histogram (p50/p95/p99)
- `http_requests_in_progress` — in-flight request count

Access Grafana at `http://localhost:3001` (default: admin/admin) and import a dashboard using the auto-provisioned Prometheus datasource.

---

## Running the Evaluation Suite

```bash
python eval/evaluate.py --url http://localhost:8000
python eval/evaluate.py --url http://localhost:8000 --out results.json
```

Outputs Precision@k, MRR@k, and p50/p95/p99 latency across 8 benchmark queries.

---

## Running Tests

```bash
pytest
# 36 tests — unit + integration, all passing
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `local` | LLM backend: `local`, `openai`, `anthropic` |
| `OPENAI_API_KEY` | — | Required when `LLM_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model override |
| `ANTHROPIC_API_KEY` | — | Required when `LLM_PROVIDER=anthropic` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | Anthropic model override |
| `VECTOR_STORE` | `faiss` | Vector backend: `faiss` or `pinecone` |
| `PINECONE_API_KEY` | — | Required when `VECTOR_STORE=pinecone` |
| `PINECONE_INDEX` | `wiki-qa` | Pinecone index name |
| `API_KEY` | _(empty)_ | `X-API-Key` header — leave blank to disable |
| `JWT_SECRET` | `change-me-in-production` | JWT signing secret — **always set in production** |
| `ENABLE_RERANKER` | `true` | Set `false` to skip cross-encoder (saves ~150 MB RAM) |
| `ENABLE_GENERATOR` | `true` | Set `false` to skip local LLM (saves ~500 MB RAM) |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

---

## RAM Profiles (t2.micro — 1 GB RAM + 2 GB swap required)

| Mode | RAM usage | How to enable |
|------|-----------|---------------|
| Full (reranker + generator) | ~950 MB | Default |
| No generator | ~450 MB | `ENABLE_GENERATOR=false` |
| Bi-encoder only | ~300 MB | `ENABLE_RERANKER=false ENABLE_GENERATOR=false` |
| OpenAI / Anthropic API | ~300 MB | `LLM_PROVIDER=openai` + `ENABLE_GENERATOR=false` |

---

## Scaling

See [SCALING.md](SCALING.md) for a full guide covering:
- Pinecone / Weaviate / pgvector for managed vector search
- GPU inference on g4dn.xlarge (flan-t5-large, ~10× faster)
- Async FastAPI with `run_in_executor` and Celery task queues
- Multi-service AWS architecture with ECS, ALB, RDS, ElastiCache, and CloudFront
- Cost estimates from $0 (free tier) to $200/month (high availability)

---

## License

MIT — free to use, modify, and deploy.
