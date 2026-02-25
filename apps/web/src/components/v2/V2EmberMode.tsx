"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";

function shouldEnableEmber(pathname: string): boolean {
  const p = String(pathname || "");

  // Keep “money movement” areas hot (wealth → waka). Keep social/ops calmer.
  return (
    p.startsWith("/v2/trade") ||
    p.startsWith("/v2/wallet") ||
    p.startsWith("/v2/earn") ||
    p.startsWith("/v2/convert")
  );
}

export function V2EmberMode() {
  const pathname = usePathname() ?? "";
  const enabled = useMemo(() => shouldEnableEmber(pathname), [pathname]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    if (enabled) {
      root.setAttribute("data-v2-ember", "1");
    } else {
      root.removeAttribute("data-v2-ember");
    }

    return () => {
      // Clean up so non-v2 pages don't inherit the background.
      root.removeAttribute("data-v2-ember");
    };
  }, [enabled]);

  return null;
}
