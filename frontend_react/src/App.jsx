import { useState, useEffect, useRef } from "react";
import { askStream, fetchHistory } from "./api";
import ChatMessage from "./components/ChatMessage";
import QueryInput from "./components/QueryInput";
import Sidebar from "./components/Sidebar";
import AuthModal from "./components/AuthModal";

const LS_TOKEN = "wikiqa_token";
const LS_USER  = "wikiqa_username";

export default function App() {
  /* ── Auth ── */
  const [token, setToken]       = useState(() => localStorage.getItem(LS_TOKEN) || "");
  const [username, setUsername] = useState(() => localStorage.getItem(LS_USER)  || "");
  const [showAuth, setShowAuth] = useState(false);

  /* ── Chat ── */
  const [messages, setMessages] = useState([]);
  const [loading, setLoading]   = useState(false);

  /* ── Sidebar ── */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [history, setHistory]         = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  /* ── Settings ── */
  const [settings, setSettings] = useState({ top_k: 5, num_articles: 2, rerank: true });

  /* ── Scroll anchor ── */
  const bottomRef = useRef(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  /* ── Load history when token changes ── */
  useEffect(() => {
    if (!token) { setHistory([]); return; }
    setHistoryLoading(true);
    fetchHistory(token)
      .then(setHistory)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [token]);

  /* ── Handlers ── */
  function handleAuth(newToken, newUsername) {
    setToken(newToken);
    setUsername(newUsername);
    localStorage.setItem(LS_TOKEN, newToken);
    localStorage.setItem(LS_USER, newUsername);
    setShowAuth(false);
  }

  function handleSignOut() {
    setToken("");
    setUsername("");
    localStorage.removeItem(LS_TOKEN);
    localStorage.removeItem(LS_USER);
    setHistory([]);
  }

  function handleSettingsChange(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(query) {
    /* Append user message */
    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setLoading(true);

    const msgId = Date.now();
    /* Add a streaming placeholder */
    setMessages((prev) => [...prev, { role: "streaming", id: msgId, content: "", status: "" }]);

    try {
      for await (const chunk of askStream(query, {
        top_k: settings.top_k,
        num_articles: settings.num_articles,
        rerank: settings.rerank,
        token,
      })) {
        if (chunk.type === "status") {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { ...m, status: chunk.content } : m))
          );
        } else if (chunk.type === "token") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === msgId ? { ...m, content: m.content + chunk.content, status: "" } : m
            )
          );
        } else if (chunk.type === "done") {
          setMessages((prev) =>
            prev.map((m) => (m.id === msgId ? { role: "assistant", data: chunk } : m))
          );
          if (token) fetchHistory(token).then(setHistory).catch(() => {});
        } else if (chunk.type === "error") {
          setMessages((prev) =>
            prev.filter((m) => m.id !== msgId).concat({ role: "error", content: chunk.content })
          );
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev
          .filter((m) => m.id !== msgId)
          .concat({ role: "error", content: err.message || "Something went wrong." })
      );
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        username={username}
        history={history}
        historyLoading={historyLoading}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onHistoryClick={(q) => { setSidebarOpen(false); handleSubmit(q); }}
        onSignIn={() => setShowAuth(true)}
        onSignOut={handleSignOut}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center
                       justify-center text-gray-400 transition-colors lg:hidden"
          >
            ☰
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg">📖</span>
            <h1 className="font-bold text-white">Wikipedia QA</h1>
            <span className="hidden sm:block text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              RAG · flan-t5
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {username ? (
              <span className="text-xs text-gray-400 hidden sm:block">👤 {username}</span>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="text-xs bg-brand hover:bg-brand-dark text-white px-3 py-1.5
                           rounded-lg transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </header>

        {/* Chat window */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 && !loading && (
            <EmptyState onSample={handleSubmit} />
          )}

          {messages.map((msg, i) => (
            <ChatMessage
              key={i}
              msg={msg}
              onSearch={handleSubmit}
            />
          ))}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <QueryInput onSubmit={handleSubmit} loading={loading} />
      </div>

      {/* Auth modal */}
      {showAuth && (
        <AuthModal onAuth={handleAuth} onClose={() => setShowAuth(false)} />
      )}
    </div>
  );
}

function EmptyState({ onSample }) {
  const featured = [
    "What is Artificial Intelligence?",
    "How do black holes form?",
    "Who was Nikola Tesla?",
    "Explain Quantum Computing",
  ];

  return (
    <div className="flex flex-col items-center justify-center min-h-full py-12 px-4 text-center">
      <div className="text-5xl mb-4">📖</div>
      <h2 className="text-2xl font-bold text-white mb-2">Wikipedia Smart QA</h2>
      <p className="text-gray-500 text-sm max-w-md mb-8">
        Ask any question. The system retrieves relevant Wikipedia passages and
        synthesizes an answer using a local language model.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
        {featured.map((q) => (
          <button
            key={q}
            onClick={() => onSample(q)}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600
                       text-gray-300 text-sm px-4 py-3 rounded-xl transition-colors text-left"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
