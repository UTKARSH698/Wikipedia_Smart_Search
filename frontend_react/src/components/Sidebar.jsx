import { useState } from "react";

export default function Sidebar({
  username,
  history,
  historyLoading,
  settings,
  onSettingsChange,
  onHistoryClick,
  onSignIn,
  onSignOut,
  open,
  onClose,
}) {
  const [tab, setTab] = useState("history"); // "history" | "settings"

  return (
    <>
      {/* Backdrop (mobile) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <aside
        className={`fixed top-0 left-0 h-full w-72 bg-gray-900 border-r border-gray-800
                    flex flex-col z-30 transition-transform duration-200
                    ${open ? "translate-x-0" : "-translate-x-full"}
                    lg:static lg:translate-x-0`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-800">
          <span className="text-white font-semibold text-sm">WikiQA</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition-colors lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* Auth section */}
        <div className="px-4 py-3 border-b border-gray-800">
          {username ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-300 text-sm truncate">
                👤 {username}
              </span>
              <button
                onClick={onSignOut}
                className="text-xs text-gray-500 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={onSignIn}
              className="w-full bg-brand hover:bg-brand-dark text-white text-sm
                         font-medium py-2 rounded-lg transition-colors"
            >
              Sign in / Register
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800">
          {["history", "settings"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wider transition-colors
                ${tab === t
                  ? "text-brand border-b-2 border-brand"
                  : "text-gray-500 hover:text-gray-300"}`}
            >
              {t === "history" ? "📜 History" : "⚙️ Settings"}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "history" ? (
            <HistoryTab
              username={username}
              history={history}
              loading={historyLoading}
              onHistoryClick={onHistoryClick}
              onSignIn={onSignIn}
            />
          ) : (
            <SettingsTab settings={settings} onChange={onSettingsChange} />
          )}
        </div>
      </aside>
    </>
  );
}

function HistoryTab({ username, history, loading, onHistoryClick, onSignIn }) {
  if (!username) {
    return (
      <div className="flex flex-col items-center justify-center h-40 px-4 text-center">
        <p className="text-gray-500 text-sm">Sign in to view your query history.</p>
        <button
          onClick={onSignIn}
          className="mt-3 text-brand text-sm hover:underline"
        >
          Sign in →
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-20">
        <span className="text-gray-500 text-sm">Loading…</span>
      </div>
    );
  }

  if (!history?.length) {
    return (
      <div className="flex items-center justify-center h-20 px-4">
        <p className="text-gray-600 text-sm text-center">No history yet. Start asking!</p>
      </div>
    );
  }

  return (
    <ul className="py-2">
      {history.map((item, i) => (
        <li key={item.id ?? `${item.query}-${i}`}>
          <button
            onClick={() => onHistoryClick(item.query)}
            className="w-full text-left px-4 py-2.5 hover:bg-gray-800 transition-colors group"
          >
            <p className="text-gray-300 text-xs truncate group-hover:text-white">
              {item.query}
            </p>
            <p className="text-gray-600 text-xs mt-0.5">
              {new Date(item.created_at * 1000).toLocaleDateString()}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}

function SettingsTab({ settings, onChange }) {
  return (
    <div className="p-4 space-y-5">
      {/* top_k */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Passages (top_k)
          </label>
          <span className="text-xs text-brand font-mono">{settings.top_k}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={settings.top_k}
          onChange={(e) => onChange("top_k", Number(e.target.value))}
          className="w-full accent-brand"
        />
        <div className="flex justify-between text-xs text-gray-700 mt-0.5">
          <span>1</span><span>10</span>
        </div>
      </div>

      {/* num_articles */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Articles to fetch
          </label>
          <span className="text-xs text-brand font-mono">{settings.num_articles}</span>
        </div>
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={settings.num_articles}
          onChange={(e) => onChange("num_articles", Number(e.target.value))}
          className="w-full accent-brand"
        />
        <div className="flex justify-between text-xs text-gray-700 mt-0.5">
          <span>1</span><span>5</span>
        </div>
      </div>

      {/* rerank toggle */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Cross-encoder rerank
        </span>
        <button
          onClick={() => onChange("rerank", !settings.rerank)}
          className={`relative w-10 h-5 rounded-full transition-colors
            ${settings.rerank ? "bg-brand" : "bg-gray-700"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform
              ${settings.rerank ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>

      <p className="text-xs text-gray-600 pt-2 border-t border-gray-800">
        Settings apply to the next query.
      </p>
    </div>
  );
}
