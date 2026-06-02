import { useEffect, useMemo, useState } from "react";

const scoreColor = (score) => {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-rose-400";
};

const scoreBarColor = (score) => {
  if (score >= 75) return "bg-gradient-to-r from-emerald-500 to-emerald-400";
  if (score >= 50) return "bg-gradient-to-r from-amber-500 to-amber-400";
  return "bg-gradient-to-r from-rose-500 to-rose-400";
};

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-3/5" />
          <div className="skeleton h-3 w-4/5" />
          <div className="skeleton h-3 w-2/5" />
        </div>
        <div className="skeleton ml-3 h-7 w-12 shrink-0 rounded-full" />
      </div>
      <div className="mt-3 skeleton h-2 w-full rounded-full" />
      <div className="mt-4 flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-20 rounded-full" />
        <div className="skeleton h-5 w-14 rounded-full" />
      </div>
    </div>
  );
}

function EmptyState({ showScraped }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800/50">
        <svg className="h-8 w-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-300">
          {showScraped ? "No profiles in database" : "No results yet"}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {showScraped
            ? "Run a scrape to populate the database."
            : 'Set your criteria above and click "Find Candidates".'}
        </p>
      </div>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <div className="animate-fade-in mt-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300 ring-1 ring-rose-500/15">
      <div className="flex items-start gap-2">
        <svg className="mt-0.5 h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <span>{error}</span>
      </div>
    </div>
  );
}

