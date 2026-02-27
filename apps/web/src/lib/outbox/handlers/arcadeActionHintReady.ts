import type { Sql } from "postgres";

import { createNotification } from "@/lib/notifications";

export async function handleArcadeActionHintReady(
  sql: Sql,
  params: {
    userId: string;
    actionId: string;
    module: string;
  },
): Promise<void> {
  const module = String(params.module ?? "arcade").trim() || "arcade";

  await createNotification(sql as any, {
    userId: params.userId,
    type: "arcade_hint_ready",
    title: "Arcade hint ready",
    body: module === "time_vault" ? "Your Time Vault hint is available." : "A new Arcade hint is available.",
    metadata: {
      action_id: params.actionId,
      module,
      href: "/arcade",
    },
  });
}
