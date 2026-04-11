"""
Offline evaluation script for the Wikipedia Smart QA system.

Metrics computed
────────────────
  Precision@k     — fraction of top-k passages whose text overlaps with
                    the expected answer keywords (keyword recall proxy)
  MRR@k           — Mean Reciprocal Rank of first relevant passage
  Avg latency     — mean wall-clock time per query (ms)
  p50 / p95 / p99 — latency percentiles
  Cache hit rate  — fraction of queries served from cache

Usage
─────
  # Run against a live backend
  python eval/evaluate.py --url http://localhost:8000

  # Run with custom benchmark file
  python eval/evaluate.py --url http://localhost:8000 --bench eval/bench.json

  # Save results to JSON
  python eval/evaluate.py --url http://localhost:8000 --out eval/results.json
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Dict, List

import requests

# ---------------------------------------------------------------------------
# Default benchmark queries (query → expected keywords in a good answer)
# ---------------------------------------------------------------------------

DEFAULT_BENCH: List[Dict] = [
    {
        "query": "What is Artificial Intelligence?",
        "keywords": ["intelligence", "machine", "learning", "computer"],
    },
    {
        "query": "Explain Quantum Computing",
        "keywords": ["qubit", "quantum", "superposition", "computing"],
    },
    {
        "query": "What is Machine Learning?",
        "keywords": ["data", "algorithm", "model", "training"],
    },
    {
        "query": "History of the Internet",
        "keywords": ["ARPANET", "network", "protocol", "web"],
    },
    {
        "query": "How does CRISPR gene editing work?",
        "keywords": ["DNA", "gene", "protein", "genome"],
    },
    {
        "query": "Explain the Theory of Relativity",
        "keywords": ["Einstein", "space", "time", "energy"],
    },
    {
        "query": "Who was Nikola Tesla?",
        "keywords": ["electricity", "inventor", "current", "coil"],
    },
    {
        "query": "What causes climate change?",
        "keywords": ["greenhouse", "carbon", "temperature", "emissions"],
    },
]


# ---------------------------------------------------------------------------
# Metric helpers
# ---------------------------------------------------------------------------

def precision_at_k(passages: List[str], keywords: List[str], k: int) -> float:
    """
    Fraction of top-k passages that contain at least one expected keyword.
    This is a keyword-recall proxy — not ground-truth precision.
    """
    top = passages[:k]
    if not top:
        return 0.0
    hits = sum(
        1 for p in top
        if any(kw.lower() in p.lower() for kw in keywords)
    )
    return hits / len(top)


def mrr_at_k(passages: List[str], keywords: List[str], k: int) -> float:
    """Mean Reciprocal Rank — 1/rank of the first relevant passage."""
    for rank, passage in enumerate(passages[:k], start=1):
        if any(kw.lower() in passage.lower() for kw in keywords):
            return 1.0 / rank
    return 0.0


def percentile(values: List[float], p: int) -> float:
    if not values:
        return 0.0
    sorted_vals = sorted(values)
    idx = int(len(sorted_vals) * p / 100)
    return sorted_vals[min(idx, len(sorted_vals) - 1)]


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

def run_evaluation(
    base_url: str,
    bench: List[Dict],
    top_k: int = 5,
    api_key: str = "",
) -> Dict:
    headers = {"X-API-Key": api_key} if api_key else {}
    latencies: List[float] = []
    p_at_k_scores: List[float] = []
    mrr_scores: List[float] = []
    cache_hits = 0
    errors = 0
    per_query = []

    print(f"\nRunning {len(bench)} benchmark queries against {base_url}\n")
    print(f"{'Query':<45} {'P@k':>6} {'MRR':>6} {'Latency':>10} {'Cached':>7}")
    print("-" * 80)

    for item in bench:
        query = item["query"]
        keywords = item["keywords"]

        t0 = time.time()
        try:
            resp = requests.post(
                f"{base_url}/ask",
                json={"query": query, "top_k": top_k},
                headers=headers,
                timeout=120,
            )
            elapsed_ms = (time.time() - t0) * 1000

            if resp.status_code != 200:
                errors += 1
                print(f"  ERROR {resp.status_code}: {query[:40]}")
                continue

            data = resp.json()
            passages = data.get("passages", [])
            cached = data.get("cached", False)

            pk  = precision_at_k(passages, keywords, top_k)
            mrr = mrr_at_k(passages, keywords, top_k)

            latencies.append(elapsed_ms)
            p_at_k_scores.append(pk)
            mrr_scores.append(mrr)
            if cached:
                cache_hits += 1

            per_query.append({
                "query": query,
                "precision_at_k": round(pk, 3),
                "mrr": round(mrr, 3),
                "latency_ms": round(elapsed_ms, 1),
                "cached": cached,
            })

            cached_str = "yes" if cached else "no"
            print(
                f"  {query[:43]:<45} {pk:>6.3f} {mrr:>6.3f} {elapsed_ms:>8.0f}ms {cached_str:>7}"
            )

        except requests.exceptions.Timeout:
            errors += 1
            print(f"  TIMEOUT: {query[:40]}")
        except Exception as exc:
            errors += 1
            print(f"  ERROR: {query[:40]} — {exc}")

    # Aggregate
    n = len(latencies)
    results = {
        "summary": {
            "queries_run": len(bench),
            "successful": n,
            "errors": errors,
            "mean_precision_at_k": round(sum(p_at_k_scores) / n, 3) if n else 0,
            "mean_mrr": round(sum(mrr_scores) / n, 3) if n else 0,
            "latency_mean_ms": round(sum(latencies) / n, 1) if n else 0,
            "latency_p50_ms": round(percentile(latencies, 50), 1),
            "latency_p95_ms": round(percentile(latencies, 95), 1),
            "latency_p99_ms": round(percentile(latencies, 99), 1),
            "cache_hit_rate": round(cache_hits / n, 3) if n else 0,
        },
        "per_query": per_query,
    }

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    for k, v in results["summary"].items():
        print(f"  {k:<30} {v}")

    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Evaluate Wikipedia Smart QA")
    parser.add_argument("--url",   default="http://localhost:8000", help="Backend base URL")
    parser.add_argument("--bench", default=None, help="Path to custom benchmark JSON")
    parser.add_argument("--out",   default=None, help="Save results to this JSON file")
    parser.add_argument("--k",     default=5, type=int, help="Top-k passages")
    parser.add_argument("--api-key", default="", help="API key if auth is enabled")
    args = parser.parse_args()

    bench = DEFAULT_BENCH
    if args.bench:
        with open(args.bench) as f:
            bench = json.load(f)

    results = run_evaluation(args.url, bench, top_k=args.k, api_key=args.api_key)

    if args.out:
        out_path = Path(args.out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(results, f, indent=2)
        print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
