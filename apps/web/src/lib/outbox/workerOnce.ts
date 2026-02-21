import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import {
  ackOutbox,
  claimOutboxBatch,
  deadLetterOutbox,
  failOutbox,
  stringifyUnknownError,
  type OutboxRow,
} from "@/lib/outbox";
import { upsertServiceHeartbeat } from "@/lib/system/heartbeat";

import { handleCopyTradeExecution } from "@/lib/outbox/handlers/copyTradeExecution";
import { handleTradingBotExecution } from "@/lib/outbox/handlers/tradingBotExecution";
import { handleTradingBotUnwind } from "@/lib/outbox/handlers/tradingBotUnwind";
import { handleWithdrawalBroadcast } from "@/lib/outbox/handlers/exchangeWithdrawalBroadcast";
import { handleWithdrawalRequestedRiskSignal } from "@/lib/outbox/handlers/exchangeWithdrawalRisk";
import { handleArcadeActionReady } from "@/lib/outbox/handlers/arcadeActionReady";
import { handleArcadeActionHintReady } from "@/lib/outbox/handlers/arcadeActionHintReady";

function getPayload(ev: OutboxRow): Record<string, unknown> {
  if (ev.payload_json && typeof ev.payload_json === "object" && !Array.isArray(ev.payload_json)) {
    return ev.payload_json as Record<string, unknown>;
  }
  return {};
}

function nextBackoffMs(attempts: number): number {
  const exp = Math.min(16, Math.max(0, attempts));
  return Math.min(60_000, 1000 * 2 ** exp);
}

async function dispatch(sql: Sql, ev: OutboxRow): Promise<void> {
  const payload = getPayload(ev);

  switch (ev.topic) {
    case "arcade.action.hint_ready": {
      const userId = String(payload.user_id ?? payload.userId ?? "");
      const actionId = String(payload.action_id ?? payload.actionId ?? "");
      const module = String(payload.module ?? "");
      if (!userId || !actionId) return;
      await handleArcadeActionHintReady(sql as any, { userId, actionId, module });
      return;
    }

    case "arcade.action.ready": {
      const userId = String(payload.user_id ?? payload.userId ?? "");
      const actionId = String(payload.action_id ?? payload.actionId ?? "");
      const module = String(payload.module ?? "");
      if (!userId || !actionId) return;
      await handleArcadeActionReady(sql as any, { userId, actionId, module });
      return;
    }

    case "ex.withdrawal.requested": {
      const withdrawalId = String(payload.withdrawal_id ?? "");
      if (!withdrawalId) return;
      await handleWithdrawalRequestedRiskSignal(sql as any, { withdrawalId });
      return;
    }

    case "ex.withdrawal.approved": {
      const withdrawalId = String(payload.withdrawal_id ?? "");
      if (!withdrawalId) return;
      await handleWithdrawalBroadcast(sql as any, { withdrawalId });
      return;
    }

    case "ex.order.placed": {
      const order = payload.order as any;
      if (!order || typeof order !== "object") return;
      await handleCopyTradeExecution(sql as any, { order });
      return;
    }

    case "trading.bot.execute": {
      const executionId = String(payload.execution_id ?? "");
      if (!executionId) return;
      await handleTradingBotExecution(sql as any, { executionId });
      return;
    }

    case "trading.bot.unwind": {
      const executionId = String(payload.execution_id ?? "");
      if (!executionId) return;
      await handleTradingBotUnwind(sql as any, { executionId });
      return;
    }

    // Informational / fan-out topics today.
    case "ex.order.canceled":
    case "ex.withdrawal.rejected":
    case "ex.withdrawal.broadcasted":
    case "ex.withdrawal.confirmed":
    case "ex.withdrawal.failed":
    default:
      return;
  }
}

export type OutboxWorkerOnceResult = {
  ok: true;
  lockId: string;
  claimed: number;
  acked: number;
  failed: number;
  deadLettered: number;
  durationMs: number;
  maxMs: number;
  batchSize: number;
  maxBatches: number;
  topics: string[] | null;
};

export async function runOutboxWorkerOnce(
  sql: Sql,
  opts?: {
    batchSize?: number;
    maxBatches?: number;
    maxMs?: number;
    topics?: string[];
  },
): Promise<OutboxWorkerOnceResult> {
  const startedAt = Date.now();
  const lockId = randomUUID();

  const batchSize = Math.max(1, Math.min(100, Math.floor(opts?.batchSize ?? 25)));
  const maxBatches = Math.max(1, Math.min(25, Math.floor(opts?.maxBatches ?? 5)));
  const maxMs = Math.max(2_000, Math.min(55_000, Math.floor(opts?.maxMs ?? 25_000)));
  const topics = opts?.topics?.length ? opts.topics : null;

  let claimed = 0;
  let acked = 0;
  let failed = 0;
  let deadLettered = 0;

  const beat = async (details?: Record<string, unknown>) => {
    try {
      await upsertServiceHeartbeat(sql as any, {
        service: "outbox-worker",
        status: "ok",
        details: {
          lockId,
          once: true,
          batch: batchSize,
          maxBatches,
          maxMs,
          topics,
          ...(details ?? {}),
        },
      });
    } catch {
      // ignore
    }
  };

  await beat({ event: "start" });

  for (let i = 0; i < maxBatches; i += 1) {
    if (Date.now() - startedAt > maxMs) break;

    const events = await claimOutboxBatch(sql as any, {
      limit: batchSize,
      lockId,
      lockTtlSeconds: 30,
      topics: topics ?? undefined,
    });

    if (events.length === 0) break;
    claimed += events.length;

    for (const ev of events) {
      if (Date.now() - startedAt > maxMs) break;

      try {
        await dispatch(sql, ev);
        await ackOutbox(sql as any, { id: ev.id, lockId });
        acked += 1;
      } catch (e) {
        const errMsg = stringifyUnknownError(e);
        const attemptsNext = (ev.attempts ?? 0) + 1;

        // Keep API job safe: dead-letter after a small number of failures.
        const maxAttempts = Math.max(1, Math.min(25, Number.parseInt(process.env.OUTBOX_MAX_ATTEMPTS ?? "10", 10) || 10));
        if (attemptsNext >= maxAttempts) {
          await deadLetterOutbox(sql as any, { id: ev.id, lockId, error: e });
          deadLettered += 1;
          await beat({ event: "dead-letter", topic: ev.topic, err: errMsg });
          continue;
        }

        const backoffMs = nextBackoffMs(attemptsNext);
        await failOutbox(sql as any, {
          id: ev.id,
          lockId,
          error: e,
          nextVisibleAt: new Date(Date.now() + backoffMs),
        });
        failed += 1;
        await beat({ event: "fail", topic: ev.topic, err: errMsg, backoffMs });
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  await beat({ event: "stop", claimed, acked, failed, deadLettered, durationMs });

  return {
    ok: true,
    lockId,
    claimed,
    acked,
    failed,
    deadLettered,
    durationMs,
    maxMs,
    batchSize,
    maxBatches,
    topics,
  };
}
