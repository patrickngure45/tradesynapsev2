"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { v2ButtonClassName } from "@/components/v2/Button";
import { V2Card, V2CardBody, V2CardHeader } from "@/components/v2/Card";
import { V2Skeleton } from "@/components/v2/Skeleton";

export const dynamic = "force-dynamic";

type LastPair = { base: string; quote: string };

function safeParseLastPair(raw: string | null): LastPair | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const base = String(j?.base ?? "").trim().toUpperCase();
    const quote = String(j?.quote ?? "").trim().toUpperCase();
    if (!base || !quote) return null;
    return { base, quote };
  } catch {
    return null;
  }
}

export default function V2Index() {
  const router = useRouter();

  useEffect(() => {
    const last = safeParseLastPair(localStorage.getItem("cw:v2:lastPair"));
    if (last) {
      router.replace(`/v2/trade?base=${encodeURIComponent(last.base)}&quote=${encodeURIComponent(last.quote)}`);
      return;
    }
    router.replace("/v2/markets");
  }, [router]);

  return (
    <main className="space-y-4">
      <V2Card>
        <V2CardHeader title="Opening v2" subtitle="Routing to your last market" />
        <V2CardBody>
          <V2Skeleton className="h-14 w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Link href="/v2/markets" className={v2ButtonClassName({ variant: "secondary", fullWidth: true })}>
              Markets
            </Link>
            <Link href="/v2/trade" className={v2ButtonClassName({ variant: "primary", fullWidth: true })}>
              Trade
            </Link>
          </div>
        </V2CardBody>
      </V2Card>
    </main>
  );
}
