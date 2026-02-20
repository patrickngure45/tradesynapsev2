/**
 * Pre-built email templates.
 *
 * Each returns { subject, text, html } suitable for sendMail().
 *
 * Branding is configurable via env vars:
 *   EMAIL_BRAND        — e.g. "Coinwaka"
 *   SUPPORT_EMAIL      — e.g. "support@coinwaka.com"
 *   EMAIL_FROM_NAME    — fallback brand display name
 */

const BRAND = (process.env.EMAIL_BRAND ?? process.env.EMAIL_FROM_NAME ?? "Coinwaka").trim() || "Coinwaka";
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL ?? "support@coinwaka.com").trim() || "support@coinwaka.com";
const SITE_URL_RAW = (process.env.NEXT_PUBLIC_BASE_URL ?? "").trim();
const SITE_ORIGIN = (() => {
  try {
    if (!SITE_URL_RAW) return "";
    return new URL(SITE_URL_RAW).origin;
  } catch {
    return "";
  }
})();

// Use a PNG/JPG logo URL for best compatibility (many clients block SVG).
const EMAIL_LOGO_URL = (process.env.EMAIL_LOGO_URL ?? "").trim();
const EMAIL_LOGO_ALT = (process.env.EMAIL_LOGO_ALT ?? BRAND).trim() || BRAND;
const EMAIL_LOGO_WIDTH = Math.max(60, Math.min(240, parseInt(process.env.EMAIL_LOGO_WIDTH ?? "120", 10) || 120));

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function wrap(opts: { bodyHtml: string; preheader: string }): string {
  const year = new Date().getFullYear();
  const preheader = escapeHtml(opts.preheader);

  const brandHeaderHtml = EMAIL_LOGO_URL
    ? `
      <div style="line-height:0;">
        <img src="${escapeHtml(EMAIL_LOGO_URL)}" width="${EMAIL_LOGO_WIDTH}" alt="${escapeHtml(EMAIL_LOGO_ALT)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
      </div>
      <div style="margin-top:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${escapeHtml(BRAND)}</div>
    `
    : `${escapeHtml(BRAND)}`;

  // NOTE: Use table layout for broad email client compatibility.
  // Avoid relying on gradients/dark backgrounds (often render oddly in clients/dark mode).
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${escapeHtml(BRAND)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${preheader}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:18px 24px;background-color:#4f46e5;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">
              ${brandHeaderHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
              ${opts.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;" align="center">
              <div>&copy; ${year} ${escapeHtml(BRAND)}.</div>
              ${SITE_ORIGIN ? `<div style="margin-top:6px;">Website: <a href="${escapeHtml(SITE_ORIGIN)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(SITE_ORIGIN)}</a></div>` : ""}
              <div style="margin-top:6px;">Support: <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(SUPPORT_EMAIL)}</a></div>
              <div style="margin-top:10px;color:#9ca3af;font-size:11px;">You’re receiving this email because an account action was requested for your email address.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(opts: { url: string; label: string }): string {
  const url = opts.url;
  const label = escapeHtml(opts.label);

  // Outlook-safe button
  return `
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
    <tr>
      <td bgcolor="#4f46e5" style="border-radius:10px;">
        <a href="${url}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ── Verification Email ──────────────────────────────────────────
export function verificationEmail(verifyUrl: string): { subject: string; text: string; html: string } {
  const subject = `Verify your email — ${BRAND}`;
  const text = `Verify your email address to finish setting up your ${BRAND} account:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, you can ignore this email.`;
  const html = wrap({
    preheader: `Verify your email to finish setting up your ${BRAND} account.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Verify your email</h2>
      <p style="margin:0 0 12px;">Thanks for signing up. Click the button below to verify your email address.</p>
      ${button({ url: verifyUrl, label: "Verify email" })}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 24 hours.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${escapeHtml(verifyUrl)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t create an account, you can ignore this email.</p>
    `,
  });
  return { subject, text, html };
}

// ── KYC Approved ────────────────────────────────────────────────
export function kycApprovedEmail(): { subject: string; text: string; html: string } {
  const subject = `KYC Verified — ${BRAND}`;
  const text = `Your identity has been verified. You now have Verified KYC status with increased withdrawal limits ($50,000/day).`;
  const html = wrap({
    preheader: `Your identity verification is approved.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Identity verified</h2>
      <p style="margin:0 0 8px;">Your identity documents have been reviewed and approved.</p>
      <p style="margin:0;">You now have <strong>Verified</strong> KYC status with a daily withdrawal limit of <strong>$50,000</strong>.</p>
    `,
  });
  return { subject, text, html };
}

// ── KYC Rejected ────────────────────────────────────────────────
export function kycRejectedEmail(reason: string): { subject: string; text: string; html: string } {
  const subject = `KYC Review Update — ${BRAND}`;
  const text = `Your identity document submission was not approved.\n\nReason: ${reason}\n\nPlease re-submit clearer documents from your account page.`;
  const html = wrap({
    preheader: `Your document submission needs an update.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Document review update</h2>
      <p style="margin:0 0 8px;">Your identity document submission was not approved.</p>
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:12px 12px;margin:16px 0;border-radius:8px;">
        <div style="font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${escapeHtml(reason)}</div>
      </div>
      <p style="margin:0;color:#374151;">Please re-submit clearer documents from your account page.</p>
    `,
  });
  return { subject, text, html };
}

// ── Withdrawal Completed ────────────────────────────────────────
export function withdrawalCompletedEmail(amount: string, symbol: string, txHash: string): { subject: string; text: string; html: string } {
  const subject = `Withdrawal Confirmed — ${BRAND}`;
  const text = `Your withdrawal of ${amount} ${symbol} has been confirmed on-chain.\n\nTransaction: ${txHash}`;
  const html = wrap({
    preheader: `Your withdrawal is confirmed on-chain.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Withdrawal confirmed</h2>
      <p style="margin:0 0 12px;">Your withdrawal has been confirmed on-chain:</p>
      <div style="background-color:#f9fafb;border:1px solid #e5e7eb;padding:14px;border-radius:10px;margin:12px 0;">
        <div style="font-size:20px;font-weight:800;color:#111827;">${escapeHtml(amount)} ${escapeHtml(symbol)}</div>
        <div style="margin-top:6px;font-size:12px;color:#6b7280;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">TX: ${escapeHtml(txHash)}</div>
      </div>
    `,
  });
  return { subject, text, html };
}

// ── Security Alert (login, 2FA change, etc.) ────────────────────
export function securityAlertEmail(action: string, ip: string, timestamp: string): { subject: string; text: string; html: string } {
  const subject = `Security Alert — ${BRAND}`;
  const text = `Security event on your account:\n\nAction: ${action}\nIP: ${ip}\nTime: ${timestamp}\n\nIf this wasn't you, change your password immediately.`;
  const html = wrap({
    preheader: `Security activity detected on your account.`,
    bodyHtml: `
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Security alert</h2>
      <p style="margin:0 0 12px;">A security event was detected on your account:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Action</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${escapeHtml(action)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">IP</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${escapeHtml(ip)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Time</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${escapeHtml(timestamp)}</td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#b91c1c;font-size:13px;"><strong>If this wasn’t you</strong>, change your password immediately and enable 2FA.</p>
    `,
  });
  return { subject, text, html };
}
