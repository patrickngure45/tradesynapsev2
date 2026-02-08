import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";
import { encryptCredential, decryptCredential } from "@/lib/auth/credentials";
import { getExchangeBalances } from "@/lib/exchange/externalApis";
import type { SupportedExchange } from "@/lib/exchange/externalApis";
import { writeAuditLog, auditContextFromRequest } from "@/lib/auditLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  exchange: z.enum(["binance", "bybit", "okx"]),
  label: z.string().trim().min(1).max(100),
  api_key: z.string().trim().min(10).max(200),
  api_secret: z.string().trim().min(10).max(200),
  passphrase: z.string().trim().max(100).optional(),
});

/** GET — list user's exchange connections (no secrets returned) */
export async function GET(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const rows = await sql`
      SELECT id, exchange, label, permissions, status, last_checked_at, last_error, created_at
      FROM user_exchange_connection
      WHERE user_id = ${actingUserId}
      ORDER BY created_at DESC
    `;

    return Response.json({ connections: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.connections.list", e);
    if (resp) return resp;
    throw e;
  }
}

/** POST — add a new exchange API connection */
export async function POST(request: Request) {
  const sql = getSql();
  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await requireActiveUser(sql, actingUserId);
    if (activeErr) return apiError(activeErr);

    const body = await request.json().catch(() => ({}));
    let input: z.infer<typeof createSchema>;
    try {
      input = createSchema.parse(body);
    } catch (e) {
      return apiZodError(e) ?? apiError("invalid_input");
    }

    // Validate the credentials by attempting a balance query
    try {
      await getExchangeBalances(input.exchange as SupportedExchange, {
        apiKey: input.api_key,
        apiSecret: input.api_secret,
        passphrase: input.passphrase,
      });
    } catch (e) {
      return Response.json(
        { error: "invalid_credentials", message: `Could not authenticate with ${input.exchange}: ${(e as Error).message}` },
        { status: 400 },
      );
    }

    // Encrypt credentials before storage
    const apiKeyEnc = encryptCredential(input.api_key);
    const apiSecretEnc = encryptCredential(input.api_secret);
    const passphraseEnc = input.passphrase ? encryptCredential(input.passphrase) : null;

    const rows = await sql<{ id: string; created_at: string }[]>`
      INSERT INTO user_exchange_connection (user_id, exchange, label, api_key_enc, api_secret_enc, passphrase_enc, last_checked_at)
      VALUES (${actingUserId}, ${input.exchange}, ${input.label}, ${apiKeyEnc}, ${apiSecretEnc}, ${passphraseEnc}, now())
      RETURNING id, created_at
    `;

    try {
      await writeAuditLog(sql, {
        actorId: actingUserId,
        actorType: "user",
        action: "exchange_connection.created",
        resourceType: "exchange_connection",
        resourceId: rows[0]!.id,
        ...auditContextFromRequest(request),
        detail: { exchange: input.exchange, label: input.label },
      });
    } catch { /* audit failure must not block */ }

    return Response.json(
      { connection: { id: rows[0]!.id, exchange: input.exchange, label: input.label, status: "active", created_at: rows[0]!.created_at } },
      { status: 201 },
    );
  } catch (e) {
    const resp = responseForDbError("exchange.connections.create", e);
    if (resp) return resp;
    throw e;
  }
}
