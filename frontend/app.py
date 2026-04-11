"""
Streamlit frontend — Wikipedia Smart Search & QA System v2.

New in v2:
  • Step-by-step progress indicator during query execution
  • Query history (session-based sidebar)
  • Keyword highlighting in retrieved passages
  • Related topics panel with clickable Wikipedia links
  • Per-passage source attribution (which article it came from)
  • Number of articles searched shown in result header
  • API key support (reads WIKI_API_KEY env var)
"""

import os
import re
import time

import requests
import streamlit as st

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BACKEND_URL      = os.getenv("BACKEND_URL", "http://localhost:8000")
ASK_ENDPOINT     = f"{BACKEND_URL}/ask"
HEALTH_ENDPOINT  = f"{BACKEND_URL}/health"
CLEAR_ENDPOINT   = f"{BACKEND_URL}/cache/clear"
API_KEY          = os.getenv("WIKI_API_KEY", "")
REQUEST_TIMEOUT  = 90

HEADERS = {"X-API-Key": API_KEY} if API_KEY else {}

SAMPLE_QUERIES = [
    "Explain Artificial Intelligence",
    "What is Quantum Computing?",
    "History of the Internet",
    "How does CRISPR gene editing work?",
    "Tell me about the Roman Empire",
    "What is Machine Learning?",
    "Explain the Theory of Relativity",
    "Who was Nikola Tesla?",
    "What causes climate change?",
    "How do black holes form?",
]

# ---------------------------------------------------------------------------
# Page config
# ---------------------------------------------------------------------------

