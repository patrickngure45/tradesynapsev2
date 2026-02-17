import "dotenv/config";

import { randomUUID } from "node:crypto";

import { getSql } from "../src/lib/db";
import {
  ackOutbox,
  claimOutboxBatch,
  deadLetterOutbox,
  failOutbox,
  stringifyUnknownError,
  type OutboxRow,
} from "../src/lib/outbox";
import { handleWithdrawalRequestedRiskSignal } from "../src/lib/outbox/handlers/exchangeWithdrawalRisk";
import { handleWithdrawalBroadcast } from "../src/lib/outbox/handlers/exchangeWithdrawalBroadcast";
import { handleCopyTradeExecution } from "../src/lib/outbox/handlers/copyTradeExecution";
import { handleTradingBotExecution } from "../src/lib/outbox/handlers/tradingBotExecution";
import { handleTradingBotUnwind } from "../src/lib/outbox/handlers/tradingBotUnwind";
import { upsertServiceHeartbeat } from "../src/lib/system/heartbeat";

const MAX_ATTEMPTS = Math.max(1, Math.min(25, Number.parseInt(process.env.OUTBOX_MAX_ATTEMPTS ?? "10", 10) || 10));
const BATCH_SIZE = Math.max(1, Math.min(200, Number.parseInt(process.env.OUTBOX_BATCH ?? "25", 10) || 25));
const SLEEP_MS = Math.max(250, Math.min(10_000, Number.parseInt(process.env.OUTBOX_SLEEP_MS ?? "1000", 10) || 1000));

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextBackoffMs(attempts: number): number {
  // 1s, 2s, 4s, ... capped at 60s
  const exp = Math.min(16, Math.max(0, attempts));
  return Math.min(60_000, 1000 * 2 ** exp);
}

function getPayload(ev: OutboxRow): Record<string, unknown> {
  if (ev.payload_json && typeof ev.payload_json === "object" && !Array.isArray(ev.payload_json)) {
    return ev.payload_json as Record<string, unknown>;
  }
  return {};
}

async function dispatch(sql: ReturnType<typeof getSql>, ev: OutboxRow): Promise<void> {
  const payload = getPayload(ev);

  switch (ev.topic) {
    case "ex.withdrawal.requested": {
      const withdrawalId = String(payload.withdrawal_id ?? "");
      if (!withdrawalId) return;
      await handleWithdrawalRequestedRiskSignal(sql, { withdrawalId });
      return;
    }

    case "ex.withdrawal.approved": {
      const withdrawalId = String(payload.withdrawal_id ?? "");
      if (!withdrawalId) return;
      await handleWithdrawalBroadcast(sql, { withdrawalId });
      return;
    }

    case "ex.order.placed": {
      const order = payload.order as any;
      if (!order || typeof order !== "object") return;
      await handleCopyTradeExecution(sql, { order });
      return;
    }

    case "trading.bot.execute": {
      const executionId = String(payload.execution_id ?? "");
      if (!executionId) return;
      await handleTradingBotExecution(sql, { executionId });
      return;
    }

    case "trading.bot.unwind": {
      const executionId = String(payload.execution_id ?? "");
      if (!executionId) return;
      await handleTradingBotUnwind(sql, { executionId });
      return;
    }

    // These are informational / fan-out topics today.
    case "ex.order.canceled":
    case "ex.withdrawal.rejected":
    case "ex.withdrawal.broadcasted":
    case "ex.withdrawal.confirmed":
    case "ex.withdrawal.failed":
      return;

    default:
      return;
  }
}

async function main() {
  const once = process.env.OUTBOX_ONCE === "1";
  const lockId = randomUUID();
  const sql = getSql();

  let lastBeatAt = 0;
  const beat = async (details?: Record<string, unknown>) => {
    const now = Date.now();
    if (now - lastBeatAt < 30_000) return;
    lastBeatAt = now;
    try {
      await upsertServiceHeartbeat(sql, {
        service: "outbox-worker",
        status: "ok",
        details: {
          lockId,
          once,
          batch: BATCH_SIZE,
          sleep_ms: SLEEP_MS,
          ...(details ?? {}),
        },
      });
    } catch {
      // ignore
    }
  };

  console.log(`[outbox] worker start lockId=${lockId} once=${once} batch=${BATCH_SIZE}`);

  await beat({ event: "start" });

  for (;;) {
    await beat({ event: "loop" });
    const events = await claimOutboxBatch(sql, {
      limit: BATCH_SIZE,
      lockId,
      lockTtlSeconds: 30,
    });

    if (events.length === 0) {
      if (once) break;
      await sleep(SLEEP_MS);
      continue;
    }

    for (const ev of events) {
      try {
        await dispatch(sql, ev);
        await ackOutbox(sql, { id: ev.id, lockId });
      } catch (e) {
        const errMsg = stringifyUnknownError(e);
        const attemptsNext = (ev.attempts ?? 0) + 1;

        // Avoid permanent hot-looping on bad events.
        if (attemptsNext >= MAX_ATTEMPTS) {
          console.error(`[outbox] dead-letter id=${ev.id} topic=${ev.topic} err=${errMsg}`);
          await deadLetterOutbox(sql, { id: ev.id, lockId, error: e });
          await beat({ event: "dead-letter", topic: ev.topic, attempts: attemptsNext });
          continue;
        }

        const backoffMs = nextBackoffMs(attemptsNext);
        console.error(`[outbox] fail id=${ev.id} topic=${ev.topic} attempts=${attemptsNext} backoffMs=${backoffMs} err=${errMsg}`);

        await failOutbox(sql, {
          id: ev.id,
          lockId,
          error: e,
          nextVisibleAt: new Date(Date.now() + backoffMs),
        });

        await beat({ event: "fail", topic: ev.topic, attempts: attemptsNext, backoff_ms: backoffMs });
      }
    }

    if (once) break;
  }

  console.log("[outbox] worker done");
  await beat({ event: "stop" });
  await sql.end({ timeout: 5 });
}

main().catch((e) => {
  console.error("[outbox] fatal:", e);
  process.exit(1);
});
