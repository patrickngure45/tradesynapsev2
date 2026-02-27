
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getSessionCookieName } from "@/lib/auth/session";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev_only" }, { status: 404 });
  }

  const sql = getSql();
  // Prefer the admin user if present (dev convenience)
  const [user] = await sql`
    SELECT id, email
    FROM app_user
    ORDER BY (role = 'admin') DESC, created_at ASC
    LIMIT 1
  `;

  if (!user) {
    return NextResponse.json({ error: "no_users_found" }, { status: 404 });
  }

  const secret = process.env.PROOFPACK_SESSION_SECRET || "default_dev_secret";
  const token = createSessionToken({ userId: user.id, secret });
  const cookieName = getSessionCookieName();

  const res = NextResponse.redirect(new URL("/p2p", req.url));
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: false, // dev
  });

  return res;
}
