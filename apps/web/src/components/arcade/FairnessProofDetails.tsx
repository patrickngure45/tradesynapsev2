export function FairnessProofDetails(props: { audit: Record<string, any> | null | undefined }) {
  const audit = props.audit && typeof props.audit === "object" ? props.audit : null;
  if (!audit) return null;

  const rows: Array<{ k: string; v: unknown }> = [
    { k: "client_commit_hash", v: audit.client_commit_hash },
    { k: "server_commit_hash", v: audit.server_commit_hash },
    { k: "server_seed_b64", v: audit.server_seed_b64 },
    { k: "random_hash", v: audit.random_hash },
    { k: "roll", v: typeof audit.roll === "number" ? `${audit.roll} / ${audit.total ?? "?"}` : undefined },
    { k: "rarity_roll", v: typeof audit.rarity_roll === "number" ? `${audit.rarity_roll} / ${audit.rarity_total ?? "?"}` : undefined },
  ].filter((r) => typeof r.v === "string" ? r.v.length > 0 : r.v !== undefined && r.v !== null);

  if (rows.length === 0) return null;

  return (
    <details className="rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-4">
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-widest text-[var(--muted)]">Fairness proof</summary>
      <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
        {rows.map((r) => (
          <div key={r.k} className="break-words">
            {r.k}: <span className="font-mono text-[var(--foreground)]">{String(r.v)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
