import { useState } from "react";

const SAMPLES = [
  "What is Artificial Intelligence?",
  "Explain Quantum Computing",
  "History of the Internet",
  "How does CRISPR work?",
  "Who was Nikola Tesla?",
  "Explain the Theory of Relativity",
  "What causes climate change?",
  "How do black holes form?",
];

export default function QueryInput({ onSubmit, loading }) {
  const [query, setQuery] = useState("");
  const [showSamples, setShowSamples] = useState(false);

  function submit(q) {
    const trimmed = (q ?? query).trim();
    if (!trimmed || loading) return;
    onSubmit(trimmed);
    setQuery("");
    setShowSamples(false);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-gray-800 bg-gray-950 px-4 pt-3 pb-4">
      {/* Sample queries */}
      {showSamples && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {SAMPLES.map((s) => (
            <button
              key={s}
              onClick={() => submit(s)}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-full transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2 items-end">
        {/* Samples toggle */}
        <button
          onClick={() => setShowSamples(!showSamples)}
          title="Sample queries"
          className="w-10 h-10 flex-shrink-0 rounded-xl bg-gray-800 hover:bg-gray-700
                     text-gray-400 flex items-center justify-center transition-colors text-lg"
        >
          💡
        </button>

        {/* Textarea */}
        <textarea
          rows={1}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask anything about Wikipedia…"
          maxLength={300}
          disabled={loading}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5
                     text-white placeholder-gray-500 text-sm resize-none
                     focus:outline-none focus:border-brand disabled:opacity-50
                     max-h-32 overflow-y-auto"
          style={{ minHeight: "42px" }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 128) + "px";
          }}
        />

        {/* Send button */}
        <button
          onClick={() => submit()}
          disabled={!query.trim() || loading}
          className="w-10 h-10 flex-shrink-0 rounded-xl bg-brand hover:bg-brand-dark
                     disabled:opacity-40 text-white flex items-center justify-center
                     transition-colors text-lg"
        >
          {loading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : "↑"}
        </button>
      </div>

      <p className="text-center text-xs text-gray-700 mt-2">
        Enter to send · Shift+Enter for newline · {query.length}/300
      </p>
    </div>
  );
}
