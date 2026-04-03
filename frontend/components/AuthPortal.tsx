"use client";

import type { ReactNode } from "react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const FLASK_API_URL = "http://localhost:5000";

type AuthView = "signin" | "create" | "forgot-email" | "forgot-otp" | "forgot-reset";

interface AuthConfig {
  google_configured: boolean;
  password_rules: string[];
}

const DEFAULT_RULES = [
  "At least 12 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One number",
  "One special character",
];

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        d="M21.8 12.23c0-.73-.06-1.27-.2-1.84H12v3.48h5.64c-.11.87-.73 2.19-2.09 3.07l-.02.12 3.04 2.35.21.02c1.92-1.77 3.02-4.37 3.02-7.2Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.76 0 5.08-.91 6.78-2.48l-3.23-2.5c-.86.6-2.01 1.02-3.55 1.02-2.7 0-4.99-1.77-5.82-4.23l-.11.01-3.16 2.44-.04.11A10.24 10.24 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.18 13.8A6.14 6.14 0 0 1 5.86 12c0-.62.11-1.21.3-1.8l-.01-.12-3.2-2.48-.1.05A10 10 0 0 0 2 12c0 1.61.38 3.13 1.05 4.47l3.13-2.67Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.96c1.94 0 3.24.84 3.98 1.54l2.91-2.84C17.07 2.97 14.76 2 12 2 8.05 2 4.63 4.27 3.05 7.65l3.31 2.55c.85-2.46 3.14-4.24 5.64-4.24Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function ruleSatisfied(rule: string, password: string) {
  if (rule.startsWith("At least")) return password.length >= 12;
  if (rule.includes("uppercase")) return /[A-Z]/.test(password);
  if (rule.includes("lowercase")) return /[a-z]/.test(password);
  if (rule.includes("number")) return /\d/.test(password);
  if (rule.includes("special")) return /[^A-Za-z0-9]/.test(password);
  return false;
}

