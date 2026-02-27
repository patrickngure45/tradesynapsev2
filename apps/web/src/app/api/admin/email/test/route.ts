import { NextResponse } from "next/server";

import { getSql } from "@/lib/db";
import { requireAdminForApi } from "@/lib/auth/admin";
import { requireAdminKey } from "@/lib/auth/keys";
import { apiError } from "@/lib/api/errors";
import { emailConfigSummary } from "@/lib/email/transport";
import { sendMail } from "@/lib/email/transport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeEmail(v: string | null): string {
  return String(v ?? "").trim().toLowerCase();
}

async function handle(request: Request) {
  const sql = getSql();
  // Auth options:
  // - If the caller provides x-admin-key, enforce it (for deterministic curl/ops usage).
  // - Otherwise, require a logged-in admin session (browser).
  const providedAdminKey = (request.headers.get("x-admin-key") ?? "").trim();
  if (providedAdminKey) {
    const key = requireAdminKey(request);
    if (!key.ok) return apiError(key.error);
  } else {
    const admin = await requireAdminForApi(sql, request);
    if (!admin.ok) return admin.response;
  }

  const url = new URL(request.url);
  const toFromQuery = normalizeEmail(url.searchParams.get("to"));

  let to = toFromQuery;
  if (!to) {
    const body = await request.json().catch(() => ({} as any));
    to = normalizeEmail(body?.to ?? "");
  }

  if (!to || !to.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "missing_to", hint: "Call /api/admin/email/test?to=you@example.com" },
      { status: 400 },
    );
  }

  const cfg = emailConfigSummary();
  const attemptedTransport = cfg.resend_api_configured ? "resend_api" : (cfg.smtp_host_configured && cfg.smtp_user_configured && cfg.smtp_pass_configured ? "smtp" : "demo");

  try {
    const result = await sendMail({
      to,
      subject: "Coinwaka test email",
      text: "This is a test email from Coinwaka. If you received this, email sending is configured correctly.",
      html: "<p>This is a <strong>test email</strong> from Coinwaka.</p><p>If you received this, email sending is configured correctly.</p>",
    });

    return NextResponse.json({
      ok: true,
      to,
      used_transport: result.demo ? "demo" : attemptedTransport,
      resend_api_configured: cfg.resend_api_configured,
      smtp_configured: cfg.smtp_host_configured && cfg.smtp_user_configured && cfg.smtp_pass_configured,
      sent: result.sent,
      demo: result.demo,
      messageId: result.messageId ?? null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: "email_send_failed",
        message,
        attempted_transport: attemptedTransport,
        resend_api_configured: cfg.resend_api_configured,
        smtp_configured: cfg.smtp_host_configured && cfg.smtp_user_configured && cfg.smtp_pass_configured,
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
