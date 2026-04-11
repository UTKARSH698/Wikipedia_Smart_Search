"""
FastAPI backend — Wikipedia Smart Search & QA System v3.

Endpoints
─────────
GET  /health              liveness probe
GET  /metrics             live server stats
POST /auth/register       create account -> JWT
POST /auth/login          verify credentials -> JWT
GET  /auth/history        user query history (JWT required)
POST /ask                 main QA endpoint (API key OR JWT)
GET  /evaluate            run built-in benchmark, return Precision@k + latency
GET  /cache/clear         flush response cache (auth required)
"""

import json
import os
import re
import sys
import time
import unicodedata
from typing import AsyncGenerator

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, HTTPException, Request, Security, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.answer_generator import AnswerGenerator
from backend.auth import create_token, decode_token, hash_password, verify_password
from backend.cache import TTLCache
from backend.database import get_history, get_user_by_id, get_user_by_username, init_db, save_history, create_user
from backend.reranker import Reranker
from backend.search import SemanticSearchEngine
from backend.wikipedia_api import WikipediaFetcher
from utils.logger import get_logger

logger = get_logger(__name__)

# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

API_KEY         = os.getenv("API_KEY", "")
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
_oauth2_scheme  = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def _current_user_optional(
    token: str = Depends(_oauth2_scheme),
) -> dict | None:
    """Return the user dict if a valid Bearer token is present, else None."""
    if not token:
        return None
    payload = decode_token(token)
    if not payload:
        return None
    return get_user_by_id(int(payload["sub"]))


def _require_user(user: dict | None = Depends(_current_user_optional)) -> dict:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user


def verify_api_key(key: str = Security(_api_key_header)) -> None:
    if API_KEY and key != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or missing API key.")


# ---------------------------------------------------------------------------
# Rate limiter + App
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=["10/minute"])

app = FastAPI(
    title="Wikipedia Smart QA API",
    description="RAG QA over Wikipedia — FAISS · cross-encoder · flan-t5 · JWT auth · streaming",
    version="4.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Prometheus metrics — exposes /metrics/prometheus
try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=True,
        should_ignore_untemplated=True,
    ).instrument(app).expose(app, endpoint="/metrics/prometheus", include_in_schema=True, tags=["System"])
    logger.info("Prometheus instrumentator enabled")
except ImportError:
    logger.info("prometheus_fastapi_instrumentator not installed — /metrics/prometheus unavailable")

# Initialise SQLite tables on startup
init_db()

# ---------------------------------------------------------------------------
# Singletons
# ---------------------------------------------------------------------------

fetcher   = WikipediaFetcher()
reranker  = Reranker()
generator = AnswerGenerator()
cache     = TTLCache(ttl=3600)

# Pick vector store based on env var
from backend.search import VECTOR_STORE, PineconeSearchEngine
if VECTOR_STORE == "pinecone":
    engine = PineconeSearchEngine()
    logger.info("Vector store: Pinecone")
else:
    engine = SemanticSearchEngine(cache_size=20)
    logger.info("Vector store: FAISS")

_start_time      = time.time()
_request_count   = 0
_cache_hit_count = 0

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=40)
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class AskRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=300)
    top_k: int = Field(default=5, ge=1, le=10)
    num_articles: int = Field(default=2, ge=1, le=3)
    rerank: bool = Field(default=True)

    @field_validator("query")
    @classmethod
    def sanitize(cls, v: str) -> str:
        return _sanitize_query(v)


class SourceInfo(BaseModel):
    title: str
    url: str


class AskResponse(BaseModel):
    query: str
    answer: str
    primary_title: str
    primary_url: str
    passages: list[str]
    scores: list[float]
    sources: list[SourceInfo]
    related_topics: list[str]
    cached: bool = False


# ---------------------------------------------------------------------------
# Input sanitization
# ---------------------------------------------------------------------------

def _sanitize_query(query: str) -> str:
    query = unicodedata.normalize("NFKC", query)
    query = re.sub(r"<[^>]{0,100}>", "", query)
    query = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", query)
    return re.sub(r"\s+", " ", query).strip()


# ---------------------------------------------------------------------------
# Evaluation helpers (inline — no external deps)
# ---------------------------------------------------------------------------

_BENCH = [
    {"query": "What is Artificial Intelligence?",   "keywords": ["intelligence", "machine", "learning"]},
    {"query": "Explain Quantum Computing",           "keywords": ["qubit", "quantum", "superposition"]},
    {"query": "What is Machine Learning?",           "keywords": ["data", "algorithm", "model"]},
    {"query": "History of the Internet",             "keywords": ["ARPANET", "network", "protocol"]},
    {"query": "Explain the Theory of Relativity",   "keywords": ["Einstein", "space", "time"]},
]


