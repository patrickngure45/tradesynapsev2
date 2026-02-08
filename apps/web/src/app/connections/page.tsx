import type { Metadata } from "next";
import { cookies } from "next/headers";

import { SiteChrome } from "@/components/SiteChrome";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";
import { ConnectionsClient } from "./ConnectionsClient";

export const metadata: Metadata = { title: "API Connections" };

export default async function ConnectionsPage() {
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const name = getSessionCookieName();
    const token = cookieStore.get(name)?.value ?? "";
    const secret = process.env.PROOFPACK_SESSION_SECRET ?? "";
    if (token && secret) {
      const verified = verifySessionToken({ token, secret });
      if (verified.ok) userId = verified.payload.uid;
    }
  } catch { /* no session */ }

  return (
    <SiteChrome>
      <main className="mx-auto w-full max-w-4xl px-6 py-8">
        <ConnectionsClient userId={userId} />
      </main>
    </SiteChrome>
  );
}
