function highlight(text, query) {
  if (!query) return text;
  const words = query.split(/\s+/).filter((w) => w.length >= 4);
  if (!words.length) return text;
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? <mark key={i}>{part}</mark> : part
  );
}

export default function PassageCard({ rank, passage, score, source, query }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 text-sm leading-relaxed">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="text-xs font-bold text-gray-500">#{rank}</span>
        <span className="bg-brand/20 text-brand text-xs font-semibold px-2 py-0.5 rounded-full">
          score: {score.toFixed(3)}
        </span>
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer"
          className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-2 py-0.5 rounded-full transition-colors"
        >
          {source.title}
        </a>
      </div>
      <p className="text-gray-300">{highlight(passage, query)}</p>
    </div>
  );
}
