import type { Sql } from "postgres";

import { runConditionalOrdersOnce } from "@/lib/exchange/conditionalEvaluator";
import { randomUUID } from "node:crypto";
import { tryAcquireJobLock, releaseJobLock } from "@/lib/system/jobLock";

export async function handleExchangeConditionalEvaluate(
  sql: Sql,
  opts: {
    limit?: number;
  },
): Promise<void> {
  const holderId = randomUUID();
  const lockKey = "exchange:conditional-orders:evaluate";
  const lock = await tryAcquireJobLock(sql as any, { key: lockKey, holderId, ttlMs: 55_000 });
  if (!lock.acquired) return;

  try {
    await runConditionalOrdersOnce(sql as any, { limit: opts.limit ?? 50, serviceName: "exchange:conditional-orders" });
  } finally {
    await releaseJobLock(sql as any, { key: lockKey, holderId });
  }
}
