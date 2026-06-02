import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Logo from "../components/Logo.jsx";

/* Icons (inline SVGs, no deps) */

const icons = {
  search: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  ),
  brain: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
  users: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  lightning: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  shield: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
  chart: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  linkedin: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  ),
  check: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  arrowRight: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
};

/* Features data */

const features = [
  {
    title: "AI-Powered Parsing",
    desc: "Describe the role in plain English — our AI extracts structured criteria (title, skills, experience, location) automatically.",
    icon: icons.brain,
    gradient: "from-violet-500/20 to-purple-600/20",
  },
  {
    title: "LinkedIn Profile Scraping",
    desc: "Search and scrape candidate profiles directly from LinkedIn with intelligent query generation and anti-detection stealth.",
    icon: icons.linkedin,
    gradient: "from-blue-500/20 to-indigo-600/20",
  },
  {
    title: "Semantic Matching",
    desc: "Advanced sentence-transformer embeddings score candidates against your criteria — not just keyword matching.",
    icon: icons.search,
    gradient: "from-emerald-500/20 to-teal-600/20",
  },
  {
    title: "Skill Gap Analysis",
    desc: "See exactly which skills match and which are missing for every candidate, at a glance.",
    icon: icons.chart,
    gradient: "from-amber-500/20 to-orange-600/20",
  },
  {
    title: "Secure & Private",
    desc: "Your data is encrypted and stored securely with Supabase Row-Level Security. You control access.",
    icon: icons.shield,
    gradient: "from-cyan-500/20 to-sky-600/20",
  },
  {
    title: "Blazing Fast",
    desc: "Built on FastAPI and optimized async Playwright scraping. Results in seconds, not minutes.",
    icon: icons.lightning,
    gradient: "from-rose-500/20 to-pink-600/20",
  },
];

/* Steps data */

const steps = [
  {
    num: "01",
    title: "Describe the Role",
    desc: "Type a natural language description of your ideal candidate — or fill out the structured form manually.",
  },
  {
    num: "02",
    title: "AI Generates Search Query",
    desc: "The LLM crafts a precise LinkedIn people-search query from your criteria. Review and confirm it.",
  },
  {
    num: "03",
    title: "Scrape & Match",
    desc: "Profiles are scraped from LinkedIn, then semantically matched against your requirements. Results ranked by score.",
  },
  {
    num: "04",
    title: "Review & Hire",
    desc: "Browse matched candidates with skill gaps highlighted. Click through to their LinkedIn profile to take the next step.",
  },
];

/* Component */

