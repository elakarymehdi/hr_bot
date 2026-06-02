import { useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-300"
      >
        {title}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && <div className="space-y-3 animate-fade-in">{children}</div>}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

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

  const authHeaders = useMemo(() => ({ "Content-Type": "application/json" }), []);

  useEffect(() => {
    if (!naturalLanguage) return;
    const timeout = setTimeout(async () => {
      setParsing(true);
      try {
        const response = await fetch(`${API_BASE}/api/parse-nl`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({ natural_language: naturalLanguage }),
        });
        if (!response.ok) return;
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
  }, [naturalLanguage, onCriteriaChange]);

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
    <div className="glass rounded-2xl p-5 shadow-xl shadow-indigo-500/5">
      {/* ── Natural language input ── */}
      <Section title="Describe the Role" defaultOpen={!!naturalLanguage}>
        <div className="relative">
          <textarea
            rows={4}
            className="w-full resize-none rounded-xl bg-slate-800/60 p-3.5 text-sm text-white placeholder-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder='e.g. "Looking for a senior software engineer with 5+ years of Python experience..."'
            value={naturalLanguage}
            onChange={(event) => onNaturalLanguageChange(event.target.value)}
          />
          {parsing && (
            <div className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[10px] font-medium text-indigo-300">
              <span className="inline-block h-2 w-2 animate-spin rounded-full border border-indigo-300 border-t-transparent" />
              AI parsing...
            </div>
          )}
        </div>
      </Section>

      <div className="my-4 border-t border-slate-800/50" />

      {/* ── Structured criteria ── */}
      <Section title="Job Details">
        <Field label="Job Title">
          <input
            className="w-full rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white placeholder-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            placeholder="e.g. Software Engineer"
            value={criteria.job_title}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, job_title: event.target.value })
            }
          />
        </Field>

        <Field label="Required Skills">
          {criteria.required_skills.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {criteria.required_skills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex animate-scale-in items-center gap-1 rounded-full bg-indigo-500/15 px-2.5 py-1 text-[11px] font-medium text-indigo-300 ring-1 ring-indigo-500/20"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="ml-0.5 text-indigo-400/70 transition-colors hover:text-indigo-200"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={addSkill} className="flex gap-1.5">
            <input
              className="flex-1 rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white placeholder-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="Type a skill"
              value={skillInput}
              onChange={(event) => setSkillInput(event.target.value)}
            />
            <button
              type="submit"
              className="rounded-xl border border-slate-700/50 bg-slate-800/40 px-3 text-xs font-medium text-slate-300 shadow-sm transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white active:scale-[0.95]"
            >
              Add
            </button>
          </form>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Experience">
            <input
              type="text"
              inputMode="numeric"
              className="w-full rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              value={criteria.years_experience}
              onChange={(event) => {
                const raw = event.target.value.replace(/^0+/, "") || "0";
                onCriteriaChange({
                  ...criteria,
                  years_experience: Math.min(20, Math.max(0, Number(raw))),
                });
              }}
            />
          </Field>
          <Field label="Location">
            <input
              className="w-full rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white placeholder-slate-500 transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              placeholder="Any"
              value={criteria.location}
              onChange={(event) =>
                onCriteriaChange({ ...criteria, location: event.target.value })
              }
            />
          </Field>
        </div>

        <Field label="Contract Type">
          <select
            className="custom-select w-full rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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
        </Field>
      </Section>

      <div className="my-4 border-t border-slate-800/50" />

      {/* ── Thresholds & Modes ── */}
      <Section title="Thresholds &amp; Modes" defaultOpen={false}>
        <Field label={`Min Match Score: ${criteria.min_score}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={criteria.min_score}
            onChange={(event) =>
              onCriteriaChange({ ...criteria, min_score: Number(event.target.value) })
            }
            className="mt-1 w-full"
          />
          <div className="mt-1 flex justify-between text-[10px] text-slate-600">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </Field>

        <Field label="Search Mode">
          <div className="flex gap-1 rounded-xl bg-slate-800/40 p-1">
            {[
              { value: "scrape", label: "Scrape" },
              { value: "database", label: "Database" },
              { value: "both", label: "Both" },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => onSearchModeChange(value)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  searchMode === value
                    ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {(searchMode === "scrape" || searchMode === "both") && (
          <Field label="Max Results">
            <input
              type="text"
              inputMode="numeric"
              value={maxResults || ""}
              onChange={(event) => {
                const raw = event.target.value.replace(/^0+/, "") || "0";
                onMaxResultsChange(Math.min(20, Math.max(1, Number(raw))));
              }}
              className="w-full rounded-xl bg-slate-800/60 px-3.5 py-2 text-sm text-white transition-all focus:bg-slate-800/80 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </Field>
        )}
      </Section>

      {/* ── CTA ── */}
      <div className="mt-6">
        <button
          onClick={onFindCandidates}
          disabled={loadingQuery}
          className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            {loadingQuery ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating query...
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
                Find Candidates
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}
