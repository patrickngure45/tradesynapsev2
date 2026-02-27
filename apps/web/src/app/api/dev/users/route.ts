import { z } from "zod";

import { getSql } from "@/lib/db";
import { apiError, apiZodError } from "@/lib/api/errors";
import { responseForDbError, retryOnceOnTransientDbError } from "@/lib/dbTransient";

const createUserSchema = z.object({
  status: z.enum(["active", "restricted", "banned"]).optional().default("active"),
  kyc_level: z.enum(["none", "basic", "full"]).optional().default("none"),
  country: z.string().min(2).max(2).optional(),
});

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return apiError("not_found");
  const sql = getSql();
  const json = await request.json().catch(() => ({}));
  let input: z.infer<typeof createUserSchema>;
  try {
    input = createUserSchema.parse(json);
  } catch (e) {
    return apiZodError(e) ?? apiError("invalid_input");
  }

  try {
    const rows = await sql<{
      id: string;
      created_at: string;
      status: string;
      kyc_level: string;
      country: string | null;
    }[]>`
      INSERT INTO app_user (status, kyc_level, country)
      VALUES (${input.status}, ${input.kyc_level}, ${input.country ?? null})
      RETURNING id, created_at, status, kyc_level, country
    `;

    return Response.json({ user: rows[0] }, { status: 201 });
  } catch (e) {
    const resp = responseForDbError("dev.users.create", e);
    if (resp) return resp;
    throw e;
  }
}

export async function GET() {
  if (process.env.NODE_ENV === "production") return apiError("not_found");
  const sql = getSql();

  try {
    const users = await retryOnceOnTransientDbError(async () => {
      return await sql<{
        id: string;
        created_at: string;
        status: string;
        kyc_level: string;
        country: string | null;
      }[]>`
        SELECT id, created_at, status, kyc_level, country
        FROM app_user
        ORDER BY created_at DESC
        LIMIT 50
      `;
    });

    return Response.json({ users });
  } catch (e) {
    const resp = responseForDbError("dev.users.list", e);
    if (resp) return resp;
    throw e;
  }
}
