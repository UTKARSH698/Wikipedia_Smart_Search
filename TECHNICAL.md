# WikiQA RAG System — Technical Architecture

Deep engineering documentation for the WikiQA retrieval-augmented generation system. The README covers what the system does. This document covers why decisions were made, what tradeoffs were accepted, and what the known failure modes are.

---

## Retrieval System Design

### Why Two Retrieval Stages?

The bi-encoder (FAISS with `all-MiniLM-L6-v2`) encodes query and passage **independently** into 384-dimensional vectors and retrieves the top-20 candidates via cosine similarity. This is fast (~5–20ms) but imprecise — it cannot model interactions between query and passage tokens.

The cross-encoder (`ms-marco-MiniLM-L-6-v2`) takes a (query, passage) pair as a **single joint input** and scores them together. It catches semantic matches the bi-encoder misses (negation, paraphrase, implicit reference) at the cost of ~500ms. This is not a rewrite — it's a re-ranking of the 20 candidates already retrieved.

The tradeoff: running the cross-encoder on all Wikipedia passages directly would take minutes. Running it on 20 candidates takes ~500ms. The bi-encoder is the fast filter; the cross-encoder is the precise scorer.

**Control:** `ENABLE_RERANKER=false` skips the cross-encoder, reducing pipeline latency to ~300ms and RAM usage from ~350MB to ~200MB. Appropriate for t2.micro RAM-constrained or latency-sensitive deployments.

### Source Diversity Enforcement

When fetching 2–5 Wikipedia articles, the cross-encoder can legitimately assign all 5 top-k slots to a single article (the most relevant one). This maximises per-slot score but destroys breadth — the LLM receives only one perspective for multi-topic queries.

The `enforce_source_diversity()` function (in `reranker.py`) performs a post-processing pass:
1. Sort all passages by cross-encoder score
2. Reserve one slot per unique source article (O(n) pass)
3. Fill remaining slots by score

Cost: zero latency impact (pure Python list iteration). Benefit: measurably better answer quality on multi-topic queries. This pattern is standard in production search systems but absent from most RAG tutorials.

### Sentence-Boundary Chunking

NLTK `sent_tokenize` is used instead of fixed-character windows. Passages start and end at sentence boundaries, with 1-sentence overlap between adjacent passages. This matters because:

- Fixed-character chunking cuts mid-sentence, losing the semantic unit that makes a passage coherent
- 1-sentence overlap ensures context at chunk edges is not lost when the relevant content straddles two chunks

**Known limitation:** NLTK's `sent_tokenize` assumes natural-language prose. It breaks on Wikipedia sections containing code snippets, mathematical notation, LaTeX, and HTML tables. A structure-aware splitter (detecting code fences, table markup) would be required for full coverage.

### Content-Hash FAISS Persistence

The FAISS index is serialised to disk at `data/faiss.index` and keyed by an MD5 hash of the concatenated passage content. On startup:
1. Compute MD5 of all passages
2. If the stored hash matches, load from disk (skips re-encoding, saves ~300ms)
3. If not, re-encode all passages and save

This is a simple cache invalidation strategy: any change to the passage set forces re-encoding. In production with a large corpus, a proper vector database (Pinecone, Weaviate, pgvector) would handle this transparently.

---

## Faithfulness Evaluation Methodology

### The Gap Between Retrieval Quality and Generation Quality

Precision@k and MRR measure whether the right passages were **retrieved**. They say nothing about whether the LLM stayed **faithful** to them. A model can retrieve perfect passages and still:
- Generate plausible-sounding facts not present in the retrieved text
- Blend retrieved information with pre-training knowledge
- Overstate confidence on underspecified queries

### LLM-as-Judge Pattern

After generation, the same LLM is prompted:

> "Given only these passages: [retrieved_passages]. Is this answer supported by the passages? Answer YES or NO and explain."

This is the same pattern used by Cohere's RAG evaluator and the Ragas framework. It is not ground-truth evaluation (it doesn't know the "right" answer), but it catches the most common failure mode: claims the LLM introduced that aren't in the retrieved text.

**Limitation:** The judge and the generator are the same model. If the model has a systematic blind spot, the judge will share it. A more robust setup would use a different (stronger) model as judge.

### Benchmark Metrics

Evaluated on 8 manually constructed queries with known correct passages:

| Metric | With Reranker | Without Reranker |
|--------|--------------|-----------------|
| Precision@5 | ~0.80 | ~0.60 |
| MRR@5 | ~0.85 | ~0.68 |
| Faithfulness | ~0.75 | ~0.70 |

Faithfulness is relatively stable because it depends on generation quality, not retrieval quality. The retrieval improvement from reranking (P@5 +0.20) does not proportionally improve faithfulness because the LLM's generation behaviour is the limiting factor.

---

## Vector Store Tradeoffs

### FAISS vs Pinecone

