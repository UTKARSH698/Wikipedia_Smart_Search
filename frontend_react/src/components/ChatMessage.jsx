import { useState } from "react";
import ReactMarkdown from "react-markdown";
import PassageCard from "./PassageCard";
import RelatedTopics from "./RelatedTopics";

/* Typing indicator shown while the backend is processing */
export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-sm flex-shrink-0">
        📖
      </div>
      <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-5">
          <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
          <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
          <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export default function ChatMessage({ msg, onSearch }) {
  const [showPassages, setShowPassages] = useState(false);

  /* User bubble */
  if (msg.role === "user") {
    return (
      <div className="flex justify-end mb-4">
        <div className="bg-brand text-white rounded-2xl rounded-tr-sm px-4 py-3 max-w-[75%] text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  /* Streaming bubble — tokens arriving in real-time */
  if (msg.role === "streaming") {
    return (
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-sm flex-shrink-0">
          📖
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-5 py-4 max-w-[85%]">
          {/* Status text while pipeline runs */}
          {msg.status && !msg.content && (
            <p className="text-gray-500 text-xs italic animate-pulse">{msg.status}</p>
          )}
          {/* Incoming tokens */}
          {msg.content ? (
            <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
              <span className="inline-block w-0.5 h-4 bg-gray-300 ml-0.5 animate-blink align-middle" />
            </div>
          ) : (
            !msg.status && (
              <div className="flex gap-1 items-center h-5">
                <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
                <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
                <span className="dot w-2 h-2 bg-gray-400 rounded-full" />
              </div>
            )
          )}
        </div>
      </div>
    );
  }

  /* Error bubble */
  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-red-900/40 flex items-center justify-center text-sm flex-shrink-0">⚠️</div>
        <div className="bg-red-950/40 border border-red-800 rounded-2xl rounded-tl-sm px-4 py-3 max-w-[85%] text-sm text-red-300">
          {msg.content}
        </div>
      </div>
    );
  }

  /* Assistant bubble — full response */
  const { answer, primary_title, primary_url, passages, scores, sources, related_topics, cached, latency_ms, query } = msg.data;

  return (
    <div className="flex items-start gap-3 mb-6">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-brand/20 flex items-center justify-center text-sm flex-shrink-0">📖</div>

      <div className="flex-1 min-w-0 space-y-3">
        {/* Answer card */}
        <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-5 py-4">
          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <a href={primary_url} target="_blank" rel="noreferrer"
               className="text-xs text-gray-400 hover:text-brand transition-colors">
              📰 {primary_title}
            </a>
            {cached && (
              <span className="bg-green-900/40 text-green-400 text-xs px-2 py-0.5 rounded-full border border-green-800/50">
                ⚡ cached
              </span>
            )}
            {latency_ms && (
              <span className="text-xs text-gray-600 ml-auto">
                {(latency_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {/* Answer text */}
          <div className="prose prose-invert prose-sm max-w-none text-gray-200 leading-relaxed">
            <ReactMarkdown>{answer}</ReactMarkdown>
          </div>
        </div>

        {/* Related topics */}
        {related_topics?.length > 0 && (
          <RelatedTopics topics={related_topics} onSearch={onSearch} />
        )}

        {/* Passages toggle */}
        {passages?.length > 0 && (
          <div>
            <button
              onClick={() => setShowPassages(!showPassages)}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              <span>{showPassages ? "▾" : "▸"}</span>
              {showPassages ? "Hide" : "Show"} {passages.length} retrieved passages
            </button>

            {showPassages && (
              <div className="mt-2 space-y-2">
                {passages.map((p, i) => (
                  <PassageCard
                    key={i}
                    rank={i + 1}
                    passage={p}
                    score={scores[i] ?? 0}
                    source={sources[i] ?? { title: primary_title, url: primary_url }}
                    query={query}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
