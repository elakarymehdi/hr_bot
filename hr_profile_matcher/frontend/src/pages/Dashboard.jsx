import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import CandidatesPanel from "../components/CandidatesPanel.jsx";
import ConfirmQueryModal from "../components/ConfirmQueryModal.jsx";
import CriteriaPanel from "../components/CriteriaPanel.jsx";

const API_BASE = import.meta.env.VITE_API_BASE || "";

const emptyCriteria = {
  job_title: "",
  required_skills: [],
  years_experience: 0,
  location: "",
  contract_type: "Any",
  min_score: 50,
  raw_description: "",
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
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
  const [viewMode, setViewMode] = useState("matched"); // "matched" | "scraped"

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        navigate("/login");
        return;
      }
      setSession(data.session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!newSession) {
        navigate("/login");
      } else {
        setSession(newSession);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [navigate]);

  const authHeaders = useMemo(() => {
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" };
  }, [session]);

  useEffect(() => {
    const fetchMe = async () => {
      if (!session) return;
      const response = await fetch(`${API_BASE}/api/me`, { headers: authHeaders });
      if (!response.ok) {
        setError("Failed to load profile.");
        return;
      }
      const data = await response.json();
      setRole(data.role || "viewer");
    };
    fetchMe();
  }, [authHeaders, session]);

  const handleFindCandidates = async () => {
    // Database mode: skip query generation, go straight to match
    if (searchMode === "database") {
      setError("");
      await runMatch();
      setViewMode("matched");
      return;
    }

    // Scrape / Both: generate the search query and show the modal
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

  const runScrape = async (query) => {
    setScraping(true);
    try {
      const response = await fetch(`${API_BASE}/api/scrape`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ search_query: query, max_results: maxResults }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Scrape failed");
      }
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
      if (!response.ok) {
        throw new Error(data.error || "Match failed");
      }
      setResults(data.results || []);
    } finally {
      setMatching(false);
    }
  };

  const fetchScrapedProfiles = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/profiles`, { headers: authHeaders });
      if (response.ok) {
        const data = await response.json();
        setScrapedProfiles(data.profiles || []);
      }
    } catch {
      // silently fail
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
        // "both" mode: scrape then match
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold">HR Profile Matcher</h1>
          <p className="text-sm text-slate-400">Role: {role}</p>
        </div>
        <button
          onClick={handleSignOut}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:border-slate-500"
        >
          Sign out
        </button>
      </header>

      <main className="grid gap-6 p-6 lg:grid-cols-[360px_1fr]">
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
        <div className="space-y-3">
          {scrapedProfiles.length > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-800 p-1 self-start">
              <button
                type="button"
                onClick={() => setViewMode("matched")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === "matched"
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                Match Results ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("scraped")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  viewMode === "scraped"
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "text-slate-300 hover:text-white"
                }`}
              >
                All Profiles ({scrapedProfiles.length})
              </button>
            </div>
          )}
          <CandidatesPanel
            results={results}
            scrapedProfiles={viewMode === "scraped" ? scrapedProfiles : []}
            loading={matching}
            error={error}
            showScraped={viewMode === "scraped"}
            onRefresh={fetchScrapedProfiles}
          />
        </div>
      </main>

      <ConfirmQueryModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        onConfirm={handleConfirm}
        loading={scraping || matching}
        mode={modalMode}
        profilesFound={profilesFound}
      />
    </div>
  );
}
