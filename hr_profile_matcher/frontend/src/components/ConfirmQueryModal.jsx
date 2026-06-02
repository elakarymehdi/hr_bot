export default function ConfirmQueryModal({
  open,
  onClose,
  searchQuery,
  onSearchQueryChange,
  onConfirm,
  loading,
  mode,
  profilesFound,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold">LinkedIn Search Query</h3>
        <p className="mt-1 text-sm text-slate-400">
          {mode === "scrape"
            ? "Scrape LinkedIn profiles using this query."
            : "Scrape LinkedIn profiles, then match against your criteria."}
        </p>
        <input
          className="mt-4 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
        />

        {profilesFound !== null && (
          <div className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            {profilesFound} profiles found
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(searchQuery)}
            disabled={loading}
            className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {loading ? "Working..." : "Confirm & Search"}
          </button>
        </div>
      </div>
    </div>
  );
}
