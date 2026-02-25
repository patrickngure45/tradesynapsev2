import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  try {
    const cookieStore = await cookies();
    const name = getSessionCookieName();
    const token = cookieStore.get(name)?.value ?? "";
    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (token && secret) {
      const verified = verifySessionToken({ token, secret });
      if (verified.ok) {
        redirect("/v2/wallet");
      }
    }
  } catch {
    // ignore
  }

  redirect("/v2");
}
