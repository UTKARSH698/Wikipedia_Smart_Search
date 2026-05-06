<div align="center">

# WikiQA RAG System

### Production Retrieval-Augmented Generation over Wikipedia

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white)](https://docker.com)
[![Prometheus](https://img.shields.io/badge/Prometheus-Grafana-E6522C?style=flat-square&logo=prometheus&logoColor=white)](https://prometheus.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

</div>

---

## What This Project Demonstrates

- **Two-stage retrieval architecture** — bi-encoder (FAISS, ~5–20ms) for candidate retrieval, cross-encoder re-ranking for precision. P@5 improves from ~0.60 to ~0.80 at +500ms cost. Each stage has a measurable cost/benefit tradeoff.
- - **Source diversity enforcement** — a custom O(n) post-ranking step guaranteeing ≥1 passage per fetched Wikipedia article in the final top-k. Without it, the cross-encoder fills all slots from the single highest-scoring article, silently dropping context from other sources. Not in any RAG tutorial.
  - - **Faithfulness scoring (LLM-as-judge)** — after generation, the same LLM is asked: "Given only these passages, is this answer supported?" Detects hallucination before it reaches the user.
    - - **SSE token streaming** — `/ask/stream` endpoint emits status events then word-by-word tokens, identical pattern to production LLM APIs.
      - - **Full observability stack** — Prometheus `/metrics` endpoint + auto-provisioned Grafana dashboard (docker-compose). Tracks latency histograms, request counts, in-flight requests.
        - - **Multi-LLM, multi-vector-store** — Groq/OpenAI/Anthropic/local behind a `LLM_PROVIDER` flag; FAISS/Pinecone behind `VECTOR_STORE`. Both are drop-in swaps, not rewrites.
         
          - ---

          ## Architecture

          ```
          ┌─────────────────────────────┐    SSE stream    ┌──────────────────────────────────────────────┐
          │ React 18 Frontend           │ ──────────────► │ FastAPI Backend                              │
          │ Vite · Tailwind · :3000     │                  │ 1. Fetch 1–5 Wikipedia articles              │
          │ Streaming chat UI           │ ◄────────────── │ 2. Sentence-boundary chunking (NLTK)         │
          │ History · Benchmark · Auth  │   token / done   │ 3. Bi-encoder → FAISS IndexFlatIP            │
          └─────────────────────────────┘                  │ 4. Cross-encoder re-ranking                  │
                                                            │ 5. Source-diversity enforcement              │
                                                            │ 6. LLM generation (streaming)               │
                                                            │ 7. TTL cache · Prometheus metrics            │
                                                            └──────────────────────────────────────────────┘

          Observability: Prometheus scrapes /metrics/prometheus every 15s → Grafana auto-dashboard
          ```

          ---

          ## Key Features

          | Category | What's Included |
          |----------|----------------|
          | **RAG Pipeline** | Bi-encoder → cross-encoder re-ranking → source diversity → LLM generation |
          | **Multi-LLM** | Groq (llama-3.3-70b, free) · OpenAI · Anthropic · local (flan-t5, no key) |
          | **Vector Store** | FAISS (local, ~5ms) or Pinecone (serverless) — swap with `VECTOR_STORE` flag |
          | **Token Streaming** | SSE endpoint — status events + word-by-word tokens (ChatGPT pattern) |
          | **Faithfulness** | LLM-as-judge hallucination detection after every generation |
          | **Observability** | Prometheus metrics + Grafana dashboard (auto-provisioned via docker-compose) |
          | **Evaluation** | In-app Precision@k, MRR, faithfulness, latency across benchmark queries |
          | **Auth** | JWT register/login, per-user query history in SQLite |
          | **Deployment** | Docker Compose, GitHub Actions CI/CD, EC2 free-tier optimised |

          ---

          ## Tech Stack

          `Python 3.11` `FastAPI` `FAISS` `sentence-transformers` `React 18` `Vite` `Tailwind CSS`
          `Prometheus` `Grafana` `Docker` `Groq` `OpenAI` `Anthropic` `Pinecone` `SQLite` `GitHub Actions`

          ---

          ## Engineering Highlights

          **Why two retrieval stages?** The bi-encoder is fast (sub-20ms) but scores query and passage independently. The cross-encoder scores them jointly, catching semantic matches the bi-encoder misses. The +500ms cost is worth it for accuracy-critical queries; for latency-sensitive workloads, `ENABLE_RERANKER=false` drops it instantly.

          **Source diversity is non-obvious.** When you fetch 3 Wikipedia articles, the cross-encoder can legitimately rank all 5 top-k slots from one article. That maximises per-slot relevance but destroys breadth. The `enforce_source_diversity()` post-processing step reserves one slot per unique source before filling remaining slots by score — O(n), zero latency impact.

          **Faithfulness != retrieval quality.** Precision@k measures whether the right passages were retrieved. It says nothing about whether the LLM stayed faithful to them. The LLM-as-judge step closes this gap, using the same model to verify its own output against the retrieved passages.

          **Content-hash FAISS persistence** — the FAISS index is keyed by MD5 of passage content. Re-running the same query skips re-encoding (saves ~300ms) and re-fetching (saves Wikipedia API roundtrip).

          ---

          ## Performance

          | Metric | Value |
          |--------|-------|
          | FAISS retrieval (top-20) | ~5–20ms |
          | Cross-encoder re-ranking | +~500ms |
          | Full pipeline (Groq) | ~800ms–1.2s |
          | Precision@5 (with reranker) | ~0.80 |
          | Precision@5 (without reranker) | ~0.60 |
          | MRR (with reranker) | ~0.85 |

          ---

          ## Quick Start

          ```bash
          # Clone and configure
          git clone https://github.com/UTKARSH698/wikiqa-rag-system
          cd wikiqa-rag-system
          cp .env.example .env
          # Set GROQ_API_KEY=gsk_... (free at console.groq.com)

          # Docker (recommended) — starts backend + React + Prometheus + Grafana
          docker compose up --build
          # Backend → http://localhost:8000
          # React UI → http://localhost:3000
          # Grafana → http://localhost:3001 (admin/admin)

          # Or run manually
          pip install -r requirements.txt
          uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
          cd frontend_react && npm install && npm run dev

          # Run tests
          pytest tests/ -v
          ```

          ---

          ## Known Limitations

          - Multi-hop questions require chained retrieval (not implemented — would need query decomposition before the first FAISS call)
          - - Post-2024 knowledge gaps: Wikipedia coverage is finite; recent events return stale or empty results
            - - NLTK sentence chunking breaks on code snippets, tables, and mathematical notation
              - - No per-user retrieval personalisation — all users get identical results for identical queries (shared cache)
               
                - ---

                ## Deep Technical Documentation

                → **[TECHNICAL.md](TECHNICAL.md)** — retrieval system design decisions, reranker tradeoffs, faithfulness evaluation methodology, vector store comparison, scaling architecture (Pinecone/GPU/ECS), and known failure modes.

                ---

                *MIT License · Utkarsh Batham*
