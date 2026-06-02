import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate("/dashboard");
      }
    });
  }, [navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
      }
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-6">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-white">HR Profile Matcher</h1>
        <p className="text-sm text-slate-400 mt-2">
          {mode === "login" ? "Welcome back." : "Create your account."}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Email
            </label>
            <input
              type="email"
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Password
            </label>
            <input
              type="password"
              className="mt-2 w-full rounded-lg bg-slate-800 px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <div className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-500 px-4 py-2 font-semibold text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {loading ? "Please wait..." : mode === "login" ? "Login" : "Sign Up"}
          </button>
        </form>

        <div className="mt-6 text-sm text-slate-400">
          {mode === "login" ? "No account?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="text-indigo-400 hover:text-indigo-300"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Sign up" : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
