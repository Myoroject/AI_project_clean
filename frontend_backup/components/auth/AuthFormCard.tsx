"use client";

import type { ReactNode } from "react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const FLASK_API_URL = "http://localhost:5000";

export type AuthView = "signin" | "create" | "forgot-email" | "forgot-otp" | "forgot-reset";

interface AuthConfig {
  google_configured: boolean;
  password_rules: string[];
}

interface AuthFormCardProps {
  titleMap?: Partial<Record<AuthView, string>>;
  subtitleMap?: Partial<Record<AuthView, string>>;
  onAuthenticated?: () => void;
}

const DEFAULT_RULES = [
  "At least 12 characters",
  "One uppercase letter",
  "One lowercase letter",
  "One number",
  "One special character",
];

const DEFAULT_TITLE_MAP: Record<AuthView, string> = {
  signin: "Sign in",
  create: "Create account",
  "forgot-email": "Reset password",
  "forgot-otp": "Verify code",
  "forgot-reset": "New password",
};

const DEFAULT_SUBTITLE_MAP: Record<AuthView, string> = {
  signin: "Enter your details to access your workspace.",
  create: "Use your work email to register.",
  "forgot-email": "We'll send you a verification code.",
  "forgot-otp": "Enter the 6-digit code from your email.",
  "forgot-reset": "Create a secure password.",
};

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
    <div className="flex h-11 items-center gap-3 rounded-md border border-white/[0.12] bg-white/[0.05] px-3 text-white shadow-sm transition-colors focus-within:border-white/[0.28] focus-within:bg-white/[0.08]">
      <div className="shrink-0 text-white/55">{icon}</div>
      <div className="min-w-0 flex-1">{children}</div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </div>
  );
}

