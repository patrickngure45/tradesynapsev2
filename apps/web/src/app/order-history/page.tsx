import { SiteChrome } from "@/components/SiteChrome";
import { OrderHistoryClient } from "./OrderHistoryClient";
import { BRAND_NAME } from "@/lib/seo/brand";

export const metadata = { title: `Order History — ${BRAND_NAME}` };

export default function OrderHistoryPage() {
  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-6">
        <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
            style={{
              background:
                "radial-gradient(700px 260px at 20% 0%, color-mix(in oklab, var(--accent) 16%, transparent) 0%, transparent 60%), radial-gradient(440px 220px at 90% 10%, color-mix(in oklab, var(--accent-2) 10%, transparent) 0%, transparent 55%)",
            }}
          />
          <div className="relative p-6">
            <div className="flex items-center gap-3">
              <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
                <span className="absolute inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                <span className="absolute inline-flex h-4.5 w-4.5 rounded-full bg-[var(--ring)]" />
              </span>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[var(--muted)]">Trading</div>
              <div className="h-px flex-1 bg-[var(--border)]" />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">Order history</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">All spot orders with fill details.</p>
          </div>
        </section>

        <OrderHistoryClient />
      </main>
    </SiteChrome>
  );
}
