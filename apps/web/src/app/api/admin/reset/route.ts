import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";
import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";
import { apiError } from "@/lib/api/errors";
import { responseForDbError } from "@/lib/dbTransient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = z.object({
  confirm: z.literal("RESET_EVERYTHING"),
  reset_assets: z.boolean().optional().default(true),
});

function requireResetSecret(req: NextRequest): string | null {
  // Always require a confirm phrase. In production, also require a secret.
  if (process.env.NODE_ENV !== "production") {
    const configured = process.env.ADMIN_RESET_SECRET ?? process.env.RESET_SECRET;
    if (!configured) return null;
    const provided = req.headers.get("x-reset-secret") ?? req.nextUrl.searchParams.get("secret");
    if (!provided || provided !== configured) return "reset_unauthorized";
    return null;
  }

  const configured = process.env.ADMIN_RESET_SECRET ?? process.env.RESET_SECRET;
  if (!configured) return "reset_secret_not_configured";
  const provided = req.headers.get("x-reset-secret") ?? req.nextUrl.searchParams.get("secret");
  if (!provided || provided !== configured) return "reset_unauthorized";
  return null;
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const sql = getSql();

  const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];

  const admin = await requireAdminForApi(sql, req);
  if (!admin.ok) return admin.response;

  const secretErr = requireResetSecret(req);
  if (secretErr) {
    const status = secretErr === "reset_unauthorized" ? 401 : 500;
    return apiError(secretErr, { status });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return apiError("invalid_input", { status: 400 });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    steps.splice(0, steps.length);

    try {
      const result = await sql.begin(async (tx) => {
        const txSql = tx as unknown as typeof sql;

        // Help fail fast on lock contention (we retry deadlocks below).
        try {
          await txSql`SET LOCAL lock_timeout = '5s'`;
        } catch {
          // ignore if unsupported
        }

      // NOTE: we intentionally keep app_user intact (logins/admin preserved).
      // Everything below is “state” (balances, orders, ads, notifications, etc.).

      const run = async (step: string, fn: () => Promise<void>) => {
        try {
          await fn();
          steps.push({ step, ok: true });
        } catch (e) {
          steps.push({ step, ok: false, detail: e instanceof Error ? e.message : String(e) });
          throw e;
        }
      };

      if (parsed.data.reset_assets) {
        await run("truncate:assets", async () => {
          // Truncate assets early, cascading to dependent trading/p2p tables.
          await txSql`DO $$ BEGIN
            IF to_regclass('ex_asset') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_asset RESTART IDENTITY CASCADE'; END IF;
          END $$;`;
        });
      }

      await run("truncate:p2p", async () => {
        await txSql`DO $$ BEGIN
          IF to_regclass('p2p_chat_message') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_chat_message RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('p2p_feedback') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_feedback RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('p2p_dispute') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_dispute RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('p2p_order') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_order RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('p2p_ad') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_ad RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('p2p_payment_method') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE p2p_payment_method RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:notifications", async () => {
        await txSql`DO $$ BEGIN
          IF to_regclass('ex_notification') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_notification RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:outbox+signals", async () => {
        await txSql`DO $$ BEGIN
          IF to_regclass('app_outbox_event') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE app_outbox_event RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('app_signal') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE app_signal RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:bots", async () => {
        // Optional tables in some environments.
        await txSql`DO $$ BEGIN IF to_regclass('trading_bot_execution') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE trading_bot_execution RESTART IDENTITY CASCADE'; END IF; END $$;`;
      });

      await run("truncate:legacy", async () => {
        // Legacy MVP tables (safe to clear; keeps users).
        await txSql`DO $$ BEGIN
          IF to_regclass('message') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE message RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('trade_state_transition') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE trade_state_transition RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('trade') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE trade RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('dispute_decision') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE dispute_decision RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('dispute') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE dispute RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('risk_assessment') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE risk_assessment RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('evidence_object') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE evidence_object RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('onchain_tx') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE onchain_tx RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('market_snapshot') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE market_snapshot RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('counterparty_profile') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE counterparty_profile RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('wallet') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE wallet RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:connections+copytrade+arb", async () => {
        await txSql`DO $$ BEGIN
          IF to_regclass('user_exchange_connection') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE user_exchange_connection RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('copy_trading_subscription') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE copy_trading_subscription RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('copy_trading_leader') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE copy_trading_leader RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('arb_price_snapshot') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE arb_price_snapshot RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:compliance+email+rate", async () => {
        await txSql`DO $$ BEGIN
          IF to_regclass('email_verification_token') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE email_verification_token RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('kyc_submission') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE kyc_submission RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('rate_limit_bucket') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE rate_limit_bucket RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:audit", async () => {
        await txSql`DO $$ BEGIN IF to_regclass('audit_log') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE audit_log RESTART IDENTITY CASCADE'; END IF; END $$;`;
      });

      await run("truncate:exchange-core", async () => {
        // Truncate in one statement to satisfy FK dependencies.
        await txSql`DO $$ BEGIN
          IF to_regclass('ex_chain_tx') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_chain_tx RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_chain_block') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_chain_block RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_chain_deposit_event') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_chain_deposit_event RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_chain_deposit_cursor') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_chain_deposit_cursor RESTART IDENTITY CASCADE'; END IF;

          IF to_regclass('ex_withdrawal_request') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_withdrawal_request RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_withdrawal_allowlist') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_withdrawal_allowlist RESTART IDENTITY CASCADE'; END IF;

          IF to_regclass('ex_execution') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_execution RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_order') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_order RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_market') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_market RESTART IDENTITY CASCADE'; END IF;

          IF to_regclass('ex_hold') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_hold RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_journal_line') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_journal_line RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_journal_entry') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_journal_entry RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_ledger_account') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_ledger_account RESTART IDENTITY CASCADE'; END IF;
          IF to_regclass('ex_deposit_address') IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ex_deposit_address RESTART IDENTITY CASCADE'; END IF;
        END $$;`;
      });

      await run("truncate:fx", async () => {
        await txSql`DO $$ BEGIN IF to_regclass('fx_reference_rate') IS NOT NULL THEN TRUNCATE TABLE fx_reference_rate RESTART IDENTITY; END IF; END $$;`;
      });

      return { ok: true as const, admin_user_id: admin.userId, steps };
      });

      return NextResponse.json({
        ...result,
        attempt,
        took_ms: Date.now() - startMs,
        note: "Users preserved; all balances/orders/ads/notifications/outbox/assets cleared.",
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const isDeadlock = /deadlock detected/i.test(message) || (typeof (e as any)?.code === "string" && (e as any).code === "40P01");

      if (isDeadlock && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 350 * attempt));
        continue;
      }

      const resp = responseForDbError("admin.reset", e);
      if (resp) return resp;

      return NextResponse.json(
        {
          ok: false,
          attempt,
          error: message,
          steps,
          took_ms: Date.now() - startMs,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "reset_failed", steps, took_ms: Date.now() - startMs },
    { status: 500 },
  );
}