export default function AuthFormCard({
  titleMap,
  subtitleMap,
  onAuthenticated,
}: AuthFormCardProps) {
  const router = useRouter();
  const mergedTitleMap = { ...DEFAULT_TITLE_MAP, ...titleMap };
  const mergedSubtitleMap = { ...DEFAULT_SUBTITLE_MAP, ...subtitleMap };

  const [view, setView] = useState<AuthView>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [config, setConfig] = useState<AuthConfig>({
    google_configured: false,
    password_rules: DEFAULT_RULES,
  });
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

        if (meResponse.ok) {
          if (onAuthenticated) {
            onAuthenticated();
          } else {
            startTransition(() => router.replace("/dashboard"));
          }
        }
      } catch (fetchError) {
        console.error("Auth boot error:", fetchError);
      }
    };

    hydrate();
  }, [onAuthenticated, router]);

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

  const handleAuthSuccess = () => {
    if (onAuthenticated) {
      onAuthenticated();
      return;
    }
    startTransition(() => router.push("/dashboard"));
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
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to sign in.");
        return;
      }
      handleAuthSuccess();
    } catch (requestError) {
      console.error("Sign in error:", requestError);
      setError("Unable to sign in right now.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAccount = async () => {
    clearMessages();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/register", { email, password });
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to create the account.");
        return;
      }
      handleAuthSuccess();
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
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to send the OTP.");
        return;
      }
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
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to verify the OTP.");
        return;
      }
      setResetToken(data.reset_token);
      setStatus("OTP verified. Choose a new password.");
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
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const { response, data } = await postJson("/api/auth/forgot-password/reset", {
        email: recoveryEmail || email,
        reset_token: resetToken,
        password,
      });
      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to reset the password.");
        return;
      }
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

  const activeSubtitle =
    view === "forgot-otp"
      ? `Enter the 6-digit code sent to ${recoveryEmail || email}.`
      : mergedSubtitleMap[view];
  const showPasswordRules = view === "create" || view === "forgot-reset";

  return (
    <div className="w-full max-w-md">
      <h2 className="text-center text-[2rem] font-semibold tracking-[-0.03em] text-white">
        {mergedTitleMap[view]}
      </h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-white/58">
        {activeSubtitle}
      </p>

      <div className="mt-8 rounded-[28px] border border-white/[0.08] bg-white/[0.045] px-6 py-7 shadow-[0_28px_90px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:px-7">
        {(view === "forgot-email" || view === "forgot-otp" || view === "forgot-reset") && (
          <button
            type="button"
            onClick={() => switchTo("signin")}
            className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-white/55 transition-colors hover:text-white/85"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogle}
            disabled={!config.google_configured || submitting}
            className={`flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border text-sm font-medium transition-colors ${
              config.google_configured && !submitting
                ? "border-white/[0.12] bg-white/[0.05] text-white hover:bg-white/[0.08]"
                : "cursor-not-allowed border-transparent bg-transparent text-white/30"
            }`}
          >
            <GoogleGlyph />
            Continue with Google
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/[0.08]" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-[#11151f] px-3 uppercase tracking-[0.22em] text-white/38">Or</span>
            </div>
          </div>

          {(view === "signin" || view === "create" || view === "forgot-email") && (
            <div>
              <Field icon={<Mail className="h-4 w-4" />}>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  onBlur={handleEmailBlur}
                  placeholder="name@company.com"
                  className="w-full bg-transparent text-sm text-white placeholder:text-white/28 outline-none"
                />
              </Field>
              {emailError && <p className="mt-1.5 pl-1 text-xs text-rose-300">{emailError}</p>}
            </div>
          )}

          {(view === "signin" || view === "create" || view === "forgot-reset") && (
            <Field
              icon={<LockKeyhole className="h-4 w-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="p-1 text-white/55 transition-colors hover:text-white/85"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/28 outline-none"
              />
            </Field>
          )}

          {(view === "create" || view === "forgot-reset") && (
            <Field
              icon={<ShieldCheck className="h-4 w-4" />}
              trailing={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((current) => !current)}
                  className="p-1 text-white/55 transition-colors hover:text-white/85"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
            >
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm password"
                className="w-full bg-transparent text-sm text-white placeholder:text-white/28 outline-none"
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
                className="w-full bg-transparent text-sm tracking-[0.2em] text-white placeholder:tracking-normal placeholder:text-white/28 outline-none"
              />
            </Field>
          )}
        </div>

        {view === "signin" && (
          <div className="mt-3 flex items-center justify-between px-1">
            <div />
            <button
              type="button"
              onClick={() => switchTo("forgot-email")}
              className="text-xs font-medium text-white/55 transition-colors hover:text-white/85"
            >
              Forgot password?
            </button>
          </div>
        )}

        {showPasswordRules && (
          <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center gap-1.5 text-xs font-medium text-white/78">
              <Sparkles className="h-3.5 w-3.5 text-white/50" />
              Requirements
            </div>
            <div className="space-y-2">
              {ruleChecks.map(({ rule, passed }) => (
                <div
                  key={rule}
                  className={`flex items-center gap-2 text-xs ${passed ? "text-white/82" : "text-white/42"}`}
                >
                  <CheckCircle2 className={`h-3.5 w-3.5 ${passed ? "text-emerald-300" : "text-white/18"}`} />
                  {rule}
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/15 bg-rose-400/10 px-3 py-2.5 text-xs text-rose-200">
            {error}
          </div>
        )}
        {status && (
          <div className="mt-5 rounded-2xl border border-emerald-400/15 bg-emerald-400/10 px-3 py-2.5 text-xs text-emerald-200">
            {status}
          </div>
        )}
        {devOtp && view === "forgot-otp" && (
          <div className="mt-5 rounded-2xl border border-amber-300/15 bg-amber-300/10 px-3 py-2.5 text-xs text-amber-100">
            Dev OTP: <span className="font-mono font-medium tracking-wider">{devOtp}</span>
          </div>
        )}

        <div className="mt-6">
          {view === "signin" && (
            <>
              <button
                type="button"
                onClick={handleSignIn}
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-[#0b0f17] transition-colors hover:bg-[#f5f7fb] disabled:opacity-70 disabled:hover:bg-white"
              >
                {submitting ? "Signing in..." : "Sign in"}
              </button>
              <div className="mt-5 text-center text-xs text-white/55">
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTo("create")}
                  className="font-medium text-white transition hover:underline hover:underline-offset-2"
                >
                  Sign up
                </button>
              </div>
            </>
          )}

          {view === "create" && (
            <>
              <button
                type="button"
                onClick={handleCreateAccount}
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-[#0b0f17] transition-colors hover:bg-[#f5f7fb] disabled:opacity-70 disabled:hover:bg-white"
              >
                {submitting ? "Creating account..." : "Create account"}
              </button>
              <div className="mt-5 text-center text-xs text-white/55">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchTo("signin")}
                  className="font-medium text-white transition hover:underline hover:underline-offset-2"
                >
                  Sign in
                </button>
              </div>
            </>
          )}

          {view === "forgot-email" && (
            <button
              type="button"
              onClick={handleForgotRequest}
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-[#0b0f17] transition-colors hover:bg-[#f5f7fb] disabled:opacity-70 disabled:hover:bg-white"
            >
              {submitting ? "Sending code..." : "Send code"}
            </button>
          )}

          {view === "forgot-otp" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleVerifyOtp}
                disabled={submitting}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-[#0b0f17] transition-colors hover:bg-[#f5f7fb] disabled:opacity-70 disabled:hover:bg-white"
              >
                {submitting ? "Verifying..." : "Verify code"}
              </button>
              <button
                type="button"
                onClick={handleForgotRequest}
                className="flex h-11 w-full items-center justify-center rounded-xl border border-white/[0.12] bg-transparent text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                Resend code
              </button>
            </div>
          )}

          {view === "forgot-reset" && (
            <button
              type="button"
              onClick={handleResetPassword}
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-sm font-medium text-[#0b0f17] transition-colors hover:bg-[#f5f7fb] disabled:opacity-70 disabled:hover:bg-white"
            >
              {submitting ? "Updating..." : "Update password"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
