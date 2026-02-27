import type { Sql } from "postgres";

import { createNotification } from "@/lib/notifications";

export async function handleArcadeActionReady(
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
    type: "arcade_ready",
    title: "Arcade reveal ready",
    body: module === "daily_drop" ? "Your daily drop is ready to reveal." : "A new Arcade action is ready to reveal.",
    metadata: {
      action_id: params.actionId,
      module,
      href: "/arcade",
    },
  });
}
