import { z } from "zod";

import { getSql } from "@/lib/db";
import { getActingUserId, requireActingUserIdInProd } from "@/lib/auth/party";
import { requireActiveUser } from "@/lib/auth/activeUser";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bscAddress = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/i, "Invalid address")
  .transform((s) => s.toLowerCase());

const createSchema = z.object({
  chain: z.literal("bsc").optional().default("bsc"),
  address: bscAddress,
  label: z.string().min(1).max(64).optional(),
});

export async function GET(request: Request) {
  const sql = getSql();

  const actingUserId = getActingUserId(request);
  const authErr = requireActingUserIdInProd(actingUserId);
  if (authErr) return apiError(authErr);
  if (!actingUserId) return apiError("missing_x_user_id");

  try {
    const activeErr = await retryOnceOnTransientDbError(() => requireActiveUser(sql, actingUserId));
    if (activeErr) return apiError(activeErr);

    const rows = await retryOnceOnTransientDbError(async () => {
      return await sql<
        {
          id: string;
          chain: string;
          address: string;
          label: string | null;
          status: string;
          created_at: string;
          updated_at: string;
        }[]
      >`
        SELECT id, chain, address, label, status, created_at, updated_at
        FROM ex_withdrawal_allowlist
        WHERE user_id = ${actingUserId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    });

    return Response.json({ user_id: actingUserId, addresses: rows });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.list", e);
    if (resp) return resp;
    throw e;
  }
}

export async function POST(request: Request) {
  // Dev-only for now. In prod, allowlist changes should be controlled by an admin workflow.
  if (process.env.NODE_ENV === "production") return apiError("not_found");

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

    const rows = await sql<
      {
        id: string;
        chain: string;
        address: string;
        label: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }[]
    >`
      INSERT INTO ex_withdrawal_allowlist (user_id, chain, address, label, status)
      VALUES (${actingUserId}, ${input.chain}, ${input.address}, ${input.label ?? null}, 'active')
      ON CONFLICT (user_id, chain, address) DO UPDATE
        SET label = COALESCE(EXCLUDED.label, ex_withdrawal_allowlist.label),
            status = 'active',
            updated_at = now()
      RETURNING id, chain, address, label, status, created_at, updated_at
    `;

    return Response.json({ address: rows[0] }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("exchange.withdrawals.allowlist.create", e);
    if (resp) return resp;
    throw e;
  }
}
