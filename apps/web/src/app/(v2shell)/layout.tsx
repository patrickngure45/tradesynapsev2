import type { ReactNode } from "react";

import { MobileNav } from "@/components/v2/MobileNav";
import { ContextStrip } from "@/components/v2/ContextStrip";
import { V2EmberMode } from "@/components/v2/V2EmberMode";
import "../v2/v2.css";

export const dynamic = "force-dynamic";

export default function V2ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div data-ui="v2" className="min-h-dvh bg-[var(--v2-bg)] text-[var(--v2-text)]">
      <V2EmberMode />
      <div className="mx-auto w-full max-w-xl px-4 pb-24 pt-6 md:max-w-6xl md:pb-8 md:pl-28">
        <ContextStrip />
        {children}
      </div>
      <MobileNav basePath="/v2" />
    </div>
  );
}