def _precision_at_k(passages: list, keywords: list, k: int) -> float:
    top = passages[:k]
    if not top:
        return 0.0
    return sum(1 for p in top if any(kw.lower() in p.lower() for kw in keywords)) / len(top)


def _mrr_at_k(passages: list, keywords: list, k: int) -> float:
    for rank, p in enumerate(passages[:k], 1):
        if any(kw.lower() in p.lower() for kw in keywords):
            return 1.0 / rank
    return 0.0


# ---------------------------------------------------------------------------
# Endpoints — System
# ---------------------------------------------------------------------------

@app.get("/health", tags=["System"])
def health():
    return {"status": "ok", "version": app.version}


@app.get("/metrics", tags=["System"])
def metrics():
    uptime_s = int(time.time() - _start_time)
    hit_rate = round(_cache_hit_count / _request_count * 100, 1) if _request_count else 0.0
    return {
        "uptime_seconds": uptime_s,
        "uptime_human": f"{uptime_s // 3600}h {(uptime_s % 3600) // 60}m {uptime_s % 60}s",
        "total_requests": _request_count,
        "cache_hits": _cache_hit_count,
        "cache_hit_rate_pct": hit_rate,
        "cache_entries": len(cache),
        "reranker_enabled": os.getenv("ENABLE_RERANKER", "true").lower() == "true",
        "generator_enabled": os.getenv("ENABLE_GENERATOR", "true").lower() == "true",
    }


@app.get("/evaluate", tags=["System"])
def evaluate(k: int = 5, _: None = Security(verify_api_key)):
    """
    Run the built-in benchmark (5 queries) and return Precision@k, MRR, latencies.
    Intended for CI / logbook reporting — not for high-frequency use.
    """
    results = []
    latencies = []

    for item in _BENCH:
        t0 = time.time()
        try:
            passages, sources, _, primary_title, primary_url = fetcher.fetch(
                item["query"], num_articles=1
            )
            idx = engine.index_article(passages, sources)
            hits = engine.search(item["query"], idx, top_k=k)
            hits = reranker.rerank(item["query"], hits)[:k]
            elapsed = (time.time() - t0) * 1000

            passage_texts = [h.passage for h in hits]
            results.append({
                "query":          item["query"],
                "precision_at_k": round(_precision_at_k(passage_texts, item["keywords"], k), 3),
                "mrr":            round(_mrr_at_k(passage_texts, item["keywords"], k), 3),
                "latency_ms":     round(elapsed, 1),
            })
            latencies.append(elapsed)
        except Exception as exc:
            results.append({"query": item["query"], "error": str(exc)})

    successful = [r for r in results if "error" not in r]
    n = len(successful)
    return {
        "k": k,
        "queries_run": len(_BENCH),
        "successful": n,
        "mean_precision_at_k": round(sum(r["precision_at_k"] for r in successful) / n, 3) if n else 0,
        "mean_mrr":            round(sum(r["mrr"]            for r in successful) / n, 3) if n else 0,
        "mean_latency_ms":     round(sum(latencies) / len(latencies), 1) if latencies else 0,
        "per_query": results,
    }


@app.get("/cache/clear", tags=["System"])
def clear_cache(_: None = Security(verify_api_key)):
    cache.clear()
    return {"message": "Cache cleared successfully"}


# ---------------------------------------------------------------------------
# Endpoints — Auth
# ---------------------------------------------------------------------------

@app.post("/auth/register", response_model=TokenResponse, tags=["Auth"])
def register(req: RegisterRequest):
    """Create a new user account and return a JWT."""
    user_id = create_user(req.username, hash_password(req.password))
    if user_id is None:
        raise HTTPException(status_code=409, detail="Username already taken.")
    token = create_token(user_id, req.username)
    return TokenResponse(access_token=token, username=req.username)


@app.post("/auth/login", response_model=TokenResponse, tags=["Auth"])
def login(req: LoginRequest):
    """Verify credentials and return a JWT."""
    user = get_user_by_username(req.username)
    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_token(user["id"], user["username"])
    return TokenResponse(access_token=token, username=user["username"])


@app.get("/auth/history", tags=["Auth"])
def history(user: dict = Depends(_require_user)):
    """Return the authenticated user's last 20 queries."""
    return {"username": user["username"], "history": get_history(user["id"])}


# ---------------------------------------------------------------------------
# Endpoints — QA
# ---------------------------------------------------------------------------

