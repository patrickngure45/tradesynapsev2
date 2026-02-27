import { apiError } from "@/lib/api/errors";
import { requireAdminForApi } from "@/lib/auth/admin";
import { getSql } from "@/lib/db";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";
import { runFullReconciliation } from "@/lib/exchange/reconciliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/exchange/admin/reconciliation
 *
 * Runs the full ledger reconciliation suite and returns the report.
 * Admin-key gated.
 */
export async function GET(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql, request);
  if (!admin.ok) return admin.response;

  try {
    const report = await retryOnceOnTransientDbError(async () => {
      return await runFullReconciliation(sql);
    });

    const status = report.ok ? 200 : 409;
    return Response.json({ reconciliation: report }, { status });
  } catch (e) {
    const resp = responseForDbError("reconciliation.run", e);
    if (resp) return resp;
    throw e;
  }
}