function SkillBadge({ skill, matched }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
        matched
          ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20"
          : "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20"
      }`}
    >
      {matched ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {skill}
    </span>
  );
}

export default function CandidatesPanel({ results, scrapedProfiles, loading, error, showScraped, onRefresh, onClear }) {
  const [sortMode, setSortMode] = useState("match");
  const [sortDirection, setSortDirection] = useState("desc");
  const [searchFilter, setSearchFilter] = useState("");

  // Reset sort mode when switching between matched/scraped views
  useEffect(() => {
    if (showScraped && sortMode === "match") {
      setSortMode("date");
    }
  }, [showScraped, sortMode]);

  const toggleDirection = () => {
    setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
  };

  const sortedResults = useMemo(() => {
    let list = [...results];
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
    const dir = sortDirection === "asc" ? 1 : -1;
    if (sortMode === "name") {
      list.sort((a, b) => dir * (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "location") {
      list.sort((a, b) => dir * (a.location || "").localeCompare(b.location || ""));
    } else {
      list.sort((a, b) => dir * ((a.match_score || 0) - (b.match_score || 0)));
    }
    return list;
  }, [results, sortMode, sortDirection, searchFilter]);

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
    const dir = sortDirection === "asc" ? 1 : -1;
    if (sortMode === "name") {
      list.sort((a, b) => dir * (a.name || "").localeCompare(b.name || ""));
    } else if (sortMode === "location") {
      list.sort((a, b) => dir * (a.location || "").localeCompare(b.location || ""));
    } else if (sortMode === "date") {
      list.sort((a, b) => {
        const da = a.created_at ? new Date(a.created_at).getTime() : 0;
        const db = b.created_at ? new Date(b.created_at).getTime() : 0;
        const dateDiff = da - db;
        if (dateDiff !== 0) return dir * dateDiff;
        // Tiebreaker: sort by name when dates are equal
        return dir * (a.name || "").localeCompare(b.name || "");
      });
    }
    return list;
  }, [scrapedProfiles, sortMode, sortDirection, searchFilter]);

  const displayList = showScraped ? filteredScraped : sortedResults;
  const titleCount = showScraped ? filteredScraped.length : sortedResults.length;
  const subtitle = showScraped
    ? "All scraped profiles — run a match to rank them"
    : "Ranked by similarity score";
  const hasScore = !showScraped && results.some((c) => c.match_score !== undefined);

  return (
    <div className="glass rounded-2xl p-5 shadow-xl shadow-indigo-500/5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {loading ? (
              <span className="skeleton inline-block h-5 w-36 align-middle" />
            ) : (
              <>
                {titleCount}{" "}
                <span className="text-sm font-normal text-slate-400">
                  {showScraped ? "profiles" : "candidates"}
                </span>
              </>
            )}
          </h2>
          {!loading && (
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {showScraped && (
            <>
              {onRefresh && (
                <button
                  onClick={onRefresh}
                  className="rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-[11px] font-medium text-slate-400 transition-all hover:bg-slate-700/60 hover:text-white active:scale-[0.95]"
                  title="Refresh profiles from database"
                >
                  <svg className="mr-1 inline-block h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                  </svg>
                  Refresh
                </button>
              )}
              {onClear && scrapedProfiles.length > 0 && (
                <button
                  onClick={onClear}
                  className="rounded-lg bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/30 transition-all hover:bg-rose-500/25 hover:text-rose-200 active:scale-[0.95]"
                  title="Delete all scraped profiles"
                >
                  <svg className="mr-1 inline-block h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  Clear All
                </button>
              )}
            </>
          )}
          <select
            className="custom-select rounded-lg bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-300 transition-all hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            value={sortMode}
            onChange={(event) => setSortMode(event.target.value)}
          >
            {showScraped ? (
              <>
                <option value="date">Date</option>
                <option value="name">Name</option>
                <option value="location">Location</option>
              </>
            ) : (
              <>
                <option value="match">Match Score</option>
                <option value="name">Name</option>
                <option value="location">Location</option>
              </>
            )}
          </select>
          <button
            onClick={toggleDirection}
            className="rounded-lg bg-slate-800/60 px-2 py-1.5 text-xs text-slate-400 transition-all hover:bg-slate-700/60 hover:text-white active:scale-[0.95]"
            title={sortDirection === "asc" ? "Ascending ↑" : "Descending ↓"}
          >
            {sortDirection === "asc" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Search filter */}
      <div className="relative mt-3">
        <svg
          className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
        <input
          className="w-full rounded-xl bg-slate-800/60 py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          placeholder="Filter by name, title, company, or location..."
          value={searchFilter}
          onChange={(event) => setSearchFilter(event.target.value)}
        />
      </div>

      {/* Content */}
      {loading && (
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState error={error} />}

      {!loading && !error && displayList.length === 0 && <EmptyState showScraped={showScraped} />}

      {!loading && !error && displayList.length > 0 && (
        <div className="mt-5 space-y-3">
          {displayList.map((candidate, index) => (
            <div
              key={candidate.id || candidate.profile_url}
              className="group animate-fade-in rounded-xl border border-slate-800/50 bg-slate-900/30 p-4 shadow-sm transition-all hover:border-indigo-500/20 hover:bg-slate-900/60 hover:shadow-md hover:shadow-indigo-500/5"
              style={{ animationDelay: `${index * 40}ms` }}
            >
              <div className="flex items-start justify-between gap-4">
                {/* Avatar */}
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-600/20 text-sm font-bold text-indigo-300 ring-1 ring-indigo-500/20">
                  {(candidate.name || "?").charAt(0).toUpperCase()}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold leading-tight">{candidate.name}</h3>
                  <p className="mt-0.5 truncate text-xs text-slate-400">
                    {candidate.title}
                    {candidate.title && candidate.company ? " · " : ""}
                    {candidate.company}
                  </p>
                  {candidate.location && (
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                      {candidate.location}
                    </div>
                  )}
                </div>

                {hasScore && candidate.match_score !== undefined && (
                  <div className="shrink-0 text-right">
                    <span className={`text-lg font-bold tabular-nums tracking-tight ${scoreColor(candidate.match_score)}`}>
                      {candidate.match_score}
                      <span className="text-xs font-normal">%</span>
                    </span>
                  </div>
                )}
              </div>

              {/* Score bar */}
              {hasScore && candidate.match_score !== undefined && (
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/60">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${scoreBarColor(candidate.match_score)}`}
                    style={{ width: `${candidate.match_score}%` }}
                  />
                </div>
              )}

              {/* Skills */}
              {!showScraped && (
                <>
                  {(candidate.matched_skills?.length > 0 || candidate.missing_skills?.length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {candidate.matched_skills?.map((skill) => (
                        <SkillBadge key={`${candidate.name}-${skill}`} skill={skill} matched />
                      ))}
                      {candidate.missing_skills?.map((skill) => (
                        <SkillBadge key={`${candidate.name}-${skill}-missing`} skill={skill} matched={false} />
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Profile link */}
              {candidate.profile_url && (
                <div className="mt-3 flex items-center justify-between">
                  <a
                    href={candidate.profile_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-400 transition-colors hover:text-indigo-300"
                  >
                    View Profile
                    <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </a>
                  <span className="text-[10px] text-slate-600">
                    #{index + 1}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