@app.post("/ask", response_model=AskResponse, tags=["QA"])
@limiter.limit("10/minute")
def ask(
    request: Request,
    req: AskRequest,
    _: None = Security(verify_api_key),
    user: dict | None = Depends(_current_user_optional),
):
    """
    Main QA endpoint. Accepts either X-API-Key header or Bearer JWT.
    Authenticated users get query history saved automatically.
    """
    global _request_count, _cache_hit_count
    _request_count += 1

    cache_key = f"{req.query.lower()}|{req.top_k}|{req.num_articles}"
    cached = cache.get(cache_key)
    if cached:
        _cache_hit_count += 1
        if user:
            save_history(
                user["id"], req.query, cached["answer"],
                cached["primary_title"], cached["primary_url"],
                latency_ms=0, cached=True,
            )
        cached["cached"] = True
        return AskResponse(**cached)

    t0 = time.time()

    try:
        passages, sources, related_topics, primary_title, primary_url = fetcher.fetch(
            req.query, num_articles=req.num_articles
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    article_index = engine.index_article(passages, sources)
    results = engine.search(req.query, article_index, top_k=min(req.top_k * 2, 20))

    if not results:
        raise HTTPException(status_code=500, detail="Semantic search returned no results.")

    if req.rerank:
        results = reranker.rerank(req.query, results)[: req.top_k]
    else:
        results = results[: req.top_k]
    answer  = generator.generate(req.query, results, primary_title)

    latency_ms = (time.time() - t0) * 1000

    response_data = {
        "query":         req.query,
        "answer":        answer,
        "primary_title": primary_title,
        "primary_url":   primary_url,
        "passages":      [r.passage for r in results],
        "scores":        [round(r.score, 4) for r in results],
        "sources":       [r.source for r in results],
        "related_topics": related_topics,
        "cached":        False,
    }

    cache.set(cache_key, response_data)

    if user:
        save_history(
            user["id"], req.query, answer,
            primary_title, primary_url,
            latency_ms=latency_ms, cached=False,
        )

    logger.info("Answered: '%s' -> '%s' (%.0fms)", req.query, primary_title, latency_ms)
    return AskResponse(**response_data)


@app.post("/ask/stream", tags=["QA"])
@limiter.limit("10/minute")
def ask_stream(
    request: Request,
    req: AskRequest,
    _: None = Security(verify_api_key),
    user: dict | None = Depends(_current_user_optional),
):
    """
    SSE streaming endpoint. Emits:
      {"type": "status",  "content": "..."}   — pipeline progress
      {"type": "token",   "content": "..."}   — answer token
      {"type": "done",    ...full response...} — final payload
      {"type": "error",   "content": "..."}   — on failure
    """
    global _request_count, _cache_hit_count
    _request_count += 1

    def _sse(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    def event_stream():
        cache_key = f"{req.query.lower()}|{req.top_k}|{req.num_articles}"
        cached = cache.get(cache_key)
        if cached:
            _cache_hit_count += 1
            payload = dict(cached)
            payload["cached"] = True
            # Stream cached answer token-by-token for consistent UX
            words = payload["answer"].split(" ")
            for i, word in enumerate(words):
                chunk = word if i == len(words) - 1 else word + " "
                yield _sse({"type": "token", "content": chunk})
            yield _sse({"type": "done", **payload})
            return

        t0 = time.time()

        try:
            yield _sse({"type": "status", "content": "Searching Wikipedia…"})
            passages, sources, related_topics, primary_title, primary_url = fetcher.fetch(
                req.query, num_articles=req.num_articles
            )
        except ValueError as exc:
            yield _sse({"type": "error", "content": str(exc)})
            return

        yield _sse({"type": "status", "content": "Building semantic index…"})
        article_index = engine.index_article(passages, sources)

        yield _sse({"type": "status", "content": "Finding relevant passages…"})
        results = engine.search(req.query, article_index, top_k=min(req.top_k * 2, 20))
        if not results:
            yield _sse({"type": "error", "content": "Semantic search returned no results."})
            return

        if req.rerank:
            results = reranker.rerank(req.query, results)[: req.top_k]
        else:
            results = results[: req.top_k]

        yield _sse({"type": "status", "content": "Generating answer…"})

        # Stream answer tokens
        full_answer = ""
        for token, is_done in generator.stream_tokens(req.query, results, primary_title):
            if not is_done:
                full_answer += token
                yield _sse({"type": "token", "content": token})

        latency_ms = (time.time() - t0) * 1000

        response_data = {
            "query":          req.query,
            "answer":         full_answer,
            "primary_title":  primary_title,
            "primary_url":    primary_url,
            "passages":       [r.passage for r in results],
            "scores":         [round(r.score, 4) for r in results],
            "sources":        [r.source for r in results],
            "related_topics": related_topics,
            "cached":         False,
            "latency_ms":     round(latency_ms),
        }
        cache.set(cache_key, response_data)

        if user:
            save_history(
                user["id"], req.query, full_answer,
                primary_title, primary_url,
                latency_ms=latency_ms, cached=False,
            )

        yield _sse({"type": "done", **response_data})
        logger.info("Stream answered: '%s' -> '%s' (%.0fms)", req.query, primary_title, latency_ms)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
