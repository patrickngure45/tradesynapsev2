import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";
import { sendMail, isEmailConfigured } from "@/lib/email/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cronAuthed(request: Request): boolean {
  const expected = String(process.env.EXCHANGE_CRON_SECRET ?? process.env.CRON_SECRET ?? "").trim();
  if (!expected) return false;
  const url = new URL(request.url);
  const provided = String(request.headers.get("x-cron-secret") ?? url.searchParams.get("secret") ?? "").trim();
  return !!provided && provided === expected;
}

const querySchema = z.object({
  max: z
    .string()
    .optional()
    .transform((v) => (v == null ? 30 : Math.max(1, Math.min(200, Number(v) || 30)))),
  max_ms: z
    .string()
    .optional()
    .transform((v) => (v == null ? 20_000 : Math.max(2_000, Math.min(55_000, Number(v) || 20_000)))),
});

function nowIso() {
  return new Date().toISOString();
}

export async function POST(request: Request) {
  if (!cronAuthed(request)) return apiError("unauthorized", { status: 401 });

  const url = new URL(request.url);
  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse({
      max: url.searchParams.get("max") ?? undefined,
      max_ms: url.searchParams.get("max_ms") ?? undefined,
    });
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  const sql = getSql();
  const startMs = Date.now();

  if (!isEmailConfigured()) {
    return Response.json({ ok: true, skipped: true, reason: "email_not_configured" });
  }

  try {
    const result = await retryOnceOnTransientDbError(async () => {
      // Only one email worker at a time.
      await sql`SELECT pg_advisory_lock(hashtext('cron:email-notifications'))`;
      try {
        let processed = 0;
        let sent = 0;
        let failed = 0;

        while (processed < q.max && Date.now() - startMs < q.max_ms) {
          const row = await sql.begin(async (tx) => {
            const txSql = tx as any;

            const picked = await txSql<
              Array<{
                id: string;
                to_email: string;
                subject: string;
                text_body: string;
                html_body: string;
                attempts: number;
              }>
            >`
              SELECT id::text AS id, to_email, subject, text_body, html_body, attempts
              FROM ex_email_outbox
              WHERE status = 'pending'
              ORDER BY created_at ASC
              LIMIT 1
              FOR UPDATE SKIP LOCKED
            `;

            const r = picked[0];
            if (!r) return null;

            await txSql`
              UPDATE ex_email_outbox
              SET status = 'sending', locked_at = now(), locked_by = ${`cron:${nowIso()}`}, updated_at = now()
              WHERE id = ${r.id}::uuid
            `;

            return r;
          });

          if (!row) break;

          processed += 1;

          try {
            const info = await sendMail({
              to: row.to_email,
              subject: row.subject,
              text: row.text_body,
              html: row.html_body || undefined,
            });

            await sql`
              UPDATE ex_email_outbox
              SET
                status = 'sent',
                sent_at = now(),
                message_id = ${info.messageId ?? null},
                updated_at = now(),
                last_error = NULL
              WHERE id = ${row.id}::uuid
            `;

            sent += 1;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const nextAttempts = Math.max(0, Math.trunc(Number(row.attempts ?? 0))) + 1;
            const nextStatus = nextAttempts >= 3 ? "failed" : "pending";

            await sql`
              UPDATE ex_email_outbox
              SET
                status = ${nextStatus},
                attempts = ${nextAttempts},
                last_error = ${msg},
                updated_at = now()
              WHERE id = ${row.id}::uuid
            `;

            failed += 1;
          }
        }

        return { processed, sent, failed };
      } finally {
        await sql`SELECT pg_advisory_unlock(hashtext('cron:email-notifications'))`;
      }
    });

    await upsertServiceHeartbeat(sql as any, {
      service: "cron:email-notifications",
      status: "ok",
      details: { ...result, duration_ms: Date.now() - startMs },
    }).catch(() => void 0);

    return Response.json({ ok: true, ...result, took_ms: Date.now() - startMs });
  } catch (e) {
    await upsertServiceHeartbeat(sql as any, {
      service: "cron:email-notifications",
      status: "error",
      details: { error: e instanceof Error ? e.message : String(e), duration_ms: Date.now() - startMs },
    }).catch(() => void 0);

    const resp = responseForDbError("cron.email-notifications", e);
    if (resp) return resp;
    throw e;
  }
}

// Allow simple cron providers that only support GET.
export async function GET(request: Request) {
  return POST(request);
}
