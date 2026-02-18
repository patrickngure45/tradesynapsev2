/** Login – centered form skeleton */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 lg:py-14">
      <div className="grid items-stretch gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_90%,transparent)] p-7 shadow-[var(--shadow)]">
          <div className="h-10 w-44 animate-pulse rounded-xl bg-[var(--card-2)]" />
          <div className="mt-6 h-9 w-72 max-w-full animate-pulse rounded-xl bg-[var(--card-2)]" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-[var(--card-2)]" />
          <div className="mt-6 flex flex-wrap gap-2">
            <div className="h-7 w-28 animate-pulse rounded-full bg-[var(--card-2)]" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-[var(--card-2)]" />
            <div className="h-7 w-24 animate-pulse rounded-full bg-[var(--card-2)]" />
          </div>
          <div className="mt-6 grid gap-3">
            <div className="h-16 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
            <div className="h-16 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
            <div className="h-16 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-7 shadow-[var(--shadow)]">
          <div className="h-4 w-20 animate-pulse rounded bg-[var(--card-2)]" />
          <div className="mt-2 h-6 w-64 max-w-full animate-pulse rounded bg-[var(--card-2)]" />
          <div className="mt-8 space-y-4">
            <div className="h-12 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
            <div className="h-12 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
            <div className="h-12 w-full animate-pulse rounded-2xl bg-[var(--card-2)]" />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <div className="h-7 w-24 animate-pulse rounded-full bg-[var(--card-2)]" />
            <div className="h-7 w-28 animate-pulse rounded-full bg-[var(--card-2)]" />
            <div className="h-7 w-20 animate-pulse rounded-full bg-[var(--card-2)]" />
          </div>
        </div>
      </div>
    </main>
  );
}