export default function Landing() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/dashboard");
    });
  }, [navigate]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth" });
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* NAV */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled ? "glass border-b border-slate-800/50 shadow-xl shadow-indigo-500/5" : ""
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <button onClick={() => scrollTo("hero")} className="flex items-center justify-center">
            <Logo size={44} />
          </button>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <button onClick={() => scrollTo("features")} className="text-sm text-slate-400 transition-colors hover:text-white">
              Features
            </button>
            <button onClick={() => scrollTo("how-it-works")} className="text-sm text-slate-400 transition-colors hover:text-white">
              How It Works
            </button>
            <button onClick={() => scrollTo("cta")} className="text-sm text-slate-400 transition-colors hover:text-white">
              Get Started
            </button>
            <div className="ml-4 flex items-center gap-3">
              <button
                onClick={() => navigate("/login")}
                className="rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2 text-xs font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate("/login")}
                className="rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/30 active:scale-[0.97]"
              >
                Get Started
              </button>
            </div>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800/60 text-slate-400 md:hidden"
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={mobileMenuOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="animate-fade-in border-t border-slate-800/50 bg-slate-900/95 backdrop-blur-2xl md:hidden">
            <div className="space-y-1 px-6 py-4">
              <button onClick={() => scrollTo("features")} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white">
                Features
              </button>
              <button onClick={() => scrollTo("how-it-works")} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white">
                How It Works
              </button>
              <button onClick={() => scrollTo("cta")} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition-colors hover:bg-slate-800/60 hover:text-white">
                Get Started
              </button>
              <div className="mt-3 flex gap-3 border-t border-slate-800/50 pt-3">
                <button
                  onClick={() => navigate("/login")}
                  className="flex-1 rounded-xl border border-slate-700/60 bg-slate-800/40 px-4 py-2.5 text-sm font-medium text-slate-300 transition-all hover:border-slate-600 hover:bg-slate-700/50"
                >
                  Sign In
                </button>
                <button
                  onClick={() => navigate("/login")}
                  className="flex-1 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
                >
                  Get Started
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-48 -top-48 h-[700px] w-[700px] rounded-full bg-indigo-500/10 blur-[150px] animate-float" />
          <div className="absolute -bottom-48 -right-48 h-[700px] w-[700px] rounded-full bg-purple-500/10 blur-[150px] animate-float" style={{ animationDelay: "-2s" }} />
          <div className="absolute left-1/3 top-1/3 h-[400px] w-[400px] rounded-full bg-cyan-500/5 blur-[120px]" />
          <div
            className="absolute inset-0 opacity-[0.02]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.3) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
          {/* Badge */}
          <div className="mx-auto mb-6 inline-flex animate-fade-in items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse-glow" />
            AI-Powered Candidate Matching
          </div>

          <h1 className="animate-fade-in-up text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
            Find the{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent animate-gradient-shift">
              perfect candidate
            </span>{" "}
            in seconds
          </h1>

          <p className="mx-auto mt-6 max-w-2xl animate-fade-in-up text-base leading-relaxed text-slate-400 sm:text-lg">
            HR Profile Matcher combines AI-powered NLP parsing with intelligent LinkedIn
            scraping and semantic matching to surface the best candidates for any role.
          </p>

          {/* CTA buttons */}
          <div className="mt-10 flex animate-fade-in-up flex-col items-center justify-center gap-4 sm:flex-row">
            <button
              onClick={() => navigate("/login")}
              className="group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-2xl shadow-indigo-500/20 transition-all hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/30 active:scale-[0.98]"
            >
              Get Started Free
              <span className="inline-block transition-transform group-hover:translate-x-1">{icons.arrowRight}</span>
            </button>
            <button
              onClick={() => scrollTo("features")}
              className="flex items-center gap-2 rounded-2xl border border-slate-700/50 bg-slate-800/40 px-8 py-3.5 text-base font-medium text-slate-300 shadow-sm transition-all hover:border-slate-600 hover:bg-slate-700/50 hover:text-white"
            >
              See Features
            </button>
          </div>

          {/* Preview mockup */}
          <div className="mt-16 animate-fade-in-up rounded-2xl border border-slate-800/50 bg-slate-900/60 p-2 shadow-2xl shadow-indigo-500/5 backdrop-blur-sm">
            <div className="overflow-hidden rounded-xl">
              <div className="flex items-center gap-1.5 border-b border-slate-800/50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
                <span className="ml-3 rounded-md bg-slate-800/80 px-3 py-1 text-[11px] text-slate-500">localhost/dashboard</span>
              </div>
              <div className="bg-slate-950/80 p-6">
                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                  <div className="space-y-3">
                    <div className="h-6 w-3/5 rounded-md bg-slate-800/60" />
                    <div className="h-20 w-full rounded-xl bg-slate-800/40" />
                    <div className="h-8 w-full rounded-xl bg-gradient-to-r from-indigo-500/20 to-purple-600/20 ring-1 ring-indigo-500/20" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-6 w-1/3 rounded-md bg-slate-800/60" />
                      <div className="h-6 w-16 rounded-md bg-slate-800/40" />
                    </div>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex animate-fade-in items-start gap-3 rounded-xl border border-slate-800/30 bg-slate-900/40 p-3" style={{ animationDelay: `${i * 100}ms` }}>
                        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-600/20" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3.5 w-2/5 rounded bg-slate-800/60" />
                          <div className="h-3 w-3/4 rounded bg-slate-800/40" />
                          <div className="h-2.5 w-1/4 rounded bg-slate-800/30" />
                        </div>
                        <div className="h-6 w-10 rounded-full bg-emerald-500/20" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-500/5 blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-indigo-400">Features</h2>
            <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything you need to{" "}
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">hire smarter</span>
            </p>
            <p className="mt-4 text-base text-slate-400">
              From AI-powered parsing to intelligent matching — a complete toolkit for modern recruiting.
            </p>
          </div>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, i) => (
              <div
                key={feature.title}
                className="group animate-fade-in-up rounded-2xl border border-slate-800/50 bg-slate-900/30 p-6 transition-all hover:border-indigo-500/20 hover:bg-slate-900/60 hover:shadow-lg hover:shadow-indigo-500/5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient} ring-1 ring-indigo-500/10`}>
                  {feature.icon}
                </div>
                <h3 className="mt-4 text-base font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="relative py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-48 top-1/3 h-[500px] w-[500px] rounded-full bg-purple-500/5 blur-[150px]" />
          <div className="absolute -right-48 top-1/3 h-[500px] w-[500px] rounded-full bg-indigo-500/5 blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-sm font-semibold uppercase tracking-widest text-indigo-400">How It Works</h2>
            <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              From description to candidate in{" "}
              <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">four steps</span>
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            {steps.map((step, i) => (
              <div
                key={step.num}
                className="animate-fade-in-up text-center"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-purple-600/15 ring-1 ring-indigo-500/20">
                  <span className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                    {step.num}
                  </span>
                </div>
                <h3 className="mt-5 text-base font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="relative py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="glass rounded-3xl p-8 sm:p-12">
            <div className="grid gap-8 text-center sm:grid-cols-3">
              {[
                { value: "10K+", label: "Profiles Scraped" },
                { value: "99.9%", label: "Match Accuracy" },
                { value: "< 30s", label: "Time to Results" },
              ].map((stat, i) => (
                <div key={stat.label} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                  <p className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-400">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="cta" className="relative py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/10 blur-[150px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to transform your{" "}
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-cyan-400 bg-clip-text text-transparent">
              hiring workflow
            </span>
            ?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-slate-400">
            Join recruiters who find the perfect candidates in minutes. No credit card required.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="group mt-10 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 px-8 py-3.5 text-base font-semibold text-white shadow-2xl shadow-indigo-500/20 transition-all hover:from-indigo-400 hover:to-purple-500 hover:shadow-indigo-500/30 active:scale-[0.98]"
          >
            Get Started Free
            <span className="inline-block transition-transform group-hover:translate-x-1">{icons.arrowRight}</span>
          </button>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-800/50 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center justify-center">
              <Logo size={36} />
            </div>
            <div className="flex items-center gap-5">
              <button onClick={() => scrollTo("features")} className="text-xs text-slate-500 transition-colors hover:text-slate-300">
                Features
              </button>
              <button onClick={() => scrollTo("how-it-works")} className="text-xs text-slate-500 transition-colors hover:text-slate-300">
                How It Works
              </button>
              <button onClick={() => navigate("/login")} className="text-xs text-slate-500 transition-colors hover:text-slate-300">
                Sign In
              </button>
            </div>
            <p className="text-[11px] text-slate-600">
              &copy; {new Date().getFullYear()} Profile Matcher
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
