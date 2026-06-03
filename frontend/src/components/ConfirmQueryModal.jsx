import { useEffect } from "react";

export default function ConfirmQueryModal({
  open,
  onClose,
  searchQuery,
  onSearchQueryChange,
  onConfirm,
  loading,
  mode,
  profilesFound,
  criteria,
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 px-4 pb-12 pt-20 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="animate-slide-up w-full max-w-lg rounded-2xl border border-slate-700/50 bg-slate-900/90 p-6 shadow-2xl shadow-indigo-500/10 backdrop-blur-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="float-right flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800/60 text-xs text-slate-500 transition-all hover:bg-slate-700/60 hover:text-white"
          aria-label="Close modal"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 ring-1 ring-indigo-500/20">
          <svg className="h-6 w-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>

        <h3 id="modal-title" className="text-lg font-semibold tracking-tight">
          LinkedIn Search Query
        </h3>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "scrape"
            ? "Scrape LinkedIn profiles using this query."
            : "Scrape LinkedIn profiles, then match against your criteria."}
        </p>

        <div className="relative mt-4">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
          </svg>
          <input
            className="w-full rounded-xl bg-slate-800/60 py-2.5 pl-9 pr-4 text-sm text-white transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
          />
        </div>

        {/* Active filter tags */}
        {(criteria?.education_level && criteria.education_level !== "Any") || criteria?.sector ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Filters:</span>
            {criteria.education_level && criteria.education_level !== "Any" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-1 font-medium text-indigo-300 ring-1 ring-indigo-500/20">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
                </svg>
                {criteria.education_level}
              </span>
            )}
            {criteria.sector && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 font-medium text-emerald-300 ring-1 ring-emerald-500/20">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
                {criteria.sector}
              </span>
            )}
          </div>
        ) : null}

        {profilesFound !== null && (
          <div className="mt-3 animate-fade-in rounded-xl bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-300 ring-1 ring-emerald-500/15">
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong className="font-semibold">{profilesFound}</strong> profiles found and scraped
              </span>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-3 animate-fade-in rounded-xl bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-300 ring-1 ring-indigo-500/15">
            <div className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-indigo-300/30 border-t-indigo-300" />
              Processing...
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-2 text-sm font-medium text-slate-300 shadow-sm transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white active:scale-[0.97]"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(searchQuery)}
            disabled={loading}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/30 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Working...
              </span>
            ) : (
              "Confirm & Search"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
