import { getActingUserId } from "@/lib/auth/party";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headerUserId = request.headers.get("x-user-id");
  const actingUserId = getActingUserId(request);

  return Response.json(
    {
      ok: true,
      headerUserId,
      actingUserId,
      hasCookie: Boolean(request.headers.get("cookie")),
    },
    { status: 200 },
  );
}
