/**
 * Pre-built email templates for Citadel Exchange.
 *
 * Each returns { subject, text, html } suitable for sendMail().
 */

const BRAND = "Citadel Exchange";
const SUPPORT_EMAIL = "support@citadel.exchange";

function wrap(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
  <div style="max-width:560px;margin:32px auto;background:#111;border:1px solid #222;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;letter-spacing:-0.02em">${BRAND}</h1>
    </div>
    <div style="padding:32px;color:#e5e5e5;font-size:14px;line-height:1.6">
      ${body}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #222;text-align:center;color:#666;font-size:11px">
      <p style="margin:0">&copy; ${new Date().getFullYear()} ${BRAND}. All rights reserved.</p>
      <p style="margin:4px 0 0">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#8b5cf6;text-decoration:none">${SUPPORT_EMAIL}</a></p>
    </div>
  </div>
</body>
</html>`;
}

function btn(url: string, label: string): string {
  return `<div style="text-align:center;margin:24px 0">
    <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:12px 32px;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:-0.01em">${label}</a>
  </div>`;
}

// ── Verification Email ──────────────────────────────────────────
export function verificationEmail(verifyUrl: string): { subject: string; text: string; html: string } {
  const subject = `Verify your email — ${BRAND}`;
  const text = `Verify your email address by visiting this link:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you didn't create an account, you can safely ignore this email.`;
  const html = wrap(`
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:600">Verify your email</h2>
    <p style="margin:0 0 8px">Thanks for signing up! Click the button below to verify your email address and unlock Basic KYC access.</p>
    ${btn(verifyUrl, "Verify Email Address")}
    <p style="margin:0;color:#888;font-size:12px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
  `);
  return { subject, text, html };
}

// ── KYC Approved ────────────────────────────────────────────────
export function kycApprovedEmail(): { subject: string; text: string; html: string } {
  const subject = `KYC Verified — ${BRAND}`;
  const text = `Your identity has been verified. You now have Verified KYC status with increased withdrawal limits ($50,000/day).`;
  const html = wrap(`
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:600">Identity Verified &#10003;</h2>
    <p style="margin:0 0 8px">Congratulations! Your identity documents have been reviewed and approved.</p>
    <p style="margin:0 0 8px">You now have <strong style="color:#22c55e">Verified</strong> KYC status with a daily withdrawal limit of <strong>$50,000</strong>.</p>
  `);
  return { subject, text, html };
}

// ── KYC Rejected ────────────────────────────────────────────────
export function kycRejectedEmail(reason: string): { subject: string; text: string; html: string } {
  const subject = `KYC Review Update — ${BRAND}`;
  const text = `Your identity document submission was not approved.\n\nReason: ${reason}\n\nPlease re-submit clearer documents from your account page.`;
  const html = wrap(`
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:600">Document Review Update</h2>
    <p style="margin:0 0 8px">Unfortunately, your identity document submission was not approved.</p>
    <div style="background:#1a1a1a;border-left:3px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:4px">
      <p style="margin:0;color:#fca5a5;font-size:13px"><strong>Reason:</strong> ${reason}</p>
    </div>
    <p style="margin:0 0 8px;color:#888">You can re-submit your documents from the Account page.</p>
  `);
  return { subject, text, html };
}

// ── Withdrawal Completed ────────────────────────────────────────
export function withdrawalCompletedEmail(amount: string, symbol: string, txHash: string): { subject: string; text: string; html: string } {
  const subject = `Withdrawal Confirmed — ${BRAND}`;
  const text = `Your withdrawal of ${amount} ${symbol} has been confirmed on-chain.\n\nTransaction: ${txHash}`;
  const html = wrap(`
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:600">Withdrawal Confirmed</h2>
    <p style="margin:0 0 8px">Your withdrawal has been confirmed on-chain:</p>
    <div style="background:#1a1a1a;padding:16px;border-radius:8px;margin:16px 0">
      <p style="margin:0 0 4px;font-size:20px;font-weight:600;color:#22c55e">${amount} ${symbol}</p>
      <p style="margin:0;font-size:11px;color:#888;word-break:break-all;font-family:monospace">TX: ${txHash}</p>
    </div>
  `);
  return { subject, text, html };
}

// ── Security Alert (login, 2FA change, etc.) ────────────────────
export function securityAlertEmail(action: string, ip: string, timestamp: string): { subject: string; text: string; html: string } {
  const subject = `Security Alert — ${BRAND}`;
  const text = `Security event on your account:\n\nAction: ${action}\nIP: ${ip}\nTime: ${timestamp}\n\nIf this wasn't you, change your password immediately.`;
  const html = wrap(`
    <h2 style="margin:0 0 12px;color:#fff;font-size:18px;font-weight:600">Security Alert</h2>
    <p style="margin:0 0 8px">A security event was detected on your account:</p>
    <div style="background:#1a1a1a;padding:16px;border-radius:8px;margin:16px 0">
      <table style="font-size:13px;color:#ccc;border-collapse:collapse">
        <tr><td style="padding:4px 16px 4px 0;color:#888">Action</td><td>${action}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888">IP</td><td style="font-family:monospace">${ip}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#888">Time</td><td>${timestamp}</td></tr>
      </table>
    </div>
    <p style="margin:0;color:#fca5a5;font-size:13px">If this wasn't you, change your password and enable 2FA immediately.</p>
  `);
  return { subject, text, html };
}
