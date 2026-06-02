import { useMemo, useState } from "react";

const scoreColor = (score) => {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
};

export default function CandidatesPanel({ results, loading, error }) {
  const [sortMode, setSortMode] = useState("match");

  const sortedResults = useMemo(() => {
    const list = [...results];
    if (sortMode === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortMode === "location") {
      list.sort((a, b) => (a.location || "").localeCompare(b.location || ""));
    } else {
      list.sort((a, b) => b.match_score - a.match_score);
    }
    return list;
  }, [results, sortMode]);

  return (
    <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {sortedResults.length} candidates found
          </h2>
          <p className="text-sm text-slate-400">Ranked by similarity score</p>
        </div>
        <select
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value)}
        >
          <option value="match">Best Match</option>
          <option value="name">Name A-Z</option>
          <option value="location">Location</option>
        </select>
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

      {!loading && !error && sortedResults.length === 0 && (
        <div className="mt-10 text-center text-sm text-slate-400">
          No results yet. Run a search to see candidates.
        </div>
      )}

      <div className="mt-6 space-y-4">
        {sortedResults.map((candidate) => (
          <div
            key={candidate.id || candidate.profile_url}
            className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold">{candidate.name}</h3>
                <p className="text-sm text-slate-400">
                  {candidate.title} · {candidate.company}
                </p>
                <p className="text-xs text-slate-500">{candidate.location}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold text-white ${scoreColor(
                  candidate.match_score
                )}`}
              >
                {candidate.match_score}%
              </span>
            </div>

            <div className="mt-3 h-2 w-full rounded-full bg-slate-800">
              <div
                className={`h-2 rounded-full ${scoreColor(candidate.match_score)}`}
                style={{ width: `${candidate.match_score}%` }}
              />
            </div>

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

            <div className="mt-4">
              <a
                href={candidate.profile_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-indigo-300 hover:text-indigo-200"
              >
                View on LinkedIn
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
