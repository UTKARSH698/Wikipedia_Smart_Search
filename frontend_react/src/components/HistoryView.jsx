import { useState } from "react";

function getTag(query) {
  const q = query.toLowerCase();
  if (q.match(/quantum|physics|space|star|galaxy|atom|black hole|fermi|entangle/)) return "Science & Tech";
  if (q.match(/roman|empire|war|history|ancient|medieval|revolution|civilization/)) return "History";
  if (q.match(/economy|economic|inflation|gdp|market|trade|ubi|income/)) return "Economics";
  if (q.match(/art|paint|music|design|architect|culture|bauhaus/)) return "Art History";
  if (q.match(/climate|ocean|plastic|environment|pollution|biodeg/)) return "Environment";
  if (q.match(/ai|artificial|machine learning|neural|robot|computer/)) return "Technology";
  if (q.match(/brain|psychology|mental|health|medicine|disease|virus/)) return "Medicine";
  return "Research";
}

function timeAgo(ts) {
  const diff = Math.floor(Date.now() / 1000 - ts);
  if (diff < 3600)   return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 172800) return "Yesterday";
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(ts * 1000).toLocaleDateString();
}

export default function HistoryView({ history, loading, username, onQueryClick, onSignIn, onNewSearch }) {
  const [search, setSearch] = useState("");

  if (!username) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 px-8 text-center">
        <div className="w-20 h-20 rounded-full flex items-center justify-center"
             style={{ background: "rgba(105,246,184,0.1)" }}>
          <span className="material-symbols-outlined text-4xl" style={{ color: "#69f6b8" }}>history</span>
        </div>
        <div>
          <h3 className="font-headline text-2xl font-bold mb-2" style={{ color: "#e5e4ed" }}>Your Research Archive</h3>
          <p style={{ color: "#aaaab3" }}>Sign in to access your past AI explorations into the world's knowledge.</p>
        </div>
        <button onClick={onSignIn}
          className="px-8 py-3 rounded-full font-headline font-bold transition-all hover:opacity-90 active:scale-95"
          style={{ background: "linear-gradient(to right, #69f6b8, #06b77f)", color: "#003923", boxShadow: "0 8px 20px rgba(105,246,184,0.2)" }}>
          Sign In to Archive
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3" style={{ color: "#aaaab3" }}>
          <span className="material-symbols-outlined animate-spin">progress_activity</span>
          Loading archive...
        </div>
      </div>
    );
  }

  if (!history?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
        <span className="material-symbols-outlined text-5xl" style={{ color: "rgba(170,170,179,0.3)" }}>inbox</span>
        <p style={{ color: "#aaaab3" }}>No research history yet. Start asking!</p>
      </div>
    );
  }

  const filtered = search
    ? history.filter((h) => h.query.toLowerCase().includes(search.toLowerCase()))
    : history;

  const [featured, ...rest] = filtered;

  return (
    <div className="relative" style={{ minHeight: "100%" }}>

      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-6 md:px-10 h-16"
           style={{ background: "rgba(12,14,20,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(105,246,184,0.1)" }}>
        <span className="font-label font-black uppercase tracking-widest text-sm" style={{ color: "#69f6b8" }}>
          Research History
        </span>
        <div className="flex items-center gap-4">
          <div className="relative hidden md:block">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search archives..."
              className="border-none outline-none text-sm pl-5 pr-10 py-2 rounded-full"
              style={{ background: "#11131a", color: "#e5e4ed", width: "14rem" }}
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-lg" style={{ color: "#74757d" }}>search</span>
          </div>
          <button className="p-2 transition-colors"
            style={{ color: "#aaaab3" }}
            onMouseEnter={e => e.currentTarget.style.color = "#69f6b8"}
            onMouseLeave={e => e.currentTarget.style.color = "#aaaab3"}>
            <span className="material-symbols-outlined">filter_list</span>
          </button>
          <button className="p-2 transition-colors"
            style={{ color: "#aaaab3" }}
            onMouseEnter={e => e.currentTarget.style.color = "#69f6b8"}
            onMouseLeave={e => e.currentTarget.style.color = "#aaaab3"}>
            <span className="material-symbols-outlined">sort</span>
          </button>
        </div>
      </div>

      <div className="px-6 md:px-10 py-10 pb-32">

        {/* Hero section */}
        <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <h2 className="font-headline font-extrabold tracking-tight" style={{ fontSize: "clamp(2rem,5vw,3rem)", color: "#e5e4ed" }}>
              Research History
            </h2>
            <p className="text-lg max-w-xl" style={{ color: "#aaaab3" }}>
              Recall, revisit, and refine your past AI explorations into the world's knowledge.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="px-5 py-2.5 rounded-full font-bold text-sm transition-all active:scale-95"
              style={{ background: "#69f6b8", color: "#003923", boxShadow: "0 8px 20px rgba(105,246,184,0.2)" }}>
              Most Recent
            </button>
            <button className="px-5 py-2.5 rounded-full font-semibold text-sm transition-all"
              style={{ background: "#1d1f27", color: "#aaaab3", border: "1px solid rgba(70,72,79,0.3)" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(105,246,184,0.4)"}
              onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(70,72,79,0.3)"}>
              Last Month
            </button>
          </div>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Featured card */}
          <div
            onClick={() => onQueryClick(featured.query)}
            className="col-span-1 xl:col-span-2 p-8 relative overflow-hidden group cursor-pointer transition-all duration-500"
            style={{ background: "#11131a", borderRadius: "1rem", border: "1px solid transparent" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(105,246,184,0.2)"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "transparent"}
          >
            <div className="absolute top-0 right-0 p-8">
              <span className="font-label text-xs font-bold uppercase tracking-[0.2em]" style={{ color: "rgba(105,246,184,0.4)" }}>Most Recent</span>
            </div>
            <div className="relative z-10 flex flex-col gap-6">
              <div className="space-y-2 max-w-2xl">
                <div className="flex items-center gap-3 mb-2">
                  <span className="emerald-glow-tag px-3 py-1 rounded-full text-[10px] font-bold uppercase font-label" style={{ color: "#69f6b8" }}>
                    {getTag(featured.query)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "#aaaab3" }}>{timeAgo(featured.created_at)}</span>
                </div>
                <h3 className="font-headline font-extrabold tracking-tight leading-tight" style={{ fontSize: "1.875rem", color: "#69f6b8" }}>
                  {featured.query}
                </h3>
                {featured.answer && (
                  <p className="text-lg leading-relaxed" style={{ color: "#aaaab3" }}>
                    {featured.answer.replace(/\*\*/g, "").replace(/\n/g, " ").slice(0, 220)}...
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-2" style={{ color: "#aaaab3" }}>
                    <span className="material-symbols-outlined text-xl" style={{ color: "#69f6b8" }}>menu_book</span>
                    <span className="text-sm font-bold">{featured.primary_title || "Wikipedia"}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); onQueryClick(featured.query); }}
                    className="px-6 py-2 rounded-full text-sm font-bold font-label transition-all active:scale-95"
                    style={{ border: "1px solid rgba(105,246,184,0.2)", color: "#69f6b8" }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(105,246,184,0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    Re-run
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onQueryClick(featured.query); }}
                    className="px-8 py-2 rounded-full font-bold text-sm font-label transition-all active:scale-95"
                    style={{ background: "linear-gradient(to right, #69f6b8, #06b77f)", color: "#003923", boxShadow: "0 8px 24px rgba(105,246,184,0.2)" }}>
                    Open Research
                  </button>
                </div>
              </div>
            </div>
            {/* Hover glow */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none rounded-2xl"
                 style={{ background: "linear-gradient(135deg, rgba(105,246,184,0) 0%, rgba(105,246,184,0.04) 100%)" }} />
          </div>

          {/* Rest of history cards */}
          {rest.map((item, i) => (
            <div
              key={item.id ?? i}
              onClick={() => onQueryClick(item.query)}
              className="p-6 transition-all duration-300 group cursor-pointer"
              style={{ background: "#11131a", borderRadius: "1rem", border: "1px solid transparent" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#171921"; e.currentTarget.style.borderColor = "rgba(105,246,184,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "#11131a"; e.currentTarget.style.borderColor = "transparent"; }}
            >
              <div className="flex flex-col h-full gap-4">
                <div className="flex justify-between items-start">
                  <span className="emerald-glow-tag px-3 py-1 rounded-full text-[10px] font-bold uppercase font-label" style={{ color: "#69f6b8" }}>
                    {getTag(item.query)}
                  </span>
                  <span className="text-xs font-medium" style={{ color: "#aaaab3" }}>{timeAgo(item.created_at)}</span>
                </div>
                <h4 className="font-headline font-bold tracking-tight" style={{ fontSize: "1.125rem", color: "#69f6b8" }}>
                  {item.query}
                </h4>
                {item.answer && (
                  <p className="text-sm leading-relaxed flex-1 line-clamp-2" style={{ color: "#aaaab3" }}>
                    {item.answer.replace(/\*\*/g, "").replace(/\n/g, " ").slice(0, 140)}...
                  </p>
                )}
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2" style={{ color: "#aaaab3" }}>
                    <span className="material-symbols-outlined text-lg" style={{ color: "rgba(105,246,184,0.6)" }}>description</span>
                    <span className="text-xs font-bold uppercase tracking-wider font-label">{item.primary_title || "Wikipedia"}</span>
                  </div>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-90"
                       style={{ background: "#1d1f27", color: "#69f6b8" }}
                       onMouseEnter={e => { e.currentTarget.style.background = "#69f6b8"; e.currentTarget.style.color = "#003923"; }}
                       onMouseLeave={e => { e.currentTarget.style.background = "#1d1f27"; e.currentTarget.style.color = "#69f6b8"; }}>
                    <span className="material-symbols-outlined text-base">arrow_forward</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        {history.length >= 20 && (
          <div className="mt-16 flex justify-center">
            <button className="group flex flex-col items-center gap-4">
              <span className="font-label text-xs font-bold uppercase tracking-[0.3em] transition-colors"
                    style={{ color: "#aaaab3" }}
                    onMouseEnter={e => e.currentTarget.style.color = "#69f6b8"}
                    onMouseLeave={e => e.currentTarget.style.color = "#aaaab3"}>
                Load More Records
              </span>
              <div className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                   style={{ border: "1px solid rgba(70,72,79,0.3)" }}
                   onMouseEnter={e => e.currentTarget.style.borderColor = "#69f6b8"}
                   onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(70,72,79,0.3)"}>
                <span className="material-symbols-outlined" style={{ color: "#aaaab3" }}>expand_more</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* FAB */}
      {onNewSearch && (
        <button
          onClick={onNewSearch}
          className="fixed bottom-10 right-10 w-16 h-16 rounded-full flex items-center justify-center group active:scale-90 transition-transform z-50"
          style={{ background: "linear-gradient(135deg, #69f6b8, #06b77f)", color: "#003923", boxShadow: "0 10px 40px rgba(105,246,184,0.4)" }}
        >
          <span className="material-symbols-outlined text-3xl transition-transform duration-300 group-hover:rotate-90">add</span>
        </button>
      )}
    </div>
  );
}
