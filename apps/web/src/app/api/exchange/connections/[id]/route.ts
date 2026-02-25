import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { enforceAccountSecurityRateLimit } from "@/lib/auth/securityRateLimit";
import { responseForDbError } from "@/lib/dbTransient";
import { decryptCredential } from "@/lib/auth/credentials";
import { getExchangeBalances } from "@/lib/exchange/externalApis";
import type { SupportedExchange } from "@/lib/exchange/externalApis";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — get balances from a connected exchange */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sql = getSql();
  const { id } = await params;
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await sql<{ exchange: string; api_key_enc: string; api_secret_enc: string; passphrase_enc: string | null }[]>`
      SELECT exchange, api_key_enc, api_secret_enc, passphrase_enc
      FROM user_exchange_connection
      WHERE id = ${id}::uuid AND user_id = ${actingUserId} AND status = 'active'
      LIMIT 1
    `;

    if (rows.length === 0) return apiError("not_found");

    const conn = rows[0]!;
    const creds = {
      apiKey: decryptCredential(conn.api_key_enc),
      apiSecret: decryptCredential(conn.api_secret_enc),
      passphrase: conn.passphrase_enc ? decryptCredential(conn.passphrase_enc) : undefined,
    };

    const balances = await getExchangeBalances(conn.exchange as SupportedExchange, creds);

    // Update last_checked_at
    await sql`
      UPDATE user_exchange_connection SET last_checked_at = now(), last_error = NULL WHERE id = ${id}::uuid
    `.catch((err) => { console.error("[connections] failed to update last_checked_at", err); });

    return Response.json({
      exchange: conn.exchange,
      balances,
      checked_at: new Date().toISOString(),
    });
  } catch (e) {
    // Update error status
    await sql`
      UPDATE user_exchange_connection SET last_error = ${(e as Error).message}, last_checked_at = now() WHERE id = ${id}::uuid
    `.catch((err) => { console.error("[connections] failed to update last_error", err); });

    const resp = responseForDbError("exchange.connections.balances", e);
    if (resp) return resp;

    return Response.json(
      { error: "exchange_api_error", message: (e as Error).message },
      { status: 502 },
    );
  }
}

/** DELETE — remove a connection */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sql = getSql();
  const { id } = await params;
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  const rl = await enforceAccountSecurityRateLimit({
    sql: sql as any,
    request,
    limiterName: "exchange.connections.delete",
    windowMs: 60_000,
    max: 16,
    userId: actingUserId,
  });
  if (rl) return rl;

  try {
    const rows = await sql<{ id: string }[]>`
      DELETE FROM user_exchange_connection
      WHERE id = ${id}::uuid AND user_id = ${actingUserId}
      RETURNING id
    `;

    if (rows.length === 0) return apiError("not_found");

    try {
      await writeAuditLog(sql, {
        actorId: actingUserId,
        actorType: "user",
        action: "exchange_connection.deleted",
        resourceType: "exchange_connection",
        resourceId: id,
        ...auditContextFromRequest(request),
      });
    } catch { /* audit failure must not block */ }

    return Response.json({ ok: true, deleted: id });
  } catch (e) {
    const resp = responseForDbError("exchange.connections.delete", e);
    if (resp) return resp;
    throw e;
  }
}
