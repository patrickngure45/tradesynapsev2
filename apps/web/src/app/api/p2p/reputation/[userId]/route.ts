import { apiError } from "@/lib/api/errors";
import { getSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  props: { params: Promise<{ userId: string }> },
) {
  const sql = getSql();
  try {
    const params = await props.params;
    const userId = params.userId;
    if (!userId) return apiError("invalid_input", { status: 400 });

    const counts = await sql<
      { positive: number; negative: number; total: number }[]
    >`
      SELECT
        sum(CASE WHEN rating = 'positive' THEN 1 ELSE 0 END)::int AS positive,
        sum(CASE WHEN rating = 'negative' THEN 1 ELSE 0 END)::int AS negative,
        count(*)::int AS total
      FROM p2p_feedback
      WHERE to_user_id = ${userId}::uuid
    `;

    const recent = await sql<
      { rating: string; comment: string | null; created_at: string; order_id: string }[]
    >`
      SELECT rating, comment, created_at::text, order_id::text
      FROM p2p_feedback
      WHERE to_user_id = ${userId}::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return Response.json({
      user_id: userId,
      counts: counts[0] ?? { positive: 0, negative: 0, total: 0 },
      recent,
    });
  } catch (e) {
    console.error("[GET /api/p2p/reputation/:userId] error", e);
    return apiError("internal_error");
  }
}
