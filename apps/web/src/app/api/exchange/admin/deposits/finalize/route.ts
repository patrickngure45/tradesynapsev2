import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";
import { apiError } from "@/lib/api/errors";
import { retryOnceOnTransientDbError, responseForDbError } from "@/lib/dbTransient";
import { finalizePendingBscDeposits } from "@/lib/blockchain/depositIngest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

export async function POST(request: Request) {
  const sql = getSql();
  const admin = await requireAdminForApi(sql as any, request);
  if (!admin.ok) return admin.response;

  try {
    const body = await request.json().catch(() => ({} as any));
    const confirmations = clampInt(Number((body as any)?.confirmations ?? 2), 0, 200);
    const max = clampInt(Number((body as any)?.max ?? 250), 1, 2000);
    const maxMs = clampInt(Number((body as any)?.max_ms ?? 15_000), 0, 60_000);

    const result = await retryOnceOnTransientDbError(() =>
      finalizePendingBscDeposits(sql as any, {
        confirmations,
        max,
        maxMs,
      }),
    );

    if (!result.ok) return NextResponse.json(result, { status: 500 });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const resp = responseForDbError("exchange.admin.deposits.finalize", e);
    if (resp) return resp;
    const message = e instanceof Error ? e.message : String(e);
    return apiError("internal_error", { details: { message } });
  }
}