| Dimension | FAISS | Pinecone |
|-----------|-------|---------|
| Setup | Zero config, in-process | Requires account + index creation |
| Retrieval latency | ~5–20ms | ~50–100ms (network roundtrip) |
| Scale | Single node, RAM-limited | Serverless, horizontally unlimited |
| Multi-tenancy | Manual (one index per user) | Native (namespaces) |
| Persistence | File on disk | Managed cloud index |
| Cost | Free | Free tier, then $0.096/GB/month |

**When to use FAISS:** Single-node deployments, development, t2.micro, offline usage.

**When to use Pinecone:** Multi-user production, large corpora (>1M passages), need for real-time index updates, geographic distribution.

The `VECTOR_STORE` flag makes this a drop-in swap — the retrieval interface (`search.py`) abstracts both.

### FAISS vs pgvector

pgvector is the right choice when you need SQL joins (e.g., filter passages by user, metadata, recency) or when you already have a PostgreSQL deployment and want to avoid a separate vector service. pgvector's IVFFlat approximate search matches FAISS performance at moderate scale. At large scale, FAISS's exact HNSW search provides better recall.

---

## Scaling Architecture

### From Single-Node to Production AWS

The current EC2 deployment (t2.micro, 1GB RAM + 2GB swap) handles ~10 concurrent users before swapping kills latency. A production upgrade path:

```
                    ┌─── ALB ───┐
                    │           │
              FastAPI (ECS)  FastAPI (ECS)
                    │           │
              Pinecone (serverless vector DB)
              ElastiCache (Redis TTL cache)
              RDS PostgreSQL (Multi-AZ)
              S3 (FAISS index snapshots for ECS tasks)
```

**Key changes:**
- Replace in-process FAISS with Pinecone (ECS tasks are stateless; FAISS index can't live in memory across instances)
- Replace TTL in-memory cache with ElastiCache (shared across ECS tasks)
- GPU instance for cross-encoder (g4dn.xlarge, ~10× faster re-ranking, ~$0.50/hr)
- CloudFront for React frontend CDN

### Async FastAPI

The current synchronous `run_in_executor` pattern for CPU-bound embedding/re-ranking is correct for a single-server deployment. In a multi-worker Gunicorn setup, `run_in_executor` with a `ProcessPoolExecutor` is needed to avoid the GIL bottleneck on multi-core machines.

---

## Known Failure Modes

### Multi-Hop Queries

Query: "Who is the president of the country that invented the internet?"

This requires two retrieval steps: first retrieve "internet → United States", then retrieve "United States president". Single-pass retrieval retrieves passages about the internet that mention US-origin but not the current president. The answer quality depends on whether the LLM can chain the inference from retrieved context.

**Mitigation:** Query decomposition — a pre-retrieval step that splits the query into sub-queries, retrieves for each, then merges before generation. Not implemented.

### Disambiguation

Query: "What is Mercury?"

Wikipedia has separate articles for Mercury (planet), Mercury (element), and Mercury (Roman god). The current code resolves disambiguation pages to the "first" option. For ambiguous queries, all three articles may be partially relevant, and the `enforce_source_diversity` step will include passages from each — but the LLM may still produce a confused answer blending all three.

**Mitigation:** Detect when multiple semantically distant articles are fetched (cosine distance between article embeddings) and surface a clarifying question before retrieval.

### Cache Staleness

The TTL cache (1 hour) means Wikipedia edits within the cache window are invisible. For most queries this is acceptable. For queries about recent events, breaking news, or rapidly-updated topics, cached responses may be incorrect.

---

## CAP Theorem Analysis

WikiQA is a read-only system with a single origin (Wikipedia API). The CAP considerations are:

**FAISS index consistency:** The index is built at startup from the fetched Wikipedia articles. There is no mechanism for incremental updates — a new Wikipedia edit is not reflected until the server restarts or the cache expires. This is **eventual consistency** with a long convergence window.

**TTL cache consistency:** Cached responses are consistent within the TTL window. After TTL expiry, the next request re-fetches from Wikipedia and re-computes. The tradeoff is response latency vs freshness.

**FAISS index availability:** The FAISS index is in-process memory. If the process crashes, the index is rebuilt on next startup (~1–2 minutes for a 5-article corpus, longer for larger corpora). Production deployments should persist the index to S3 and load at startup.

---

## Security Analysis

**JWT Authentication:** Tokens are signed with `JWT_SECRET` (HS256). Tokens expire after 24 hours. The secret must be rotated periodically; long-lived secrets with no rotation create a replay window.

**SQLite Query History:** User query history is stored in SQLite with user_id foreign keys. There is no row-level encryption. If the SQLite file is exfiltrated, query history is readable. For production, PostgreSQL with column-level encryption for sensitive fields is appropriate.

**API Key Authentication:** The `API_KEY` header provides optional key-based auth. When empty, the endpoint is open. The current implementation is appropriate for demo deployments; production deployments should require API key or OAuth.

**Rate Limiting:** Not implemented at the application layer. Rate limiting should be applied at the ALB or API Gateway layer in production.

---

*For questions about architecture decisions, see the README Engineering Highlights section. For setup, see the README Quick Start.*
