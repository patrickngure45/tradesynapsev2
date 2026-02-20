import { Suspense } from "react";
import type { Metadata } from "next";
import { SiteChrome } from "@/components/SiteChrome";
import { P2PMarketplace } from "./P2PMarketplace";
import { SUPPORTED_P2P_COUNTRIES } from "@/lib/p2p/supportedCountries";
import { countryNameToIso2 } from "@/lib/p2p/countryIso2";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata: Metadata = {
  title: `P2P Trading | ${BRAND_NAME}`,
  description: "Buy and sell crypto directly with other users. Secure escrow and local payment rails.",
};

export default function P2PPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
        <section className="relative mb-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 18% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 72%, var(--ring) 0, transparent 55%)",
            }}
          />

          <div className="relative p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                    <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                    <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                  </span>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Marketplace</div>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[var(--foreground)] md:text-4xl">
                  <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] bg-clip-text text-transparent">P2P</span>{" "}
                  <span>Trading</span>
                </h1>

                <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[var(--muted)]">
                  Buy and sell crypto directly with other users using{" "}
                  <span className="font-semibold text-[var(--foreground)]">local payment rails</span>. Crypto stays in{" "}
                  <span className="font-semibold text-[var(--foreground)]">secure escrow</span> until payment is confirmed.
                </p>

                <div className="mt-5">
                  <div
                    className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-4"
                    style={{ clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%)" }}
                  >
                    <div
                      className="pointer-events-none absolute inset-0 opacity-60"
                      aria-hidden
                      style={{
                        backgroundImage:
                          "radial-gradient(circle at 12% 30%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
                      }}
                    />

                    {/* Connected signal rail */}
                    <div className="relative">
                      <div className="absolute left-3 top-3 bottom-3 w-px bg-[var(--border)] opacity-70" aria-hidden />

                      <div className="space-y-3 pl-8">
                        <div className="relative">
                          <span className="absolute -left-8 top-2 inline-flex h-3 w-3 items-center justify-center">
                            <span className="absolute inline-flex h-3 w-3 rounded-full bg-[var(--up)]" />
                            <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--up-bg)]" />
                          </span>
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--up-bg)] text-[var(--up)]">
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path
                                  fillRule="evenodd"
                                  d="M10 1.75a.75.75 0 0 1 .75.75v.73a6.75 6.75 0 0 1 5.27 5.27h.73a.75.75 0 0 1 0 1.5h-.73a6.75 6.75 0 0 1-5.27 5.27v.73a.75.75 0 0 1-1.5 0v-.73a6.75 6.75 0 0 1-5.27-5.27H3.5a.75.75 0 0 1 0-1.5h.73a6.75 6.75 0 0 1 5.27-5.27V2.5A.75.75 0 0 1 10 1.75Zm0 3a5.25 5.25 0 1 0 0 10.5 5.25 5.25 0 0 0 0-10.5Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Escrow protected</div>
                              <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">Locked until confirmed</div>
                            </div>
                          </div>
                        </div>

                        <div className="relative">
                          <span className="absolute -left-8 top-2 inline-flex h-3 w-3 items-center justify-center">
                            <span className="absolute inline-flex h-3 w-3 rounded-full bg-[var(--accent)]" />
                            <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--ring)]" />
                          </span>
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--accent)]">
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path d="M2.75 6.75A2.75 2.75 0 0 1 5.5 4h9A2.75 2.75 0 0 1 17.25 6.75v6.5A2.75 2.75 0 0 1 14.5 16h-9a2.75 2.75 0 0 1-2.75-2.75v-6.5ZM5.5 5.5c-.69 0-1.25.56-1.25 1.25V8h11.5V6.75c0-.69-.56-1.25-1.25-1.25h-9Zm10.25 4H4.25v3.75c0 .69.56 1.25 1.25 1.25h9c.69 0 1.25-.56 1.25-1.25V9.5Z" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Local rails</div>
                              <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">M-Pesa, Airtel, bank</div>
                            </div>
                          </div>
                        </div>

                        <div className="relative">
                          <span className="absolute -left-8 top-2 inline-flex h-3 w-3 items-center justify-center">
                            <span className="absolute inline-flex h-3 w-3 rounded-full bg-[var(--warn)]" />
                            <span className="absolute inline-flex h-5 w-5 rounded-full bg-[var(--warn-bg)]" />
                          </span>
                          <div className="flex items-start gap-3">
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] text-[var(--warn)]">
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                                <path d="M11 1.75a.75.75 0 0 1 .75.75v5.19l3.53-3.53a.75.75 0 1 1 1.06 1.06l-4.81 4.81a.75.75 0 0 1-1.28-.53V2.5a.75.75 0 0 1 .75-.75ZM4.72 8.22a.75.75 0 0 1 1.06 0L9.5 11.94V7.5a.75.75 0 0 1 1.5 0v6.0a.75.75 0 0 1-1.28.53L4.72 9.28a.75.75 0 0 1 0-1.06Z" />
                              </svg>
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold tracking-tight text-[var(--foreground)]">Fast settlement</div>
                              <div className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">Quick escrow release</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="w-full md:w-80">
                <div
                  className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--warn-bg)] p-4"
                  style={{
                    backgroundImage:
                      "linear-gradient(135deg, transparent 0%, transparent 45%, var(--border) 45%, var(--border) 55%, transparent 55%, transparent 100%)",
                    backgroundSize: "14px 14px",
                  }}
                >
                  <div className="absolute left-0 top-0 h-full w-1 bg-[var(--warn)]" aria-hidden />
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                        <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--warn)]" />
                        <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--warn-bg)]" />
                      </span>
                      <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--foreground)]">Safety reminder</div>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>

                    <div className="mt-3 flex items-start gap-3">
                      <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--warn)]" aria-hidden>
                        <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M8.257 3.099c.765-1.36 2.721-1.36 3.486 0l6.518 11.59c.75 1.334-.214 2.99-1.743 2.99H3.482c-1.53 0-2.493-1.656-1.743-2.99l6.518-11.59ZM10 7.25a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V8a.75.75 0 0 1 .75-.75Zm0 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--foreground)]">
                        Only pay using the exact account details shown in the order screen.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <div className="relative mb-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-6 shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              backgroundImage:
                "radial-gradient(circle at 14% 22%, var(--ring) 0, transparent 55%), radial-gradient(circle at 88% 70%, var(--ring) 0, transparent 55%)",
            }}
          />

          <div className="relative flex items-center justify-between gap-3">
            <div className="w-full">
              <div className="flex items-center gap-3">
                <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                  <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                </span>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">How it works</div>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <h2 className="mt-3 text-xl font-extrabold tracking-tight text-[var(--foreground)]">Three simple steps</h2>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">From ad selection to escrow release, end-to-end.</p>
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-1 gap-6 text-sm md:grid-cols-3">
            <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="absolute left-0 top-0 h-full w-1 bg-[var(--accent)]" aria-hidden />
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-bold text-white shadow-sm">1</div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--ring)] text-[var(--accent)]" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4 4.75A2.75 2.75 0 0 1 6.75 2h6.5A2.75 2.75 0 0 1 16 4.75v10.5A2.75 2.75 0 0 1 13.25 18h-6.5A2.75 2.75 0 0 1 4 15.25V4.75Zm2.75-1.25c-.69 0-1.25.56-1.25 1.25v10.5c0 .69.56 1.25 1.25 1.25h6.5c.69 0 1.25-.56 1.25-1.25V4.75c0-.69-.56-1.25-1.25-1.25h-6.5Z" />
                      </svg>
                    </span>
                    Choose an ad
                  </h3>
                  <p className="mt-1 text-[var(--muted)]">Pick a trader, price, limits, and payment rail.</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="absolute left-0 top-0 h-full w-1 bg-[var(--warn)]" aria-hidden />
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--warn)] text-sm font-bold text-white shadow-sm">2</div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--warn-bg)] text-[var(--warn)]" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M2.75 7.25A2.75 2.75 0 0 1 5.5 4.5h9A2.75 2.75 0 0 1 17.25 7.25v5.5A2.75 2.75 0 0 1 14.5 15.5h-9a2.75 2.75 0 0 1-2.75-2.75v-5.5ZM5.5 6a1.25 1.25 0 0 0-1.25 1.25v.5h11.5v-.5A1.25 1.25 0 0 0 14.5 6h-9Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    Pay using shown details
                  </h3>
                  <p className="mt-1 text-[var(--muted)]">Send funds to the exact account details in the order.</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
              <div className="absolute left-0 top-0 h-full w-1 bg-[var(--up)]" aria-hidden />
              <div className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--up)] text-sm font-bold text-white shadow-sm">3</div>
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-bold text-[var(--foreground)]">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[var(--up-bg)] text-[var(--up)]" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M10 2.5a.75.75 0 0 1 .75.75v8.69l2.72-2.72a.75.75 0 1 1 1.06 1.06l-4 4a.75.75 0 0 1-1.06 0l-4-4a.75.75 0 0 1 1.06-1.06l2.72 2.72V3.25A.75.75 0 0 1 10 2.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    Receive crypto
                  </h3>
                  <p className="mt-1 text-[var(--muted)]">Seller releases escrow and crypto lands in your wallet.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Supported countries */}
        <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
              <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
              <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
            </span>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Supported countries</div>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>

          <div
            className="relative mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-2)]"
            style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)" }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden style={{ backgroundImage: "radial-gradient(circle at 16% 30%, var(--ring) 0, transparent 55%)" }} />
            <div className="absolute left-0 top-0 h-full w-1 bg-[var(--accent-2)]" aria-hidden />

            <div className="relative p-4">
              <div className="flex items-center gap-3">
                <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                  <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]" />
                  <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                </span>
                <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Access & rails</div>
                <div className="h-px flex-1 bg-[var(--border)]" />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Supported countries</div>
                  <div className="mt-1 leading-relaxed text-[var(--muted)]">
                    They refer to <span className="font-semibold text-[var(--foreground)]">account access</span>.
                  </div>
                </div>
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                  <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Payment rails</div>
                  <div className="mt-1 leading-relaxed text-[var(--muted)]">
                    They depend on the <span className="font-semibold text-[var(--foreground)]">advertiser</span>.
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-sm leading-relaxed text-[var(--muted)]">
                You can trade <span className="font-semibold text-[var(--foreground)]">cross-border</span> as long as you can pay using the
                seller’s listed rail.
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            {Object.entries(SUPPORTED_P2P_COUNTRIES).map(([region, countries]) => (
              <details
                key={region}
                className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card-2)] p-4"
                style={{ clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)" }}
                open={region === "Africa"}
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-60"
                  aria-hidden
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 18% 20%, var(--ring) 0, transparent 55%), radial-gradient(circle at 86% 74%, var(--ring) 0, transparent 55%)",
                  }}
                />

                <summary className="relative cursor-pointer select-none list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                        <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                        <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
                      </span>
                      <h3 className="min-w-0 truncate text-sm font-extrabold tracking-tight text-[var(--foreground)]">{region}</h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">
                      {countries.length}
                    </span>
                  </div>
                </summary>
                <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {countries.map((c) => (
                    <li
                      key={c}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--foreground)] transition hover:bg-[var(--card-2)]"
                    >
                      {(() => {
                        const iso2 = countryNameToIso2(c);
                        if (!iso2) {
                          return (
                            <span className="inline-block h-3.5 w-5 rounded-sm border border-[var(--border)] bg-[var(--card-2)]" />
                          );
                        }
                        return (
                          <span
                            className={`fi fi-${iso2} inline-block h-3.5 w-5 rounded-sm border border-[var(--border)]`}
                            aria-label={c}
                            title={c}
                          />
                        );
                      })()}
                      <span className="font-medium">{c}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </div>

        <Suspense fallback={<div className="py-20 text-center text-[var(--muted)]">Loading P2P Market...</div>}>
          <P2PMarketplace />
        </Suspense>
      </main>
    </SiteChrome>
  );
}