st.set_page_config(
    page_title="Wikipedia Smart QA",
    page_icon="📖",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ---------------------------------------------------------------------------
# CSS
# ---------------------------------------------------------------------------

st.markdown("""
<style>
/* Header */
.main-header { font-size:2.2rem; font-weight:700; color:#1a1a2e; }
.sub-header  { font-size:.95rem; color:#666; margin-bottom:1.2rem; }

/* Answer box */
.answer-box {
    background:#f0f4ff;
    border-left:4px solid #4a6cf7;
    border-radius:6px;
    padding:1rem 1.2rem;
    margin-bottom:.8rem;
    line-height:1.7;
}

/* Passage card */
.passage-card {
    background:#fff;
    border:1px solid #e0e0e0;
    border-radius:6px;
    padding:.75rem 1rem;
    margin-bottom:.5rem;
    font-size:.88rem;
    color:#333;
    line-height:1.6;
}

/* Badges */
.badge-score  { background:#4a6cf7; color:#fff; border-radius:12px; padding:.1rem .5rem; font-size:.72rem; font-weight:600; }
.badge-cached { background:#28a745; color:#fff; border-radius:12px; padding:.15rem .6rem; font-size:.72rem; font-weight:600; }
.badge-source { background:#6c757d; color:#fff; border-radius:12px; padding:.1rem .5rem; font-size:.68rem; }

/* Keyword highlight */
mark { background:#fff176; border-radius:3px; padding:0 2px; }

/* History item */
.hist-item { font-size:.82rem; color:#555; cursor:pointer; padding:.2rem 0; }

/* Related topic chip */
.topic-chip {
    display:inline-block;
    background:#e8eaf6;
    color:#3949ab;
    border-radius:14px;
    padding:.25rem .75rem;
    margin:.2rem .2rem;
    font-size:.8rem;
    text-decoration:none;
}
.topic-chip:hover { background:#c5cae9; }
</style>
""", unsafe_allow_html=True)

# ---------------------------------------------------------------------------
# Session state initialisation
# ---------------------------------------------------------------------------

if "history" not in st.session_state:
    st.session_state.history = []   # List of dicts: {query, answer, title, url, ts}
if "prefill_query" not in st.session_state:
    st.session_state.prefill_query = ""

# ---------------------------------------------------------------------------
# Sidebar
# ---------------------------------------------------------------------------

with st.sidebar:
    st.markdown("## ⚙️ Settings")
    top_k        = st.slider("Passages to retrieve", 1, 10, 5)
    num_articles = st.slider("Wikipedia articles to search", 1, 3, 2)
    show_passages = st.checkbox("Show retrieved passages", value=True)
    show_scores   = st.checkbox("Show similarity scores", value=True)

    st.markdown("---")
    st.markdown("### 💡 Sample Queries")
    selected_sample = st.selectbox("Pick a sample", ["— choose one —"] + SAMPLE_QUERIES)
    if selected_sample != "— choose one —":
        st.session_state.prefill_query = selected_sample

    # ------------------------------------------------------------------
    # Query history
    # ------------------------------------------------------------------
    if st.session_state.history:
        st.markdown("---")
        st.markdown("### 🕘 Recent Searches")
        for i, item in enumerate(st.session_state.history[:8]):
            label = item["query"][:42] + ("…" if len(item["query"]) > 42 else "")
            if st.button(label, key=f"hist_{i}", use_container_width=True):
                st.session_state.prefill_query = item["query"]
                st.rerun()

    # ------------------------------------------------------------------
    # Admin
    # ------------------------------------------------------------------
    st.markdown("---")
    st.markdown("### 🔧 Admin")
    if st.button("Clear Server Cache", use_container_width=True):
        try:
            r = requests.get(CLEAR_ENDPOINT, headers=HEADERS, timeout=10)
            st.success(r.json().get("message", "Done"))
        except Exception as e:
            st.error(f"Could not reach backend: {e}")

    # Backend status
    st.markdown("---")
    st.markdown("### 🟢 Backend Status")
    try:
        ping = requests.get(HEALTH_ENDPOINT, timeout=5)
        if ping.status_code == 200:
            info = ping.json()
            st.success(f"Connected (v{info.get('version','?')})")
        else:
            st.warning("Unexpected response")
    except Exception:
        st.error("Offline — start FastAPI backend first")

# ---------------------------------------------------------------------------
# Main area
# ---------------------------------------------------------------------------

st.markdown('<div class="main-header">📖 Wikipedia Smart QA</div>', unsafe_allow_html=True)
st.markdown(
    '<div class="sub-header">Ask anything — powered by Wikipedia · FAISS · cross-encoder · flan-t5</div>',
    unsafe_allow_html=True,
)

query = st.text_input(
    "🔍 Enter your question",
    value=st.session_state.prefill_query,
    placeholder="e.g. What is Quantum Computing?",
    max_chars=300,
    key="query_input",
)

col_btn, col_spacer = st.columns([1, 7])
with col_btn:
    search_clicked = st.button("Search", type="primary", use_container_width=True)

# ---------------------------------------------------------------------------
# Query execution
# ---------------------------------------------------------------------------

def highlight(text: str, query: str) -> str:
    """Wrap query keywords (≥4 chars) in <mark> tags for visual highlighting."""
    keywords = [re.escape(w) for w in query.split() if len(w) >= 4]
    if not keywords:
        return text
    pattern = "(" + "|".join(keywords) + ")"
    return re.sub(pattern, r"<mark>\1</mark>", text, flags=re.IGNORECASE)


if search_clicked and query.strip():
    with st.status("Processing your query…", expanded=True) as status:
        status.update(label="🌐 Fetching Wikipedia articles…")
        start = time.time()

        try:
            status.update(label="🔍 Running semantic search + re-ranking…")
            response = requests.post(
                ASK_ENDPOINT,
                json={"query": query.strip(), "top_k": top_k, "num_articles": num_articles},
                headers=HEADERS,
                timeout=REQUEST_TIMEOUT,
            )
            elapsed = time.time() - start
            status.update(label="✍️ Generating answer…")
            time.sleep(0.3)   # Let the label render before results appear

            if response.status_code == 200:
                data = response.json()
                status.update(label=f"✅ Done in {elapsed:.1f}s", state="complete", expanded=False)

                # Save to history
                st.session_state.history.insert(0, {
                    "query": data["query"],
                    "answer": data["answer"],
                    "title": data["primary_title"],
                    "url": data["primary_url"],
                    "ts": time.strftime("%H:%M"),
                })
                st.session_state.history = st.session_state.history[:20]

            elif response.status_code == 429:
                status.update(label="Rate limit hit", state="error", expanded=False)
                st.warning("⏳ Rate limit reached (10 requests/minute). Please wait a moment.")
                st.stop()
            elif response.status_code == 404:
                status.update(label="Not found", state="error", expanded=False)
                st.warning(f"⚠️ {response.json().get('detail', 'Article not found.')}")
                st.stop()
            elif response.status_code == 403:
                status.update(label="Unauthorized", state="error", expanded=False)
                st.error("🔒 Invalid API key. Set WIKI_API_KEY in your environment.")
                st.stop()
            else:
                status.update(label="Error", state="error", expanded=False)
                st.error(f"Backend error {response.status_code}: {response.text}")
                st.stop()

        except requests.exceptions.ConnectionError:
            status.update(label="Connection failed", state="error", expanded=False)
            st.error(
                "Cannot connect to the FastAPI backend.\n\n"
                "Start it with:\n```\nuvicorn backend.main:app --reload\n```"
            )
            st.stop()
        except requests.exceptions.Timeout:
            status.update(label="Timed out", state="error", expanded=False)
            st.error(
                "Request timed out. The model may be loading for the first time — please try again in ~30 seconds."
            )
            st.stop()
        except Exception as exc:
            status.update(label="Unexpected error", state="error", expanded=False)
            st.error(f"Unexpected error: {exc}")
            st.stop()

    # ── Answer ──────────────────────────────────────────────────────────────
    st.markdown("---")
    h1, h2, h3 = st.columns([7, 1.5, 1.5])
    with h1:
        st.markdown("### 💬 Answer")
    with h2:
        if data.get("cached"):
            st.markdown('<span class="badge-cached">⚡ Cached</span>', unsafe_allow_html=True)
    with h3:
        st.caption(f"⏱ {elapsed:.1f}s")

    st.markdown(
        f'<div class="answer-box">{data["answer"]}</div>',
        unsafe_allow_html=True,
    )

    # ── Source ───────────────────────────────────────────────────────────────
    st.markdown(
        f"📰 **Primary source:** [{data['primary_title']}]({data['primary_url']})"
    )

    # ── Related Topics ────────────────────────────────────────────────────────
    related = data.get("related_topics", [])
    if related:
        st.markdown("---")
        st.markdown("### 🔗 Related Topics")
        chips_html = ""
        for topic in related:
            wiki_url = f"https://en.wikipedia.org/wiki/{topic.replace(' ', '_')}"
            chips_html += f'<a class="topic-chip" href="{wiki_url}" target="_blank">{topic}</a>'
        st.markdown(chips_html, unsafe_allow_html=True)

    # ── Retrieved Passages ────────────────────────────────────────────────────
    if show_passages and data.get("passages"):
        st.markdown("---")
        st.markdown("### 📄 Retrieved Passages")

        passages = data["passages"]
        scores   = data.get("scores", [0.0] * len(passages))
        sources  = data.get("sources", [{"title": data["primary_title"], "url": data["primary_url"]}] * len(passages))

        for i, (passage, score, source) in enumerate(zip(passages, scores, sources), start=1):
            highlighted = highlight(passage, query)
            score_html  = (
                f'<span class="badge-score">score: {score:.3f}</span> ' if show_scores else ""
            )
            src_html = (
                f'<a href="{source["url"]}" target="_blank">'
                f'<span class="badge-source">{source["title"]}</span></a>'
            )
            st.markdown(
                f'<div class="passage-card">'
                f'<strong>#{i}</strong> {score_html}{src_html}<br><br>'
                f'{highlighted}'
                f"</div>",
                unsafe_allow_html=True,
            )

elif search_clicked and not query.strip():
    st.warning("Please enter a question first.")

# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

st.markdown("---")
st.markdown(
    "<center style='color:#aaa;font-size:.78rem;'>"
    "Wikipedia Smart QA v2 · FAISS + cross-encoder + flan-t5-small · "
    "Data © <a href='https://en.wikipedia.org' style='color:#aaa'>Wikipedia</a> contributors"
    "</center>",
    unsafe_allow_html=True,
)
