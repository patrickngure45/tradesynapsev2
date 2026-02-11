"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function AuthClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/exchange";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("ZZ");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState<{ email: string; verifyUrl: string | null } | null>(null);

  const setOnboardingMode = (mode: "beginner" | "advanced") => {
    try {
      localStorage.setItem("ts_onboarding_mode", mode);
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const endpoint = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body: Record<string, unknown> = { email, password };
      if (mode === "signup" && displayName.trim()) {
        body.displayName = displayName.trim();
      }
      if (mode === "signup") {
        if (!acceptTerms) {
          setError("Please accept the Terms to create an account");
          return;
        }
        if (!acceptRisk) {
          setError("Please confirm you understand trading risk");
          return;
        }
        body.country = country;
        body.acceptTerms = true;
        body.acceptRisk = true;
      }

      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data.error === "email_taken"
            ? "An account with this email already exists"
            : data.error === "invalid_credentials"
              ? "Invalid email or password"
              : data.error?.includes?.("Invalid input")
                ? "Please check your details and try again"
              : data.error ?? "Something went wrong";
        setError(msg);
        return;
      }

      // Store user ID for API header auth (dev compatibility)
      if (data.user?.id) {
        localStorage.setItem("ts_user_id", data.user.id);
      }

      // After signup, show verify-email prompt before redirecting
      if (mode === "signup") {
        setVerifyPrompt({ email: data.user?.email ?? email, verifyUrl: data.verifyUrl ?? null });
        return;
      }

      router.push(redirectTo);
      router.refresh();
    } catch {
      setError("Network error — check your connection");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      {/* Post-signup email verification prompt */}
      {verifyPrompt ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/10">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Verify Your Email</h2>
          <p className="text-sm text-[var(--muted)]">
            We&apos;ve sent a verification link to <span className="font-medium text-[var(--foreground)]">{verifyPrompt.email}</span>.
            Check your inbox to unlock full account features.
          </p>
          {verifyPrompt.verifyUrl && (
            <Link
              href={verifyPrompt.verifyUrl}
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20"
            >
              Verify Now (dev shortcut)
            </Link>
          )}
          <button
            onClick={() => {
              setOnboardingMode("beginner");
              router.push(redirectTo);
              router.refresh();
            }}
            className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/80"
          >
            Continue (Beginner)
          </button>

          <button
            onClick={() => {
              setOnboardingMode("advanced");
              router.push(redirectTo);
              router.refresh();
            }}
            className="w-full rounded-lg border border-[var(--border)] bg-transparent py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--card)]"
          >
            Continue (Advanced)
          </button>
          <p className="text-xs text-[var(--muted)]">
            You can also verify later from <Link href="/account" className="text-cyan-400 underline">Account Settings</Link>.
          </p>
        </div>
      ) : (
      <>
      {/* Tab switcher */}
      <div className="mb-6 flex rounded-lg border border-[var(--border)] bg-[var(--card)] p-1" role="tablist">
        <button
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => { setMode("login"); setError(null); }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === "login"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Log In
        </button>
        <button
          role="tab"
          aria-selected={mode === "signup"}
          onClick={() => { setMode("signup"); setError(null); }}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
            mode === "signup"
              ? "bg-[var(--accent)] text-white"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          Sign Up
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Display Name (optional)</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Country / Region</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
              >
                <option value="ZZ">International / Other</option>
                <option value="NG">Nigeria</option>
                <option value="KE">Kenya</option>
                <option value="GH">Ghana</option>
                <option value="UG">Uganda</option>
                <option value="TZ">Tanzania</option>
                <option value="RW">Rwanda</option>
                <option value="ZA">South Africa</option>
                <option value="GB">United Kingdom</option>
                <option value="US">United States</option>
              </select>
              <span className="mt-1 block text-[10px] text-[var(--muted)]">
                Used to default your currency and safety settings. You can change your trading preferences later.
              </span>
            </label>
          </>
        )}

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
            required
            minLength={mode === "signup" ? 8 : 1}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-transparent px-4 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {mode === "signup" && (
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 rounded accent-[var(--accent)]"
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="text-[var(--accent)] hover:underline">
                Terms
              </Link>
              {" "}and{" "}
              <Link href="/privacy" className="text-[var(--accent)] hover:underline">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        )}

        {mode === "signup" && (
          <label className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs text-[var(--muted)]">
            <input
              type="checkbox"
              checked={acceptRisk}
              onChange={(e) => setAcceptRisk(e.target.checked)}
              className="mt-0.5 rounded accent-[var(--accent)]"
            />
            <span>
              I understand crypto prices can move quickly, and I can lose money.
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent)]/80 disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-[var(--muted)]">
        Trading involves risk. Prices can move quickly.
      </p>

      {mode === "login" && (
        <p className="mt-2 text-center text-xs text-[var(--muted)]">
          Forgot your password?{" "}
          <span className="text-[var(--accent)] cursor-help" title="Contact your admin or create a new account.">
            Contact support
          </span>
        </p>
      )}
      </>
      )}
    </div>
  );
}
