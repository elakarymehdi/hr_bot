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

function ParsedExperience({ text }) {
  // Parse strings like:
  //   "Software Engineer · Google · Jan 2020 - Present"  (spaced separator)
  //   "DevOps Engineer·Capgemini"                         (no-space separator)
  //   "DevOps Engineer·Capgemini\nMay 2023 - Present · (3 yrs 2 mos)"
  //
  // Split on " · " first, then fall back to "·" if that yields nothing.
  // Render WITHOUT any visible · character — use clean spacing and styling instead.
  const lines = text.split("\n").filter(Boolean);

  if (lines.length <= 1) {
    let parts = text.split(" \u00b7 ").filter(Boolean);
    if (parts.length <= 1) {
      parts = text.split("\u00b7").filter(Boolean);
    }

    if (parts.length <= 1) {
      return <span>{text}</span>;
    }

    // Heuristic: position 0 = title (bold), 1 = company (normal),
    // 2+ = dates/duration/description (dimmed).
    // But sometimes parts[1] is a date range (e.g. "Sep 2019 - Present")
    // when no company is present — detect this by checking if it starts
    // with a month abbreviation or year.
    const isDateStr = (s) =>
      /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4})/i.test(s.trim());

    return (
      <span>
        <strong className="font-medium text-slate-300">{parts[0]}</strong>
        {parts[1] && !isDateStr(parts[1]) && (
          <span className="text-slate-400">
            {" "}at{" "}
            <span className="text-slate-400">{parts[1]}</span>
          </span>
        )}
        {parts[1] && isDateStr(parts[1]) && (
          <>
            <br />
            <span className="text-[10px] text-slate-500">{parts.slice(1).join(" ")}</span>
          </>
        )}
        {parts[1] && !isDateStr(parts[1]) && parts[2] && (
          <>
            <br />
            <span className="text-[10px] text-slate-500">{parts.slice(2).join(" ")}</span>
          </>
        )}
      </span>
    );
  }

  // Multi-line: render each line independently
  return (
    <span>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <ParsedExperience text={line} />
        </span>
      ))}
    </span>
  );
}

function ExperienceSection({ items }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 3);
  const hasMore = items.length > 3;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
        <span>Experience</span>
      </div>
      <div className="space-y-1">
        {visible.map((exp, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
            <ParsedExperience text={exp} />
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-1 text-[11px] font-medium text-indigo-400 transition-colors hover:text-indigo-300"
        >
          {expanded ? "Show less" : `+${items.length - 3} more`}
        </button>
      )}
    </div>
  );
}

function EducationSection({ items }) {
  const visible = items.slice(0, 2);
  const hasMore = items.length > 2;

  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 mb-1.5">
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342" />
        </svg>
        <span>Education</span>
      </div>
      <div className="space-y-1">
        {visible.map((edu, i) => {
          // Strip middot separators for clean display
          const parts = edu.split(" \u00b7 ").filter(Boolean);
          const cleanEdu = parts.length > 1 ? (
            <span>
              <strong className="font-medium text-slate-300">{parts[0]}</strong>
              {parts[1] && (
                <span className="text-slate-400">, {parts[1]}</span>
              )}
              {parts[2] && (
                <>
                  <br />
                  <span className="text-[10px] text-slate-500">{parts.slice(2).join(", ")}</span>
                </>
              )}
            </span>
          ) : (
            edu.replace(/[\u00b7]/g, ", ")
          );
          return (
            <div key={i} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-0.5 h-1 w-1 shrink-0 rounded-full bg-slate-600" />
              {cleanEdu}
            </div>
          );
        })}
      </div>
      {hasMore && (
        <span className="mt-1 inline-block text-[11px] text-slate-500">
          +{items.length - 2} more
        </span>
      )}
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
                    {candidate.title && candidate.company ? " at " : ""}
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
                      {candidate.match_score.toFixed(2)}
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

              {/* Skills (matched view) */}
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

              {/* Skills (scraped view) */}
              {showScraped && candidate.skills?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {candidate.skills.slice(0, 8).map((skill) => (
                    <span
                      key={`${candidate.name}-skill-${skill}`}
                      className="inline-flex items-center rounded-full bg-slate-800/60 px-2.5 py-0.5 text-[11px] font-medium text-slate-400 ring-1 ring-slate-700/50"
                    >
                      {skill}
                    </span>
                  ))}
                  {candidate.skills.length > 8 && (
                    <span className="inline-flex items-center rounded-full bg-slate-800/40 px-2.5 py-0.5 text-[11px] font-medium text-slate-500">
                      +{candidate.skills.length - 8} more
                    </span>
                  )}
                </div>
              )}

              {/* Experience & Education sections (only if data exists) */}
              {(candidate.experience?.length > 0 || candidate.education?.length > 0) && (
                <div className="my-3 border-t border-slate-800/30" />
              )}

              {/* Experience */}
              {candidate.experience?.length > 0 && (
                <ExperienceSection items={candidate.experience} />
              )}

              {/* Education */}
              {candidate.education?.length > 0 && (
                <EducationSection items={candidate.education} />
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
