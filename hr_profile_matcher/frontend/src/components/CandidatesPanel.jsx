import { useMemo, useState } from "react";

const scoreColor = (score) => {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
};

export default function CandidatesPanel({ results, scrapedProfiles, loading, error, showScraped, onRefresh }) {
  const [sortMode, setSortMode] = useState("match");
  const [searchFilter, setSearchFilter] = useState("");

  const sortedResults = useMemo(() => {
    let list = [...results];
    // Filter by search term if provided
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.title || "").toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.location || "").toLowerCase().includes(q)
      );
    }
    if (sortMode === "name") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "location") {
      list.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
    } else {
      list.sort((a, b) => (b.match_score || 0) - (a.match_score || 0));
    }
    return list;
  }, [results, sortMode, searchFilter]);

  const filteredScraped = useMemo(() => {
    let list = [...scrapedProfiles];
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      list = list.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.title || "").toLowerCase().includes(q) ||
          (p.company || "").toLowerCase().includes(q) ||
          (p.location || "").toLowerCase().includes(q)
      );
    }
    if (sortMode === "name") {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "location") {
      list.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
    }
    return list;
  }, [scrapedProfiles, sortMode, searchFilter]);

  const displayList = showScraped ? filteredScraped : sortedResults;
  const titleCount = showScraped ? filteredScraped.length : sortedResults.length;
  const subtitle = showScraped
    ? "All scraped profiles — run a match to rank them"
    : "Ranked by similarity score";

  return (
    <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {titleCount} {showScraped ? "profiles" : "candidates found"}
          </h2>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {showScraped && onRefresh && (
            <button
              onClick={onRefresh}
              className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
              title="Refresh profiles from database"
            >
              Refresh
            </button>
          )}
          <select
            className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
          >
            {showScraped ? (
              <>
                <option value="name">Name A-Z</option>
                <option value="location">Location</option>
              </>
            ) : (
              <>
                <option value="match">Best Match</option>
                <option value="name">Name A-Z</option>
                <option value="location">Location</option>
              </>
            )}
          </select>
        </div>
      </div>

      {/* Search filter */}
      <div className="mt-4">
        <input
          className="w-full rounded-lg bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Filter by name, title, company, or location..."
          value={searchFilter}
          onChange={(event) => setSearchFilter(event.target.value)}
        />
      </div>

      {loading && (
        <div className="mt-8 flex items-center justify-center text-sm text-slate-400">
          Matching candidates...
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && displayList.length === 0 && (
        <div className="mt-10 text-center text-sm text-slate-400">
          {showScraped
            ? "No profiles in database. Run a scrape first."
            : "No results yet. Run a search to see candidates."}
        </div>
      )}

      <div className="mt-6 space-y-4">
        {displayList.map((candidate) => (
          <div
            key={candidate.id || candidate.profile_url}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 transition-colors hover:border-slate-700"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-semibold truncate">{candidate.name}</h3>
                <p className="text-sm text-slate-400 truncate">
                  {candidate.title}{candidate.title && candidate.company ? " · " : ""}{candidate.company}
                </p>
                {candidate.location && (
                  <p className="text-xs text-slate-500 truncate">{candidate.location}</p>
                )}
              </div>
              {!showScraped && candidate.match_score !== undefined && (
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white ${scoreColor(
                    candidate.match_score
                  )}`}
                >
                  {candidate.match_score}%
                </span>
              )}
            </div>

            {!showScraped && candidate.match_score !== undefined && (
              <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
                <div
                  className={`h-2 rounded-full ${scoreColor(candidate.match_score)}`}
                  style={{ width: `${candidate.match_score}%` }}
                />
              </div>
            )}

            {!showScraped && (candidate.matched_skills?.length > 0 || candidate.missing_skills?.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {candidate.matched_skills?.map((skill) => (
                  <span
                    key={`${candidate.name}-${skill}`}
                    className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-200"
                  >
                    {skill}
                  </span>
                ))}
                {candidate.missing_skills?.map((skill) => (
                  <span
                    key={`${candidate.name}-${skill}-missing`}
                    className="rounded-full bg-rose-500/20 px-3 py-1 text-xs text-rose-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <a
                href={candidate.profile_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-300 hover:text-indigo-200"
              >
                View on LinkedIn →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
