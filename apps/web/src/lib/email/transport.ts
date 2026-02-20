/**
 * Email transport abstraction.
 *
 * - If SMTP_HOST is set, uses nodemailer SMTP transport with retry logic.
 * - Otherwise, logs to console (demo mode) — the verify URL
 *   is still returned in-band for dev convenience.
 *
 * Env vars:
 *   SMTP_HOST          — e.g. smtp.resend.com, smtp.sendgrid.net
 *   SMTP_PORT          — default 465
 *   SMTP_USER          — SMTP username / API key name
 *   SMTP_PASS          — SMTP password / API key
 *   EMAIL_FROM         — sender address, default "noreply@citadel.exchange"
 *   EMAIL_FROM_NAME    — display name, default "Citadel Exchange"
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// ── Config ──────────────────────────────────────────────────────
const SMTP_HOST = process.env.SMTP_HOST ?? "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT ?? "465", 10);
const SMTP_USER = process.env.SMTP_USER ?? "";
const SMTP_PASS = process.env.SMTP_PASS ?? "";
const SMTP_SECURE_ENV = (process.env.SMTP_SECURE ?? "").trim().toLowerCase();
const SMTP_SECURE = SMTP_SECURE_ENV
  ? SMTP_SECURE_ENV === "1" || SMTP_SECURE_ENV === "true" || SMTP_SECURE_ENV === "yes"
  : SMTP_PORT === 465;

const SMTP_CONNECTION_TIMEOUT_MS = parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS ?? "20000", 10);
const SMTP_GREETING_TIMEOUT_MS = parseInt(process.env.SMTP_GREETING_TIMEOUT_MS ?? "20000", 10);
const SMTP_SOCKET_TIMEOUT_MS = parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS ?? "45000", 10);
const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@coinwaka.com";
const EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME ?? "Coinwaka";

const fromAddress = `"${EMAIL_FROM_NAME}" <${EMAIL_FROM}>`;

const isConfigured = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

export function emailConfigSummary(): {
  configured: boolean;
  smtp_host_configured: boolean;
  smtp_user_configured: boolean;
  smtp_pass_configured: boolean;
  from: string;
  from_name: string;
} {
  return {
    configured: isConfigured,
    smtp_host_configured: Boolean(SMTP_HOST),
    smtp_user_configured: Boolean(SMTP_USER),
    smtp_pass_configured: Boolean(SMTP_PASS),
    from: EMAIL_FROM,
    from_name: EMAIL_FROM_NAME,
  };
}

// ── Retry config ────────────────────────────────────────────────
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Singleton transporter ───────────────────────────────────────
let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!isConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      // For STARTTLS ports (e.g. 587), require TLS upgrade.
      ...(SMTP_SECURE ? {} : { requireTLS: true }),
      tls: {
        servername: SMTP_HOST,
        minVersion: "TLSv1.2",
      },
      pool: true,
      maxConnections: 3,
      connectionTimeout: Number.isFinite(SMTP_CONNECTION_TIMEOUT_MS) ? SMTP_CONNECTION_TIMEOUT_MS : 20_000,
      greetingTimeout: Number.isFinite(SMTP_GREETING_TIMEOUT_MS) ? SMTP_GREETING_TIMEOUT_MS : 20_000,
      socketTimeout: Number.isFinite(SMTP_SOCKET_TIMEOUT_MS) ? SMTP_SOCKET_TIMEOUT_MS : 45_000,
    });
  }
  return transporter;
}

// ── Public API ──────────────────────────────────────────────────
export type SendMailOpts = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/**
 * Send an email with automatic retry (up to {@link MAX_RETRIES} retries
 * with exponential backoff).
 *
 * Returns `{ sent: true }` on real send, `{ sent: false, demo: true }` in demo mode.
 * Throws on persistent failure after exhausting retries.
 */
export async function sendMail(
  opts: SendMailOpts,
): Promise<{ sent: boolean; demo: boolean; messageId?: string }> {
  const t = getTransporter();
  if (!t) {
    // Demo mode — log to console
    console.log(
      `[email:demo] To: ${opts.to} | Subject: ${opts.subject}\n${opts.text}`,
    );
    return { sent: false, demo: true };
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const info = await t.sendMail({
        from: fromAddress,
        to: opts.to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
      });
      return { sent: true, demo: false, messageId: info.messageId };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
        console.error(
          `[email] Send attempt ${attempt + 1} failed for ${opts.to}, retrying in ${backoff}ms:`,
          err instanceof Error ? err.message : err,
        );
        await sleep(backoff);
      }
    }
  }

  // All retries exhausted — log and rethrow
  console.error(
    `[email] All ${MAX_RETRIES + 1} attempts failed for ${opts.to}:`,
    lastError instanceof Error ? lastError.message : lastError,
  );
  throw lastError;
}

/** Returns true when real SMTP is configured. */
export function isEmailConfigured(): boolean {
  return isConfigured;
}