async function postJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${FLASK_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "include",
  });
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function Field({
  icon,
  children,
  trailing,
}: {
  icon: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-3 rounded-md border border-[#ffffff1a] bg-[#ffffff05] px-3 text-[#ededed] shadow-sm focus-within:border-[#ffffff33] focus-within:bg-[#ffffff0a] transition-colors">
      <div className="text-[#a1a1aa] shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export default function AuthPortal() {
  const router = useRouter();
  const [view, setView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [config, setConfig] = useState<AuthConfig>({ google_configured: false, password_rules: DEFAULT_RULES });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get("auth_error");
      if (oauthError) setError(oauthError);

      try {
        const [configResponse, meResponse] = await Promise.all([
          fetch(`${FLASK_API_URL}/api/auth/config`, { credentials: "include" }),
          fetch(`${FLASK_API_URL}/api/auth/me`, { credentials: "include" }),
        ]);

        if (configResponse.ok) {
          const configData = await configResponse.json();
          setConfig({
            google_configured: Boolean(configData.google_configured),
            password_rules: configData.password_rules || DEFAULT_RULES,
          });
        }

        if (meResponse.ok) startTransition(() => router.replace("/dashboard"));
      } catch (fetchError) {
        console.error("Auth boot error:", fetchError);
      }
    };

    hydrate();
  }, [router]);

  const rulesToRender = config.password_rules.length ? config.password_rules : DEFAULT_RULES;
  const ruleChecks = useMemo(
    () => rulesToRender.map((rule) => ({ rule, passed: ruleSatisfied(rule, password) })),
    [password, rulesToRender],
  );

  const clearMessages = () => {
    setError(null);
    setStatus(null);
  };

  const switchTo = (nextView: AuthView) => {
    clearMessages();
    setSubmitting(false);
    setPassword("");
    setConfirmPassword("");
    setOtp("");
    setResetToken("");
    setDevOtp(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setEmailError(null);
    setView(nextView);
  };

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const handleEmailBlur = () => {
    if (email.trim() && !validateEmail(email.trim())) {
      setEmailError("Use your work email as the username.");
    } else {
      setEmailError(null);
    }
  };

  const handleGoogle = () => {
    clearMessages();
    if (!config.google_configured) {
      setError("Google sign-in is not configured yet.");
      return;
    }
    setSubmitting(true);
    window.location.href = `${FLASK_API_URL}/api/auth/google/start`;
  };

  const handleSignIn = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/login", { email, password });
      if (!response.ok || !data.ok) return void setError(data.error || "Unable to sign in.");
      startTransition(() => router.push("/dashboard"));
    } catch (requestError) {
      console.error("Sign in error:", requestError);
      setError("Unable to sign in right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    clearMessages();
    if (password !== confirmPassword) return void setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/register", { email, password });
      if (!response.ok || !data.ok) return void setError(data.error || "Unable to create the account.");
      startTransition(() => router.push("/dashboard"));
    } catch (requestError) {
      console.error("Register error:", requestError);
      setError("Unable to create the account right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotRequest = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/forgot-password/request", { email });
      if (!response.ok || !data.ok) return void setError(data.error || "Unable to send the OTP.");
      setRecoveryEmail(data.email || email);
      setDevOtp(data.dev_otp || null);
      setStatus(data.message || "OTP sent.");
      setView("forgot-otp");
    } catch (requestError) {
      console.error("Forgot password request error:", requestError);
      setError("Unable to send the OTP right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async () => {
    clearMessages();
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/forgot-password/verify", {
        email: recoveryEmail || email,
        otp,
      });
      if (!response.ok || !data.ok) return void setError(data.error || "Unable to verify the OTP.");
      setResetToken(data.reset_token);
      setStatus(`OTP verified. Choose a new password.`);
      setView("forgot-reset");
    } catch (requestError) {
      console.error("Verify OTP error:", requestError);
      setError("Unable to verify the OTP right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    clearMessages();
    if (password !== confirmPassword) return void setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/forgot-password/reset", {
        email: recoveryEmail || email,
        reset_token: resetToken,
        password,
      });
      if (!response.ok || !data.ok) return void setError(data.error || "Unable to reset the password.");
      setStatus("Password updated. Sign in with your new credentials.");
      setView("signin");
      setPassword("");
      setConfirmPassword("");
      setOtp("");
      setResetToken("");
      setDevOtp(null);
    } catch (requestError) {
      console.error("Reset password error:", requestError);
      setError("Unable to reset the password right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const titleMap: Record<AuthView, string> = {
    signin: "Sign in",
    create: "Create account",
    "forgot-email": "Reset password",
    "forgot-otp": "Verify code",
    "forgot-reset": "New password",
  };

  const subtitleMap: Record<AuthView, string> = {
    signin: "Enter your details to access your workspace.",
    create: "Use your work email to register.",
    "forgot-email": "We'll send you a verification code.",
    "forgot-otp": `Enter the 6-digit code sent to ${recoveryEmail || email}.`,
    "forgot-reset": "Create a secure password.",
  };

  const showPasswordRules = view === "create" || view === "forgot-reset";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] py-12 px-4 sm:px-6 lg:px-8 text-[#ededed] font-sans selection:bg-[#333333]">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ffffff0a] text-white/90 border border-[#ffffff1a] shadow-sm mb-3">
            <Building2 className="h-5 w-5" />
          </div>
          <h1 className="text-sm font-semibold tracking-widest uppercase text-[#ededed]">DocuMind</h1>
        </div>
        <h2 className="mt-2 text-center text-2xl font-semibold tracking-tight text-white">{titleMap[view]}</h2>
        <p className="mt-2 text-center text-sm text-[#a1a1aa]">{subtitleMap[view]}</p>
      </div>

      <div className="mt-8 w-full max-w-md">
        <div className="bg-[#121214] py-8 px-6 shadow-2xl sm:rounded-xl border border-[#ffffff1a]">
          {(view === "forgot-email" || view === "forgot-otp" || view === "forgot-reset") && (
            <button type="button" onClick={() => switchTo("signin")} className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#a1a1aa] hover:text-[#ededed] transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleGoogle}
              disabled={!config.google_configured || submitting}
              className={`flex h-11 w-full items-center justify-center gap-2.5 rounded-md border text-sm font-medium transition-colors ${
                config.google_configured && !submitting
                  ? "border-[#ffffff1a] bg-[#ffffff05] hover:bg-[#ffffff0a] text-[#ededed]"
                  : "cursor-not-allowed border-transparent bg-transparent text-[#52525b]"
              }`}
            >
              <GoogleGlyph />
              Continue with Google
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[#ffffff1a]" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-[#121214] px-3 text-[#a1a1aa] uppercase tracking-wider">Or</span>
              </div>
            </div>

            {(view === "signin" || view === "create" || view === "forgot-email") && (
              <div>
                <Field icon={<Mail className="h-4 w-4" />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => { setEmail(event.target.value); if (emailError) setEmailError(null); }}
                    onBlur={handleEmailBlur}
                    placeholder="name@company.com"
                    className="w-full bg-transparent text-sm placeholder:text-[#52525b] outline-none"
                  />
                </Field>
                {emailError && <p className="mt-1.5 text-xs text-[#f87171] pl-1">{emailError}</p>}
              </div>
            )}

            {(view === "signin" || view === "create" || view === "forgot-reset") && (
              <Field
                icon={<LockKeyhole className="h-4 w-4" />}
                trailing={
                  <button type="button" onClick={() => setShowPassword((current) => !current)} className="text-[#a1a1aa] hover:text-[#ededed] transition-colors p-1">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              >
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Password"
                  className="w-full bg-transparent text-sm placeholder:text-[#52525b] outline-none"
                />
              </Field>
            )}

            {(view === "create" || view === "forgot-reset") && (
              <Field
                icon={<ShieldCheck className="h-4 w-4" />}
                trailing={
                  <button type="button" onClick={() => setShowConfirmPassword((current) => !current)} className="text-[#a1a1aa] hover:text-[#ededed] transition-colors p-1">
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              >
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm password"
                  className="w-full bg-transparent text-sm placeholder:text-[#52525b] outline-none"
                />
              </Field>
            )}

            {view === "forgot-otp" && (
              <Field icon={<BadgeCheck className="h-4 w-4" />}>
                <input
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full bg-transparent text-sm tracking-[0.2em] placeholder:tracking-normal placeholder:text-[#52525b] outline-none"
                />
              </Field>
            )}
          </div>

          {view === "signin" && (
            <div className="mt-3 flex justify-between items-center px-1">
              <div />
              <button type="button" onClick={() => switchTo("forgot-email")} className="text-xs font-medium text-[#a1a1aa] hover:text-[#ededed] transition-colors">
                Forgot password?
              </button>
            </div>
          )}

          {showPasswordRules && (
            <div className="mt-6 rounded-md bg-[#ffffff05] border border-[#ffffff0a] p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#ededed] mb-3">
                <Sparkles className="h-3.5 w-3.5 text-[#a1a1aa]" />
                Requirements
              </div>
              <div className="space-y-2">
                {ruleChecks.map(({ rule, passed }) => (
                  <div key={rule} className={`flex items-center gap-2 text-xs ${passed ? "text-[#ededed]" : "text-[#71717a]"}`}>
                    <CheckCircle2 className={`h-3.5 w-3.5 ${passed ? "text-[#ededed]" : "text-[#3f3f46]"}`} />
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="mt-5 rounded-md border border-[#f87171]/20 bg-[#f87171]/10 px-3 py-2.5 text-xs text-[#fca5a5]">{error}</div>}
          {status && <div className="mt-5 rounded-md border border-[#4ade80]/20 bg-[#4ade80]/10 px-3 py-2.5 text-xs text-[#86efac]">{status}</div>}
          {devOtp && view === "forgot-otp" && <div className="mt-5 rounded-md border border-[#fde047]/20 bg-[#fde047]/10 px-3 py-2.5 text-xs text-[#fef08a]">Dev OTP: <span className="font-mono font-medium tracking-wider">{devOtp}</span></div>}

          <div className="mt-6">
            {view === "signin" && (
              <>
                <button type="button" onClick={handleSignIn} disabled={submitting} className="flex h-10 w-full items-center justify-center rounded-md bg-[#ededed] text-sm font-medium text-[#121214] hover:bg-[#ffffff] transition-colors disabled:opacity-70 disabled:hover:bg-[#ededed]">
                  {submitting ? "Signing in..." : "Sign in"}
                </button>
                <div className="mt-5 text-center text-xs text-[#a1a1aa]">
                  Don't have an account?{" "}
                  <button type="button" onClick={() => switchTo("create")} className="font-medium text-[#ededed] hover:underline hover:underline-offset-2">
                    Sign up
                  </button>
                </div>
              </>
            )}

            {view === "create" && (
              <>
                <button type="button" onClick={handleCreateAccount} disabled={submitting} className="flex h-10 w-full items-center justify-center rounded-md bg-[#ededed] text-sm font-medium text-[#121214] hover:bg-[#ffffff] transition-colors disabled:opacity-70 disabled:hover:bg-[#ededed]">
                  {submitting ? "Creating account..." : "Create account"}
             </button>
                <div className="mt-5 text-center text-xs text-[#a1a1aa]">
                  Already have an account?{" "}
                  <button type="button" onClick={() => switchTo("signin")} className="font-medium text-[#ededed] hover:underline hover:underline-offset-2">
                    Sign in
                  </button>
                </div>
              </>
            )}

            {view === "forgot-email" && (
              <button type="button" onClick={handleForgotRequest} disabled={submitting} className="flex h-10 w-full items-center justify-center rounded-md bg-[#ededed] text-sm font-medium text-[#121214] hover:bg-[#ffffff] transition-colors disabled:opacity-70 disabled:hover:bg-[#ededed]">
                {submitting ? "Sending code..." : "Send code"}
              </button>
            )}

            {view === "forgot-otp" && (
              <div className="space-y-3">
                <button type="button" onClick={handleVerifyOtp} disabled={submitting} className="flex h-10 w-full items-center justify-center rounded-md bg-[#ededed] text-sm font-medium text-[#121214] hover:bg-[#ffffff] transition-colors disabled:opacity-70 disabled:hover:bg-[#ededed]">
                  {submitting ? "Verifying..." : "Verify code"}
                </button>
                <button type="button" onClick={handleForgotRequest} className="flex h-10 w-full items-center justify-center rounded-md border border-[#ffffff1a] bg-transparent text-sm font-medium text-[#ededed] hover:bg-[#ffffff0a] transition-colors">
                  Resend code
                </button>
              </div>
            )}

            {view === "forgot-reset" && (
              <button type="button" onClick={handleResetPassword} disabled={submitting} className="flex h-10 w-full items-center justify-center rounded-md bg-[#ededed] text-sm font-medium text-[#121214] hover:bg-[#ffffff] transition-colors disabled:opacity-70 disabled:hover:bg-[#ededed]">
                {submitting ? "Updating..." : "Update password"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
