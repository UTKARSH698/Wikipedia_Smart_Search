"""
Cross-encoder re-ranking for improved retrieval precision.

Why two stages?
───────────────
Stage 1 (FAISS bi-encoder): fast approximate retrieval — scores passages
independently of each other using pre-computed embeddings.

Stage 2 (cross-encoder): slow but accurate — encodes (query, passage) pairs
jointly, capturing deeper query-passage interaction. Applied only to the small
FAISS candidate set (top-k), so speed is acceptable.

Model: cross-encoder/ms-marco-MiniLM-L-6-v2 (~86 MB, CPU-friendly)
"""

from __future__ import annotations

import os
from typing import List

from utils.logger import get_logger
from backend.search import SearchResult

logger = get_logger(__name__)

CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
ENABLE_RERANKER = os.getenv("ENABLE_RERANKER", "true").lower() == "true"


class Reranker:
    """Singleton cross-encoder re-ranker."""

    _instance: Reranker | None = None

    def __new__(cls) -> Reranker:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._model = None
        return cls._instance

    def _load(self) -> None:
        if self._model is not None:
            return
        if not ENABLE_RERANKER:
            logger.info("Reranker disabled via ENABLE_RERANKER env var")
            return
        try:
            from sentence_transformers import CrossEncoder
            logger.info("Loading cross-encoder '%s'…", CROSS_ENCODER_MODEL)
            self._model = CrossEncoder(CROSS_ENCODER_MODEL, max_length=512)
            logger.info("Cross-encoder loaded")
        except Exception as exc:
            logger.warning("Could not load cross-encoder (will skip re-ranking): %s", exc)
            self._model = None

    def rerank(self, query: str, results: List[SearchResult]) -> List[SearchResult]:
        """
        Re-score *results* using the cross-encoder and return them sorted
        by cross-encoder score (descending). Falls back gracefully if the
        model is unavailable.
        """
        self._load()

        if self._model is None or not results:
            return results

        pairs = [(query, r.passage) for r in results]
        try:
            scores = self._model.predict(pairs, show_progress_bar=False)
        except Exception as exc:
            logger.warning("Cross-encoder inference failed: %s — returning original order", exc)
            return results

        reranked = sorted(
            zip(results, scores),
            key=lambda x: x[1],
            reverse=True,
        )

        final: List[SearchResult] = []
        for new_rank, (result, score) in enumerate(reranked, start=1):
            final.append(SearchResult(
                passage=result.passage,
                score=float(score),
                rank=new_rank,
                source=result.source,
            ))

        logger.debug("Re-ranked %d results with cross-encoder", len(final))
        return final
