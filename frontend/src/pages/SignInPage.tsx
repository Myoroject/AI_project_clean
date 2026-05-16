import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "../utils/cn";

type View = "signin" | "forgot" | "register";

export default function SignInPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState<View>(location.pathname === "/register" ? "register" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in.");
      }
      navigate("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send reset email.");
      }
      setForgotSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to register.");
      }
      // Registration successful: switch to sign in view
      setPassword("");
      setConfirmPassword("");
      setView("signin");
      setSuccess("Account created! Please sign in with your password.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden p-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Background glows */}
      <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-violet-600/8 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/3 w-[400px] h-[400px] bg-indigo-600/8 rounded-full blur-3xl pointer-events-none" />

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />

      {/* Floating trust badges */}
      <div className="absolute top-32 left-8 hidden xl:flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 backdrop-blur-sm" style={{ animation: "fadeSlideUp 0.7s ease 0.2s both" }}>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-base">🔒</div>
        <div>
          <p className="text-xs font-medium text-white">SOC 2 Type II</p>
          <p className="text-[10px] text-zinc-500">Enterprise security</p>
        </div>
      </div>
      <div className="absolute bottom-32 left-8 hidden xl:flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 backdrop-blur-sm" style={{ animation: "fadeSlideUp 0.7s ease 0.4s both" }}>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500/20 to-indigo-500/20 border border-violet-500/20 flex items-center justify-center text-base">⚡</div>
        <div>
          <p className="text-xs font-medium text-white">4,000+ teams</p>
          <p className="text-[10px] text-zinc-500">Trust Documind</p>
        </div>
      </div>
      <div className="absolute top-32 right-8 hidden xl:flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 backdrop-blur-sm" style={{ animation: "fadeSlideUp 0.7s ease 0.3s both" }}>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/20 flex items-center justify-center text-base">📄</div>
        <div>
          <p className="text-xs font-medium text-white">10M+ docs</p>
          <p className="text-[10px] text-zinc-500">Processed & analyzed</p>
        </div>
      </div>
      <div className="absolute bottom-32 right-8 hidden xl:flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 backdrop-blur-sm" style={{ animation: "fadeSlideUp 0.7s ease 0.5s both" }}>
        <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/20 flex items-center justify-center text-base">⭐</div>
        <div>
          <p className="text-xs font-medium text-white">4.9 / 5 rating</p>
          <p className="text-[10px] text-zinc-500">2,400+ reviews</p>
        </div>
      </div>

      {/* Back button */}
      <button
        onClick={() => navigate("/")}
        className="absolute top-6 left-6 flex items-center gap-2 text-zinc-500 hover:text-white transition-colors duration-200 text-sm group"
      >
        <svg
          className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M19 12H5M12 5l-7 7 7 7" />
        </svg>
        Back
      </button>


      {/* Card */}
      <div className="relative w-full max-w-md" style={{ animation: "fadeSlideUp 0.5s ease both" }}>
        {/* Card glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-violet-500/20 to-transparent opacity-60 blur-sm" />

        <div className="relative bg-[#12121c] border border-white/[0.09] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/50 to-transparent" />

          <div className="px-8 pt-7 pb-6">
            {/* Logo — always visible inside card */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2 mb-7 group"
            >
              <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
                <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <span className="text-white font-semibold text-base tracking-tight group-hover:text-violet-200 transition-colors">
                Docu<span className="text-violet-400">mind</span>
              </span>
            </button>
            {/* Sign In View */}
            {view === "signin" && (
              <div
                style={{
                  animation: "fadeSlideUp 0.35s ease both",
                }}
              >
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-1.5 tracking-tight">Welcome back</h1>
                  <p className="text-sm text-zinc-500">Sign in to your Documind workspace</p>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                    <div className={cn(
                      "relative rounded-xl border transition-all duration-200",
                      focused === "email" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                    )}>
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocused("email")}
                        onBlur={() => setFocused(null)}
                        placeholder="you@example.com"
                        className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-colors duration-200"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                    <div className={cn(
                      "relative rounded-xl border transition-all duration-200",
                      focused === "password" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                    )}>
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocused("password")}
                        onBlur={() => setFocused(null)}
                        placeholder="Enter your password"
                        className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none transition-colors duration-200"
                        autoComplete="current-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors duration-200 p-0.5"
                      >
                        {showPassword ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Forgot password */}
                    <div className="flex justify-end mt-2">
                      <button
                        type="button"
                        onClick={() => { setView("forgot"); setError(""); }}
                        className="text-xs text-violet-400 hover:text-violet-300 transition-colors duration-200"
                      >
                        Forgot password?
                      </button>
                    </div>
                  </div>

                  {/* Success / Error Messages */}
                  {success && (
                    <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 mb-2">
                      <svg className="h-4 w-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      <span className="text-xs text-emerald-400">{success}</span>
                    </div>
                  )}
                  {error && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <svg className="h-4 w-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span className="text-xs text-red-400">{error}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full relative bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 overflow-hidden group mt-2"
                  >
                    <span className={cn("flex items-center justify-center gap-2 transition-all duration-300", loading && "opacity-0")}>
                      Sign In
                      <svg className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                    {loading && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-white/[0.08]" />
                  <span className="text-xs text-zinc-600">or</span>
                  <div className="flex-1 h-px bg-white/[0.08]" />
                </div>

                {/* SSO */}
                <button className="w-full flex items-center justify-center gap-3 bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] rounded-xl py-3 text-sm text-zinc-300 font-medium transition-all duration-200">
                  <svg className="h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>

                {/* Sign up link */}
                {/* Sign up link */}
                <p className="text-center text-xs text-zinc-600 mt-6">
                  Don't have an account?{" "}
                  <button
                    onClick={() => { setView("register"); setError(""); }}
                    className="text-violet-400 hover:text-violet-300 font-medium transition-colors duration-200"
                  >
                    Register
                  </button>
                </p>
              </div>
            )}

            {/* Register View */}
            {view === "register" && (
              <div
                style={{
                  animation: "fadeSlideUp 0.35s ease both",
                }}
              >
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-white mb-1.5 tracking-tight">Create an account</h1>
                  <p className="text-sm text-zinc-500">Sign up for a Documind workspace</p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                    <div className={cn(
                      "relative rounded-xl border transition-all duration-200",
                      focused === "email-reg" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                    )}>
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onFocus={() => setFocused("email-reg")}
                        onBlur={() => setFocused(null)}
                        placeholder="you@example.com"
                        className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-colors duration-200"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Password</label>
                    <div className={cn(
                      "relative rounded-xl border transition-all duration-200",
                      focused === "password-reg" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                    )}>
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onFocus={() => setFocused("password-reg")}
                        onBlur={() => setFocused(null)}
                        placeholder="Create a password"
                        className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none transition-colors duration-200"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors duration-200 p-0.5"
                      >
                        {showPassword ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password */}
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1.5">Confirm Password</label>
                    <div className={cn(
                      "relative rounded-xl border transition-all duration-200",
                      focused === "confirm-password-reg" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                    )}>
                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          <path d="M9 12l2 2 4-4" />
                        </svg>
                      </div>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onFocus={() => setFocused("confirm-password-reg")}
                        onBlur={() => setFocused(null)}
                        placeholder="Confirm your password"
                        className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-12 py-3 text-sm focus:outline-none transition-colors duration-200"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors duration-200 p-0.5"
                      >
                        {showConfirmPassword ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                      <svg className="h-4 w-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                      </svg>
                      <span className="text-xs text-red-400">{error}</span>
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full relative bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-violet-500/20 hover:shadow-violet-500/40 overflow-hidden group mt-2"
                  >
                    <span className={cn("flex items-center justify-center gap-2 transition-all duration-300", loading && "opacity-0")}>
                      Register
                      <svg className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </span>
                    {loading && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </span>
                    )}
                  </button>
                </form>

                {/* Sign In link */}
                <p className="text-center text-xs text-zinc-600 mt-6">
                  Already have an account?{" "}
                  <button
                    onClick={() => { setView("signin"); setError(""); }}
                    className="text-violet-400 hover:text-violet-300 font-medium transition-colors duration-200"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            )}

            {/* Forgot Password View */}
            {view === "forgot" && (
              <div style={{ animation: "fadeSlideUp 0.35s ease both" }}>
                {!forgotSent ? (
                  <>
                    <div className="mb-5">
                      <button
                        onClick={() => { setView("signin"); setError(""); }}
                        className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 text-xs mb-5 transition-colors duration-200 group"
                      >
                        <svg className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 12H5M12 5l-7 7 7 7" />
                        </svg>
                        Back to sign in
                      </button>
                      <h1 className="text-2xl font-bold text-white mb-1.5 tracking-tight">Reset password</h1>
                      <p className="text-sm text-zinc-500">Enter your email and we'll send you a reset link.</p>
                    </div>
                    <form onSubmit={handleForgot} className="space-y-4">
                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Email</label>
                        <div className={cn(
                          "relative rounded-xl border transition-all duration-200",
                          focused === "email-forgot" ? "border-violet-500/60 shadow-lg shadow-violet-500/10" : "border-white/10"
                        )}>
                          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                              <polyline points="22,6 12,13 2,6" />
                            </svg>
                          </div>
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onFocus={() => setFocused("email-forgot")}
                            onBlur={() => setFocused(null)}
                            placeholder="you@example.com"
                            className="w-full bg-white/[0.04] hover:bg-white/[0.06] text-white placeholder-zinc-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-colors duration-200"
                          />
                        </div>
                      </div>
                      {error && (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                          <svg className="h-4 w-4 text-red-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                          </svg>
                          <span className="text-xs text-red-400">{error}</span>
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full relative bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-60 text-white font-semibold py-3 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-violet-500/20 mt-2 overflow-hidden"
                      >
                        <span className={cn("transition-opacity duration-300", loading && "opacity-0")}>Send reset link</span>
                        {loading && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={3} />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          </span>
                        )}
                      </button>
                    </form>
                  </>
                ) : (
                  <div className="text-center py-6" style={{ animation: "fadeSlideUp 0.35s ease both" }}>
                    <div className="h-16 w-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                      <svg className="h-8 w-8 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.64 3.45 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Check your email</h3>
                    <p className="text-sm text-zinc-400 mb-6">
                      We sent a reset link to <span className="text-zinc-200 font-medium">{email}</span>
                    </p>
                    <button
                      onClick={() => { setView("signin"); setForgotSent(false); setError(""); }}
                      className="text-sm text-violet-400 hover:text-violet-300 transition-colors duration-200"
                    >
                      ← Back to sign in
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom accent */}
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
