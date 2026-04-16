import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import PassageCard from "./PassageCard";

export default function ChatMessage({ msg, onTopicClick }) {
  const [passagesOpen, setPassagesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (msg.role === "user") {
    return (
      <div className="flex justify-end message-enter">
        <div className="bg-surface-container-low text-on-surface px-6 py-4 rounded-2xl rounded-tr-none max-w-[85%] shadow-sm">
          <p className="leading-relaxed">{msg.content}</p>
        </div>
      </div>
    );
  }

  if (msg.role === "streaming") {
    return (
      <div className="space-y-6 message-enter">
        <div className="flex items-start gap-4">
          {/* Avatar — pulses while streaming */}
          <div className="min-w-[40px] h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 animate-pulse">
            <span className="material-symbols-outlined text-on-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>account_tree</span>
          </div>
          <div className="flex-1 space-y-4">
            <article className="answer-prose text-on-surface leading-loose space-y-3">
              {/* Status line: always visible while streaming, fades when content arrives */}
              {msg.status && (
                <div className="flex items-center gap-2 text-primary font-label text-sm transition-opacity duration-300"
                     style={{ opacity: msg.content ? 0.4 : 1 }}>
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse flex-shrink-0" />
                  <span>{msg.status}</span>
                </div>
              )}
              {msg.content && (
                <div>
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</ReactMarkdown>
                  <span className="cursor-blink" />
                </div>
              )}
            </article>
          </div>
        </div>
      </div>
    );
  }

  if (msg.role === "error") {
    return (
      <div className="flex items-start gap-4 message-enter">
        <div className="min-w-[40px] h-10 rounded-full bg-error/20 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-error text-xl">error</span>
        </div>
        <div className="bg-error/10 border border-error/20 rounded-2xl px-5 py-4 text-error text-sm max-w-[85%]">
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant message
  const passages = msg.passages || [];
  const sources = msg.sources || [];
  const relatedTopics = msg.related_topics || [];

  return (
    <div className="space-y-6 message-enter">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="min-w-[40px] h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-on-primary text-xl" style={{ fontVariationSettings: "'FILL' 1" }}>account_tree</span>
        </div>

        <div className="flex-1 space-y-5 min-w-0">
          {/* Answer body + copy button */}
          <div className="relative group/answer">
            <article className="answer-prose text-on-surface leading-loose space-y-3 text-lg">
              <ReactMarkdown
                remarkPlugins={[remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {children}
                    </a>
                  ),
                  strong: ({ children }) => (
                    <strong className="text-primary">{children}</strong>
                  ),
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </article>

            {/* Copy button — always slightly visible, full on hover (touch-friendly) */}
            <button
              onClick={() => copyToClipboard(msg.content)}
              title="Copy answer"
              className="absolute top-0 right-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-label transition-all active:scale-95"
              style={{
                background: copied ? "rgba(105,246,184,0.15)" : "rgba(255,255,255,0.06)",
                color: copied ? "#69f6b8" : "#aaaab3",
                opacity: copied ? 1 : undefined,
              }}
            >
              <span className="material-symbols-outlined text-sm">{copied ? "check" : "content_copy"}</span>
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>

          {/* Sources footnote */}
          {sources.length > 0 && (
            <div className="pt-4 border-t border-outline-variant/15">
              <p className="text-sm italic text-on-surface-variant flex items-center gap-2 flex-wrap">
                <span className="material-symbols-outlined text-base text-primary">link</span>
                Sources:{" "}
                {sources.map((s, i) => (
                  <span key={s.title ?? i}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline not-italic">{s.title}</a>
                    {i < sources.length - 1 && ", "}
                  </span>
                ))}
              </p>
            </div>
          )}

          {/* Expandable passages */}
          {passages.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ background: "rgba(17,19,26,0.8)" }}>
              <button
                onClick={() => setPassagesOpen(!passagesOpen)}
                className="w-full flex items-center justify-between p-4 text-on-surface hover:bg-surface-container-high transition-colors group"
              >
                <span className="font-headline font-semibold text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-base" style={{ color: "#69f6b8" }}>library_books</span>
                  {passagesOpen ? "Hide" : "Show"} {passages.length} retrieved passages
                </span>
                <span className={`material-symbols-outlined transition-transform duration-200 ${passagesOpen ? "rotate-180" : ""}`}>expand_more</span>
              </button>

              {passagesOpen && (
                <div className="p-4 space-y-3 accordion-open" style={{ borderTop: "1px solid rgba(70,69,84,0.2)" }}>
                  {passages.map((p, i) => (
                    <PassageCard key={p.source?.title ? `${p.source.title}-${i}` : i} passage={p} index={i} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Related topics */}
          {relatedTopics.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              <span className="text-xs font-label text-outline uppercase tracking-widest block w-full mb-1">Related Archives</span>
              {relatedTopics.map((topic) => (
                <button key={topic} onClick={() => onTopicClick?.(topic)}
                  className="px-4 py-2 rounded-full border border-primary/20 hover:bg-primary/10 cursor-pointer transition-all text-xs font-medium text-on-surface-variant hover:text-primary active:scale-95">
                  {topic}
                </button>
              ))}
            </div>
          )}

          {/* Latency + sources row */}
          {msg.latency_ms && (
            <div className="flex items-center gap-3 pt-1">
              <span className="material-symbols-outlined text-xs" style={{ color: "#464554", fontSize: "0.75rem" }}>timer</span>
              <p className="text-[11px] font-label uppercase tracking-widest" style={{ color: "#464554" }}>
                {(msg.latency_ms / 1000).toFixed(1)}s · {msg.cached ? "cached" : "live"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
