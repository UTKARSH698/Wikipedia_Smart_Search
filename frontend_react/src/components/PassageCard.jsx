export default function PassageCard({ passage, index }) {
  const score = typeof passage.score === "number" ? passage.score.toFixed(2) : null;
  const title = passage.source?.title ?? `Passage ${index + 1}`;
  const text = passage.passage ?? passage.text ?? "";

  return (
    <div className="bg-surface-container rounded-lg p-4 space-y-2 border-l-2 border-primary/30">
      <div className="flex justify-between items-start gap-2">
        <h4 className="font-headline font-bold text-sm text-primary leading-snug">{title}</h4>
        {score && (
          <span className="font-label text-[10px] text-primary uppercase tracking-tighter bg-primary/10 px-2 py-0.5 rounded flex-shrink-0">
            Score: {score}
          </span>
        )}
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed">{text}</p>
      {passage.source?.url && (
        <a href={passage.source.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-primary/60 hover:text-primary transition-colors flex items-center gap-1">
          <span className="material-symbols-outlined text-xs">open_in_new</span>
          {passage.source.url.replace("https://en.wikipedia.org/wiki/", "Wikipedia: ")}
        </a>
      )}
    </div>
  );
}
