import { z } from "zod";

import { apiError, apiZodError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { maybeRephraseExplainFields, wantAiFromQueryParam } from "@/lib/explain/aiRephrase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  id: z.string().uuid(),
  ai: z.string().optional(),
});

function explain(status: string, row: { tx_hash: string | null; failure_reason: string | null }) {
  switch (status) {
    case "requested":
      return {
        state: "requested",
        summary: "Withdrawal request received.",
        blockers: ["Awaiting review/approval"],
        next_steps: ["Approve or reject", "Check allowlist / step-up requirements"],
      };
    case "needs_review":
      return {
        state: "needs_review",
        summary: "Withdrawal needs manual review.",
        blockers: ["Manual review required"],
        next_steps: ["Review risk context", "Approve or reject"],
      };
    case "approved":
      return {
        state: "approved",
        summary: "Withdrawal approved and queued for broadcast.",
        blockers: ["Broadcast pending"],
        next_steps: ["Broadcast transaction", "Ensure hot wallet has gas"],
      };
    case "broadcasted":
      return {
        state: "broadcasted",
        summary: "Withdrawal broadcasted to the chain.",
        blockers: [],
        next_steps: [row.tx_hash ? `Track tx: ${row.tx_hash}` : "Track the transaction"],
      };
    case "confirmed":
      return {
        state: "confirmed",
        summary: "Withdrawal confirmed.",
        blockers: [],
        next_steps: ["No action needed"],
      };
    case "rejected":
      return {
        state: "rejected",
        summary: "Withdrawal rejected.",
        blockers: ["Rejected"],
        next_steps: [row.failure_reason ? `Reason: ${row.failure_reason}` : "Document the rejection reason"],
      };
    case "failed":
      return {
        state: "failed",
        summary: "Withdrawal failed.",
        blockers: ["On-chain or system failure"],
        next_steps: [row.failure_reason ? `Reason: ${row.failure_reason}` : "Investigate logs and retry if safe"],
      };
    case "canceled":
      return {
        state: "canceled",
        summary: "Withdrawal canceled.",
        blockers: [],
        next_steps: ["No action needed"],
      };
    default:
      return {
        state: status,
        summary: "Withdrawal status updated.",
        blockers: [],
        next_steps: ["Check withdrawal details"],
      };
  }
}

/**
 * GET /api/admin/explain/withdrawal?id=<uuid>[&ai=1]
 */
export async function GET(request: Request) {
  const sql = getSql();

  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const url = new URL(request.url);
    let q: z.infer<typeof querySchema>;
    try {
      q = querySchema.parse({
        id: url.searchParams.get("id") ?? "",
        ai: url.searchParams.get("ai") ?? undefined,
      });
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    const row = await retryOnceOnTransientDbError(async () => {
      const rows = await sql<
        {
          id: string;
          status: string;
          chain: string;
          symbol: string;
          amount: string;
          destination_address: string;
          tx_hash: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT
          w.id::text,
          w.status,
          a.chain,
          a.symbol,
          w.amount::text,
          w.destination_address,
          w.tx_hash,
          w.failure_reason,
          w.created_at,
          w.updated_at
        FROM ex_withdrawal_request w
        JOIN ex_asset a ON a.id = w.asset_id
        WHERE w.id = ${q.id}::uuid
        LIMIT 1
      `;
      return rows[0] ?? null;
    });

    if (!row) return apiError("not_found");

    const ex = explain(row.status, { tx_hash: row.tx_hash, failure_reason: row.failure_reason });

    const ai = await maybeRephraseExplainFields({
      sql,
      actingUserId: admin.userId,
      wantAi: wantAiFromQueryParam(q.ai ?? null),
      kind: "withdrawal",
      fields: {
        summary: ex.summary,
        blockers: ex.blockers,
        next_steps: ex.next_steps,
      },
      headers: request.headers,
      context: {
        status: row.status,
        chain: row.chain,
        symbol: row.symbol,
      },
    });

    return Response.json({
      ok: true,
      kind: "withdrawal",
      id: row.id,
      status: row.status,
      asset: { chain: row.chain, symbol: row.symbol },
      amount: row.amount,
      destination_address: row.destination_address,
      tx_hash: row.tx_hash,
      created_at: row.created_at,
      updated_at: row.updated_at,
      ...ex,
      ...(ai ?? {}),
    });
  } catch (e) {
    const resp = responseForDbError("admin.explain.withdrawal", e);
    if (resp) return resp;
    return apiError("internal_error");
  }
}
