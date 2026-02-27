import { cookies } from "next/headers";

import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { ConnectionsClient } from "@/app/connections/ConnectionsClient";
import { getSessionCookieName, verifySessionToken } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

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
  } catch {
    // ignore
  }

  return (
    <main className="space-y-4">
      <header className="space-y-2">
        <div className="text-[11px] font-bold uppercase tracking-widest text-[var(--v2-muted)]">Integrations</div>
        <h1 className="text-2xl font-extrabold tracking-tight">Connections</h1>
        <p className="text-sm text-[var(--v2-muted)]">Manage API keys and exchange connections.</p>
      </header>

      <V2Card>
        <V2CardHeader title="API connections" subtitle="Keys stay server-side." />
        <V2CardBody>
          <ConnectionsClient userId={userId} />
        </V2CardBody>
      </V2Card>
    </main>
  );
}
