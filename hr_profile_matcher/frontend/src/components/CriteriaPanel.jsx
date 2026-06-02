import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8000";

export default function CriteriaPanel({
  naturalLanguage,
  onNaturalLanguageChange,
  criteria,
  onCriteriaChange,
  searchMode,
  onSearchModeChange,
  maxResults,
  onMaxResultsChange,
  onFindCandidates,
  loadingQuery,
}) {
  const [skillInput, setSkillInput] = useState("");
  const [parsing, setParsing] = useState(false);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
    }),
    []
  );

  useEffect(() => {
    if (!naturalLanguage) {
      return;
    }
    const timeout = setTimeout(async () => {
      setParsing(true);
      try {
        const response = await fetch(`${API_BASE}/api/parse-nl`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ natural_language: naturalLanguage }),
        });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        onCriteriaChange((prev) => ({
          ...prev,
          job_title: data.job_title ?? prev.job_title,
          required_skills: data.required_skills ?? prev.required_skills,
          years_experience: data.years_experience ?? prev.years_experience,
          location: data.location ?? prev.location,
          contract_type: data.contract_type ?? prev.contract_type,
        }));
      } finally {
        setParsing(false);
      }
    }, 800);

    return () => clearTimeout(timeout);
  }, [authHeaders, naturalLanguage, onCriteriaChange]);

  const addSkill = (event) => {
    event.preventDefault();
    const trimmed = skillInput.trim();
    if (!trimmed) return;
    if (!criteria.required_skills.includes(trimmed)) {
      onCriteriaChange({
        ...criteria,
        required_skills: [...criteria.required_skills, trimmed],
      });
    }
    setSkillInput("");
  };

  const removeSkill = (skill) => {
    onCriteriaChange({
      ...criteria,
      required_skills: criteria.required_skills.filter((item) => item !== skill),
    });
  };

  return (
    <div className="space-y-6 rounded-2xl bg-slate-900 p-6 shadow-xl">
      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Describe the role</h2>
          {parsing && <span className="text-xs text-indigo-300">AI is parsing...</span>}
        </div>
        <textarea
          rows={5}
          className="mt-3 w-full rounded-xl bg-slate-800 p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="Describe the profile you're looking for..."
          value={naturalLanguage}
          onChange={(event) => onNaturalLanguageChange(event.target.value)}
        />
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Job Title</label>
          <input
            className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={criteria.job_title}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, job_title: event.target.value })
            }
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Required Skills
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {criteria.required_skills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-2 rounded-full bg-indigo-500/20 px-3 py-1 text-xs"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="text-indigo-200 hover:text-white"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <form onSubmit={addSkill} className="mt-2 flex gap-2">
            <input
              className="flex-1 rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Type skill and press Enter"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-700 px-3 text-sm text-slate-200"
            >
              Add
            </button>
          </form>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Years of Experience
            </label>
            <input
              type="number"
              min={0}
              max={20}
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={criteria.years_experience}
              onChange={(event) =>
                onCriteriaChange({
                  ...criteria,
                  years_experience: Number(event.target.value),
                })
              }
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">Location</label>
            <input
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={criteria.location}
              onChange={(event) =>
                onCriteriaChange({ ...criteria, location: event.target.value })
              }
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Contract Type
          </label>
          <select
            className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={criteria.contract_type}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, contract_type: event.target.value })
            }
          >
            <option value="CDI">CDI</option>
            <option value="CDD">CDD</option>
            <option value="Freelance">Freelance</option>
            <option value="Stage">Stage</option>
            <option value="Any">Any</option>
          </select>
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">
            Min Match Score: {criteria.min_score}
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={criteria.min_score}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, min_score: Number(event.target.value) })
            }
            className="mt-2 w-full accent-indigo-500"
          />
        </div>

        <div>
          <label className="text-xs uppercase tracking-wide text-slate-400">Search Mode</label>
          <div className="mt-2 flex gap-1 rounded-lg bg-slate-800 p-1">
            {[
              { value: "scrape", label: "Scrape", desc: "LinkedIn only" },
              { value: "database", label: "Database", desc: "Existing only" },
              { value: "both", label: "Both", desc: "Scrape + Match" },
            ].map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSearchModeChange(value)}
                className={`flex-1 rounded-md px-3 py-2 text-xs font-medium transition-all ${
                  searchMode === value
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
                title={desc}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {(searchMode === "scrape" || searchMode === "both") && (
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Max Results
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxResults}
              onChange={(event) =>
                onMaxResultsChange(Math.min(20, Math.max(1, Number(event.target.value))))
              }
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        )}
      </div>

      <div className="space-y-3">
        <button
          onClick={onFindCandidates}
          disabled={loadingQuery}
          className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
        >
          {loadingQuery ? "Generating query..." : "Find Candidates"}
        </button>
      </div>
    </div>
  );
}
