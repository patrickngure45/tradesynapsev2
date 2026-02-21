"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SUPPORTED_P2P_COUNTRIES } from "@/lib/p2p/supportedCountries";
import { countryNameToIso2 } from "@/lib/p2p/countryIso2";

type AuthMode = "login" | "signup";
type AuthVariant = "tabs" | "page";

export function AuthClient({
  initialMode = "login",
  variant = "tabs",
}: {
  initialMode?: AuthMode;
  variant?: AuthVariant;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("next") || "/wallet";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [needsTotp, setNeedsTotp] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [country, setCountry] = useState("US");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptRisk, setAcceptRisk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifyPrompt, setVerifyPrompt] = useState<{ email: string; verifyUrl: string | null } | null>(null);

  const countryDetailsRef = useRef<HTMLDetailsElement | null>(null);

  const supportedByRegion = Object.entries(SUPPORTED_P2P_COUNTRIES) as Array<[string, readonly string[]]>;
  const supportedCount = supportedByRegion.reduce((acc, [, list]) => acc + list.length, 0);

  const iso2ToName = (() => {
    const map = new Map<string, string>();
    for (const [, countries] of supportedByRegion) {
      for (const name of countries) {
        const iso2 = countryNameToIso2(name);
        if (iso2) map.set(iso2.toUpperCase(), name);
      }
    }
    return map;
  })();

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
      if (mode === "login") {
        if (totpCode.trim().length > 0) body.totp_code = totpCode.trim();
        if (backupCode.trim().length > 0) body.backup_code = backupCode.trim();
      }
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
        if (mode === "login" && (data.error === "totp_required" || data.totp_required)) {
          setNeedsTotp(true);
          setError("Enter your 2FA code to continue");
          return;
        }
        const msg =
          data.error === "email_taken"
            ? "An account with this email already exists"
            : data.error === "invalid_credentials"
              ? "Invalid email or password"
              : data.error === "invalid_totp_code"
                ? "Invalid 2FA or backup code"
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

  const nextQuery = (() => {
    const next = (searchParams.get("next") ?? "").trim();
    return next ? `?next=${encodeURIComponent(next)}` : "";
  })();

  const flagClass = (() => {
    const c = String(country || "").trim().toLowerCase();
    if (!c || c === "zz") return null;
    // flag-icons expects ISO 3166-1 alpha-2 lowercase.
    return `fi fi-${c}`;
  })();

  const selectedCountryName = (() => {
    const code = String(country || "").trim().toUpperCase() || "ZZ";
    if (code === "ZZ") return "International / Other";
    return iso2ToName.get(code) ?? code;
  })();

  return (
    <div className="w-full">
      {/* Post-signup email verification prompt */}
      {verifyPrompt ? (
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent-2)_14%,transparent)]">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-[var(--accent-2)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
              className="rounded-lg border border-[color-mix(in_srgb,var(--accent-2)_35%,var(--border))] bg-[color-mix(in_srgb,var(--accent-2)_12%,transparent)] px-5 py-2 text-sm font-medium text-[var(--accent-2)] transition hover:bg-[color-mix(in_srgb,var(--accent-2)_18%,transparent)]"
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
            You can also verify later from <Link href="/account" className="text-[var(--accent-2)] underline">Account Settings</Link>.
          </p>
        </div>
      ) : (
      <>
      {variant === "tabs" ? (
        <div className="mb-6 flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1" role="tablist">
          <button
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => {
              setMode("login");
              setError(null);
              setNeedsTotp(false);
              setTotpCode("");
              setBackupCode("");
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              mode === "login"
                ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Log In
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
              setNeedsTotp(false);
              setTotpCode("");
              setBackupCode("");
            }}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
              mode === "signup"
                ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Sign Up
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        {mode === "signup" && (
          <>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">Display Name (optional)</span>
              <div
                className="mt-1 rounded-xl p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 36%, transparent), color-mix(in srgb, var(--accent-2) 30%, transparent))",
                }}
              >
                <div
                  className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]"
                >
                  <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--muted)_65%,var(--foreground))]">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Satoshi"
                    className="w-full rounded-xl bg-transparent px-4 py-3 pl-10 text-sm font-semibold text-[var(--foreground)] outline-none transition focus:shadow-[0_0_0_4px_var(--ring)]"
                  />
                </div>
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Country / Region</span>
              <div
                className="mt-1 rounded-xl p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 36%, transparent), color-mix(in srgb, var(--accent-2) 30%, transparent))",
                }}
              >
                <div className="relative rounded-xl border border-[color-mix(in_srgb,var(--border)_80%,transparent)] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]">
                  <details ref={countryDetailsRef} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 outline-none transition hover:bg-[color-mix(in_srgb,var(--card)_45%,transparent)] focus-visible:shadow-[0_0_0_4px_var(--ring)]">
                      <span className="flex min-w-0 items-center gap-3">
                        {flagClass ? (
                          <span className={flagClass + " inline-block h-4 w-6 rounded-sm border border-[var(--border)]"} aria-hidden />
                        ) : (
                          <span className="inline-block h-4 w-6 rounded-sm border border-[var(--border)] bg-[var(--card-2)]" aria-hidden />
                        )}
                        <span className="min-w-0 truncate text-sm font-semibold text-[var(--foreground)]">{selectedCountryName}</span>
                      </span>

                      <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--muted)]">
                        <span className="hidden sm:inline">{supportedCount} supported</span>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 10.94l3.71-3.71a.75.75 0 1 1 1.06 1.06l-4.24 4.24a.75.75 0 0 1-1.06 0L5.21 8.29a.75.75 0 0 1 .02-1.08Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    </summary>

                    <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
                      <div className="border-b border-[var(--border)] bg-[var(--card-2)] px-4 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Select country</div>
                          <div className="text-xs font-semibold text-[var(--muted)]">Grouped by region</div>
                        </div>
                      </div>
                      <div className="max-h-72 overflow-auto p-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCountry("ZZ");
                            countryDetailsRef.current?.removeAttribute("open");
                          }}
                          className={
                            "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition " +
                            (String(country || "").trim().toUpperCase() === "ZZ"
                              ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--foreground)]"
                              : "hover:bg-[var(--card-2)] text-[var(--foreground)]")
                          }
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="inline-block h-4 w-6 rounded-sm border border-[var(--border)] bg-[var(--card-2)]" aria-hidden />
                            <span className="min-w-0 truncate font-semibold">International / Other</span>
                          </span>
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">ZZ</span>
                        </button>

                        <div className="mt-2 grid gap-2">
                          {supportedByRegion.map(([region, countries]) => (
                            <div key={region} className="rounded-lg border border-[var(--border)] bg-[var(--bg)]">
                              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
                                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">{region}</div>
                                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">
                                  {countries.length}
                                </span>
                              </div>
                              <div className="grid grid-cols-1 gap-1 p-2 sm:grid-cols-2">
                                {countries.map((name) => {
                                  const iso2 = countryNameToIso2(name);
                                  const code = iso2 ? iso2.toUpperCase() : "ZZ";
                                  const active = code === String(country || "").trim().toUpperCase();
                                  const iso2Lc = (iso2 ?? "").toLowerCase();

                                  return (
                                    <button
                                      key={name}
                                      type="button"
                                      onClick={() => {
                                        setCountry(code);
                                        countryDetailsRef.current?.removeAttribute("open");
                                      }}
                                      className={
                                        "flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-2 py-1.5 text-left text-xs transition " +
                                        (active
                                          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] text-[var(--foreground)]"
                                          : "bg-[var(--card)] hover:bg-[var(--card-2)] text-[var(--foreground)]")
                                      }
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        {iso2Lc ? (
                                          <span className={`fi fi-${iso2Lc} inline-block h-3.5 w-5 rounded-sm border border-[var(--border)]`} aria-hidden />
                                        ) : (
                                          <span className="inline-block h-3.5 w-5 rounded-sm border border-[var(--border)] bg-[var(--card-2)]" aria-hidden />
                                        )}
                                        <span className="min-w-0 truncate font-semibold">{name}</span>
                                      </span>
                                      <span className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">{code}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              <span className="mt-1 block text-[10px] text-[var(--muted)]">
                Used to personalize fiat defaults and P2P availability. Change anytime in Account Settings.
              </span>
            </label>
          </>
        )}

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Email</span>
          <div
            className="mt-1 rounded-xl p-[1px]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
            }}
          >
            <div className="relative rounded-xl bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--muted)_65%,var(--foreground))]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z" opacity="0" />
                  <path d="M4 8l8 5 8-5" />
                  <path d="M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2" />
                  <path d="M20 8v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8" />
                </svg>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-2.5 pl-10 text-sm outline-none transition focus:border-[color-mix(in_srgb,var(--accent)_60%,var(--border))] focus:shadow-[0_0_0_4px_var(--ring)]"
              />
            </div>
          </div>
        </label>

        <label className="block">
          <span className="text-xs text-[var(--muted)]">Password</span>
          <div
            className="mt-1 rounded-xl p-[1px]"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
            }}
          >
            <div className="relative rounded-xl bg-[color-mix(in_srgb,var(--bg)_65%,transparent)]">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color-mix(in_srgb,var(--muted)_65%,var(--foreground))]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
                required
                minLength={mode === "signup" ? 8 : 1}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-[var(--border)] bg-transparent px-4 py-2.5 pl-10 text-sm outline-none transition focus:border-[color-mix(in_srgb,var(--accent)_60%,var(--border))] focus:shadow-[0_0_0_4px_var(--ring)]"
              />
            </div>
          </div>
        </label>

        {mode === "login" && needsTotp && (
          <>
            <label className="block">
              <span className="text-xs text-[var(--muted)]">2FA Code</span>
              <div
                className="mt-1 rounded-xl p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
                }}
              >
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  maxLength={6}
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)] px-4 py-2.5 font-mono text-sm tracking-wider outline-none transition focus:border-[color-mix(in_srgb,var(--accent)_60%,var(--border))] focus:shadow-[0_0_0_4px_var(--ring)]"
                />
              </div>
            </label>

            <label className="block">
              <span className="text-xs text-[var(--muted)]">Backup Code (optional)</span>
              <div
                className="mt-1 rounded-xl p-[1px]"
                style={{
                  background:
                    "linear-gradient(135deg, color-mix(in srgb, var(--accent) 34%, transparent), color-mix(in srgb, var(--accent-2) 28%, transparent))",
                }}
              >
                <input
                  type="text"
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  className="w-full rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_65%,transparent)] px-4 py-2.5 font-mono text-sm tracking-wider outline-none transition focus:border-[color-mix(in_srgb,var(--accent)_60%,var(--border))] focus:shadow-[0_0_0_4px_var(--ring)]"
                />
              </div>
            </label>
          </>
        )}

        {error && (
          <div
            className="relative overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down-bg)_70%,var(--card))] px-4 py-3 text-sm text-[var(--foreground)]"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--down)_25%,var(--border))] bg-[color-mix(in_srgb,var(--down)_10%,transparent)] text-[var(--down)]" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Alert</div>
                <div className="mt-0.5 leading-snug font-semibold">{error}</div>
              </div>
            </div>
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
          className="w-full rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] py-2.5 text-sm font-semibold text-white shadow-[var(--shadow)] transition hover:shadow-[var(--shadow-2)] hover:opacity-95 disabled:opacity-50"
        >
          {loading ? "Please wait..." : mode === "signup" ? "Create Account" : "Log In"}
        </button>
      </form>

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

