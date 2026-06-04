import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Logo from "../components/Logo.jsx";
import CandidatesPanel from "../components/CandidatesPanel.jsx";
import ConfirmClearModal from "../components/ConfirmClearModal.jsx";
import ConfirmSignOutModal from "../components/ConfirmSignOutModal.jsx";
import ConfirmQueryModal from "../components/ConfirmQueryModal.jsx";
import CriteriaPanel from "../components/CriteriaPanel.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const emptyCriteria = {
  job_title: "",
  required_skills: [],
  years_experience: 0,
  location: "",
  contract_type: "Any",
  education_level: "Any",
  sector: "",
  min_score: 50,
  raw_description: "",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [role, setRole] = useState("viewer");
  const [criteria, setCriteria] = useState(emptyCriteria);
  const [naturalLanguage, setNaturalLanguage] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [loadingQuery, setLoadingQuery] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("both");
  const [searchQuery, setSearchQuery] = useState("");
  const [scraping, setScraping] = useState(false);
  const [matching, setMatching] = useState(false);
  const [profilesFound, setProfilesFound] = useState(null);
  const [searchMode, setSearchMode] = useState("both");
  const [maxResults, setMaxResults] = useState(20);
  const [scrapedProfiles, setScrapedProfiles] = useState([]);
  const [viewMode, setViewMode] = useState("matched");
  const [totalInDb, setTotalInDb] = useState(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const initialLoadDone = useRef(false);

  // Auth

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/");
        return;
      }
      setToken(data.session.access_token);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        navigate("/");
      } else {
        setToken(newSession.access_token);
      }
    });

    return () => authListener.subscription.unsubscribe();
  }, [navigate]);

  // Stable auth headers – only recomputes when the token string changes
  const authHeaders = useMemo(() => {
    if (!token) return {};
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }, [token]);

  // Fetch user profile

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/me`, { headers: authHeaders });
        if (!cancelled && response.ok) {
          const data = await response.json();
          setRole(data.role || "viewer");
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [token, authHeaders]);

  // Fetch scraped profiles on load

  useEffect(() => {
    if (!token || initialLoadDone.current) return;
    initialLoadDone.current = true;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/api/profiles`, { headers: authHeaders });
        if (!cancelled && response.ok) {
          const data = await response.json();
          setScrapedProfiles(data.profiles || []);
          setTotalInDb(data.profiles?.length ?? null);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
    // Only run once when token becomes available
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Fetch/refresh profiles

  const fetchScrapedProfiles = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch(`${API_BASE}/api/profiles`, { headers: authHeaders });
      if (response.ok) {
        const data = await response.json();
        setScrapedProfiles(data.profiles || []);
        setTotalInDb(data.profiles?.length ?? null);
      }
    } catch {}
  }, [token, authHeaders]);

  // Actions

  const runScrape = async (query) => {
    setScraping(true);
    try {
      // Ensure a valid number is always sent (guard against stale state during
      // React 18 batching when the user clicks "Find Candidates" mid-edit)
      const safeMax =
        typeof maxResults === "number" && maxResults >= 1
          ? Math.round(Math.min(maxResults, 20))
          : 20;
      const response = await fetch(`${API_BASE}/api/scrape`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ search_query: query, max_results: safeMax }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Scrape failed");
      setProfilesFound(data.profiles_found);
      return data.profiles_found;
    } finally {
      setScraping(false);
    }
  };

  const runMatch = async () => {
    setMatching(true);
    try {
      const response = await fetch(`${API_BASE}/api/match`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ...criteria,
          raw_description: naturalLanguage,
          min_score: criteria.min_score,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Match failed");
      setResults(data.results || []);
    } finally {
      setMatching(false);
    }
  };

  const handleFindCandidates = async () => {
    if (searchMode === "database") {
      setError("");
      await runMatch();
      setViewMode("matched");
      return;
    }

    setError("");
    setProfilesFound(null);
    setModalMode(searchMode);
    setLoadingQuery(true);
    try {
      const response = await fetch(`${API_BASE}/api/structure-query`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          ...criteria,
          raw_description: naturalLanguage,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to structure query");
      }
      const data = await response.json();
      setSearchQuery(data.search_query);
      setModalOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingQuery(false);
    }
  };

  const handleConfirm = async (query) => {
    setError("");
    try {
      if (modalMode === "scrape") {
        await runScrape(query);
        await fetchScrapedProfiles();
        setViewMode("scraped");
      } else {
        await runScrape(query);
        await fetchScrapedProfiles();
        await runMatch();
        setViewMode("matched");
      }
      setModalOpen(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClearProfiles = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/profiles`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to clear profiles");
      }
      setScrapedProfiles([]);
      setTotalInDb(0);
      setResults([]);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmSignOut = async () => {
    setShowSignOutModal(false);
    // Navigate away immediately before signing out to avoid a race condition
    // where the auth state listener also triggers navigate("/"), causing
    // the first click to appear to do nothing.
    navigate("/");
    await supabase.auth.signOut();
  };

  const isLoading = scraping || matching;

  // Stats

  const stats = [
    {
      label: "Profiles in DB",
      value: totalInDb ?? scrapedProfiles.length,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
        </svg>
      ),
    },
    {
      label: "Matched",
      value: results.length,
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: "Role",
      value: role.charAt(0).toUpperCase() + role.slice(1),
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 110-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a.672.672 0 01-.91-.247 11.08 11.08 0 00-1.493-1.7 11.08 11.08 0 00-1.493 1.7.672.672 0 01-.91.247l-.657-.38c-.523-.3-.71-.96-.463-1.51.401-.892.732-1.822.985-2.784m0 0a11.08 11.08 0 012.09-.09" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-white">
      {/* Background accents */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-48 -top-48 h-[600px] w-[600px] rounded-full bg-indigo-500/5 blur-[150px]" />
        <div className="absolute -bottom-48 -right-48 h-[600px] w-[600px] rounded-full bg-purple-500/5 blur-[150px]" />
      </div>

      {/* Header */}
      <header className="shrink-0 sticky top-0 z-30 border-b border-slate-800/50 bg-slate-950/90 backdrop-blur-2xl">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <Logo size={36} />
              <div className="hidden sm:block">
                <h1 className="text-sm font-semibold tracking-tight">Profile Matcher</h1>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">{role}</p>
              </div>
            </div>
            <div className="hidden md:flex h-8 w-px bg-slate-800/60" />
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{scrapedProfiles.length} profiles in database</span>
            </div>
          </div>
          <button
            onClick={() => setShowSignOutModal(true)}
            className="rounded-lg border border-slate-700/50 bg-slate-800/40 px-3.5 py-2 text-xs font-medium text-slate-400 transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white active:scale-[0.97]"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden px-6 py-6">
        {/* Stats bar */}
        <div className="mb-6 grid shrink-0 grid-cols-3 gap-3">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className="glass-card animate-fade-in rounded-xl px-4 py-3"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="flex items-center gap-2 text-slate-400">
                {stat.icon}
                <span className="text-[11px] font-medium uppercase tracking-wider">{stat.label}</span>
              </div>
              <p className="mt-1 text-xl font-semibold tracking-tight">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Grid layout */}
        <div className="grid min-h-0 flex-1 gap-6 overflow-hidden lg:grid-cols-[380px_1fr]">
          <div className="animate-fade-in-up overflow-y-auto min-h-0" style={{ animationDelay: "150ms" }}>
            <CriteriaPanel
              naturalLanguage={naturalLanguage}
              onNaturalLanguageChange={setNaturalLanguage}
              criteria={criteria}
              onCriteriaChange={setCriteria}
              searchMode={searchMode}
              onSearchModeChange={setSearchMode}
              maxResults={maxResults}
              onMaxResultsChange={setMaxResults}
              onFindCandidates={handleFindCandidates}
              loadingQuery={loadingQuery}
              isAdmin={role === "admin"}
            />
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden animate-fade-in-up" style={{ animationDelay: "250ms" }}>
            {/* View toggle */}
            {scrapedProfiles.length > 0 && (
              <div className="glass-card mb-3 flex shrink-0 items-center gap-1 self-start rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("matched")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                    viewMode === "matched"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  Match Results
                  {results.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{results.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("scraped")}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-all ${
                    viewMode === "scraped"
                      ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  All Profiles
                  {scrapedProfiles.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px]">{scrapedProfiles.length}</span>
                  )}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-0 rounded-2xl">
              <CandidatesPanel
                results={results}
                scrapedProfiles={viewMode === "scraped" ? scrapedProfiles : []}
                loading={matching}
                error={error}
                showScraped={viewMode === "scraped"}
                onRefresh={fetchScrapedProfiles}
                onClear={() => setShowClearModal(true)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Sign out modal */}
      <ConfirmSignOutModal
        open={showSignOutModal}
        onClose={() => setShowSignOutModal(false)}
        onConfirm={handleConfirmSignOut}
      />

      {/* Clear modal */}
      <ConfirmClearModal
        open={showClearModal}
        onClose={() => setShowClearModal(false)}
        onConfirm={() => {
          setShowClearModal(false);
          handleClearProfiles();
        }}
        count={scrapedProfiles.length}
      />

      <ConfirmQueryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onConfirm={handleConfirm}
        loading={scraping || matching}
        mode={modalMode}
        profilesFound={profilesFound}
        criteria={criteria}
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="glass-strong animate-scale-in rounded-2xl px-8 py-6 text-center shadow-2xl">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-slate-700 border-t-indigo-400" />
            <p className="text-sm font-medium text-slate-200">
              {scraping ? "Scraping LinkedIn profiles..." : "Matching candidates..."}
            </p>
            <p className="mt-1 text-xs text-slate-500">This may take a minute</p>
          </div>
        </div>
      )}
    </div>
  );
}
