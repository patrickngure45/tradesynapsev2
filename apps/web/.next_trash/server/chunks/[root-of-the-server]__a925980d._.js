module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(n){var a;if(!r(n))throw n;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function n(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>a])},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},90878,e=>{"use strict";async function t(e,t){await e`
    INSERT INTO audit_log (
      actor_id,
      actor_type,
      action,
      resource_type,
      resource_id,
      ip,
      user_agent,
      request_id,
      detail
    ) VALUES (
      ${t.actorId??null},
      ${t.actorType??"user"},
      ${t.action},
      ${t.resourceType??null},
      ${t.resourceId??null},
      ${t.ip??null},
      ${t.userAgent??null},
      ${t.requestId??null},
      ${JSON.stringify(t.detail??{})}::jsonb
    )
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,n=t.max??60;return{consume:async function(t){let i=(await e`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${r}, ${t}, ${n-1}, ${a}, ${n}, now())
      ON CONFLICT (name, key)
      DO UPDATE SET
        tokens = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN ${n-1}
          ELSE GREATEST(rate_limit_bucket.tokens - 1, -1)
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN now()
          ELSE rate_limit_bucket.window_start
        END,
        window_ms   = ${a},
        max_tokens  = ${n}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `)[0],o=Number(i.window_start_ms)+a,s=Math.max(0,i.tokens);return{allowed:i.tokens>=0,remaining:s,resetMs:o,limit:n}},name:r}}e.s(["createPgRateLimiter",()=>t])},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",a="http://localhost:3000".trim(),n=(()=>{try{if(!a)return"";return new URL(a).origin}catch{return""}})(),i=(process.env.EMAIL_LOGO_URL??"").trim(),o=(process.env.EMAIL_LOGO_ALT??t).trim()||t,s=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function d(e){let a=new Date().getFullYear(),d=l(e.preheader),c=i?`
      <div style="line-height:0;">
        <img src="${l(i)}" width="${s}" alt="${l(o)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
      </div>
      <div style="margin-top:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${l(t)}</div>
    `:`${l(t)}`;return`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${l(t)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${d}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:18px 24px;background-color:#4f46e5;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">
              ${c}
            </td>
          </tr>

          <tr>
            <td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
              ${e.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;" align="center">
              <div>&copy; ${a} ${l(t)}.</div>
              ${n?`<div style="margin-top:6px;">Website: <a href="${l(n)}" style="color:#4f46e5;text-decoration:none;">${l(n)}</a></div>`:""}
              <div style="margin-top:6px;">Support: <a href="mailto:${l(r)}" style="color:#4f46e5;text-decoration:none;">${l(r)}</a></div>
              <div style="margin-top:10px;color:#9ca3af;font-size:11px;">You’re receiving this email because an account action was requested for your email address.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}function c(e){let t=e.url,r=l(e.label);return`
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
    <tr>
      <td bgcolor="#4f46e5" style="border-radius:10px;">
        <a href="${t}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${r}</a>
      </td>
    </tr>
  </table>`}function u(e){let r=`Verify your email — ${t}`;return{subject:r,text:`Verify your email address to finish setting up your ${t} account:

${e}

This link expires in 24 hours.

If you didn't create an account, you can ignore this email.`,html:d({preheader:`Verify your email to finish setting up your ${t} account.`,bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Verify your email</h2>
      <p style="margin:0 0 12px;">Thanks for signing up. Click the button below to verify your email address.</p>
      ${c({url:e,label:"Verify email"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 24 hours.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t create an account, you can ignore this email.</p>
    `})}}function p(){return{subject:`KYC Verified — ${t}`,text:"Your identity has been verified. You now have Verified KYC status with increased withdrawal limits ($50,000/day).",html:d({preheader:"Your identity verification is approved.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Identity verified</h2>
      <p style="margin:0 0 8px;">Your identity documents have been reviewed and approved.</p>
      <p style="margin:0;">You now have <strong>Verified</strong> KYC status with a daily withdrawal limit of <strong>$50,000</strong>.</p>
    `})}}function f(e){return{subject:`KYC Review Update — ${t}`,text:`Your identity document submission was not approved.

Reason: ${e}

Please re-submit clearer documents from your account page.`,html:d({preheader:"Your document submission needs an update.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Document review update</h2>
      <p style="margin:0 0 8px;">Your identity document submission was not approved.</p>
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:12px 12px;margin:16px 0;border-radius:8px;">
        <div style="font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${l(e)}</div>
      </div>
      <p style="margin:0;color:#374151;">Please re-submit clearer documents from your account page.</p>
    `})}}function _(e,r,a){return{subject:`Security Alert — ${t}`,text:`Security event on your account:

Action: ${e}
IP: ${r}
Time: ${a}

If this wasn't you, change your password immediately.`,html:d({preheader:"Security activity detected on your account.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Security alert</h2>
      <p style="margin:0 0 12px;">A security event was detected on your account:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Action</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(e)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">IP</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${l(r)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Time</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(a)}</td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#b91c1c;font-size:13px;"><strong>If this wasn’t you</strong>, change your password immediately and enable 2FA.</p>
    `})}}function m(e){let r=`Reset your password — ${t}`;return{subject:r,text:`A password reset was requested for your ${t} account.

Reset your password using this link (expires in 1 hour):
${e}

If you didn't request this, you can ignore this email.`,html:d({preheader:"Reset your password (link expires in 1 hour).",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Reset your password</h2>
      <p style="margin:0 0 12px;">A password reset was requested for your account.</p>
      ${c({url:e,label:"Reset password"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 1 hour.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t request this, you can ignore this email.</p>
    `})}}function h(e){let r=`[Ops] ${e.title} — ${t}`,a=(e.statusUrl??"").trim(),n=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...n.length?["Signals:",...n.map(e=>`- ${e}`)]:[],...a?["",`Status: ${a}`]:[]].join("\n"),html:d({preheader:e.summary,bodyHtml:`
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;color:#111827;">${l(e.title)}</h2>
      <p style="margin:0 0 12px;color:#374151;">${l(e.summary)}</p>
      ${n.length?`
        <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:12px 12px;margin:14px 0;border-radius:8px;">
          <div style="font-size:12px;color:#7c2d12;font-weight:700;margin-bottom:6px;">Signals</div>
          <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:12px;line-height:1.5;">
            ${n.map(e=>`<li>${l(e)}</li>`).join("\n")}
          </ul>
        </div>
      `:""}
      ${a?`
        <p style="margin:10px 0 0;color:#374151;">Open the status page for details:</p>
        ${c({url:a,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(a)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>p,"kycRejectedEmail",()=>f,"opsAlertEmail",()=>h,"passwordResetEmail",()=>m,"securityAlertEmail",()=>_,"verificationEmail",()=>u])},449507,e=>{"use strict";var t=e.i(666680);function r(e,r){return new Promise((a,n)=>{(0,t.scrypt)(e,r,64,{N:16384,r:8,p:1},(e,t)=>{e?n(e):a(t)})})}async function a(e){let a=(0,t.randomBytes)(32),n=await r(e,a);return`${a.toString("hex")}:${n.toString("hex")}`}async function n(e,a){let[n,i]=a.split(":");if(!n||!i)return!1;let o=Buffer.from(n,"hex"),s=Buffer.from(i,"hex"),l=await r(e,o);return l.length===s.length&&(0,t.timingSafeEqual)(l,s)}e.s(["hashPassword",()=>a,"verifyPassword",()=>n])},864946,e=>{"use strict";var t=e.i(666680);function r(e){var r;return r=`${e}.${String(process.env.PROOFPACK_SESSION_SECRET??process.env.SECRET_KEY??"")}`,(0,t.createHash)("sha256").update(r,"utf8").digest("hex")}async function a(e,a){let n=(0,t.randomBytes)(32).toString("hex"),i=r(n),o=new Date(Date.now()+36e5),s=a.requestIp?String(a.requestIp).slice(0,200):null;return await e`
    INSERT INTO app_password_reset_token (user_id, token_hash, expires_at, request_ip)
    VALUES (${a.userId}::uuid, ${i}, ${o.toISOString()}::timestamptz, ${s})
  `,n}async function n(e,a){let n=r(a),i=(await e`
    SELECT id, user_id::text AS user_id, token_hash, expires_at, used_at
    FROM app_password_reset_token
    WHERE token_hash = ${n}
    LIMIT 1
  `)[0];if(!i||i.used_at||new Date(i.expires_at).getTime()<Date.now())return null;try{let e=Buffer.from(String(i.token_hash),"utf8"),r=Buffer.from(String(n),"utf8");if(e.length!==r.length||!(0,t.timingSafeEqual)(e,r))return null}catch{return null}return await e`
    UPDATE app_password_reset_token
    SET used_at = now()
    WHERE id = ${i.id}::uuid
  `,{userId:i.user_id}}e.s(["consumePasswordResetToken",()=>n,"createPasswordResetToken",()=>a])},530074,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),i=e.i(561916),o=e.i(174677),s=e.i(869741),l=e.i(316795),d=e.i(487718),c=e.i(995169),u=e.i(47587),p=e.i(666012),f=e.i(570101),_=e.i(626937),m=e.i(10372),h=e.i(193695);e.i(52474);var y=e.i(600220),x=e.i(469719),g=e.i(300959),w=e.i(843793),b=e.i(831075),v=e.i(864946),E=e.i(449507),k=e.i(909815),R=e.i(303395),$=e.i(90878),S=e.i(184883);let T=x.z.object({token:x.z.string().min(16).max(2e3),newPassword:x.z.string().min(8).max(128)});async function A(e){let t,r=(0,w.getSql)(),a=await e.json().catch(()=>({})),n=T.safeParse(a);if(!n.success)return(0,g.apiZodError)(n.error)??(0,g.apiError)("invalid_input");let i=(t=e.headers.get("x-forwarded-for")??"",(t.split(",")[0]?.trim()||e.headers.get("x-real-ip")?.trim()||"unknown").slice(0,120));try{let e=(0,b.createPgRateLimiter)(r,{name:"auth.pwreset.confirm.ip",windowMs:6e5,max:30});if(!(await e.consume(i)).allowed)return(0,g.apiError)("rate_limited",{status:429})}catch{}try{let t=await (0,v.consumePasswordResetToken)(r,n.data.token.trim());if(!t)return(0,g.apiError)("invalid_or_expired_token",{status:400});let a=await (0,E.hashPassword)(n.data.newPassword);await r`
      UPDATE app_user
      SET password_hash = ${a}, session_version = coalesce(session_version, 0) + 1, updated_at = now()
      WHERE id = ${t.userId}::uuid
    `;try{let a=(0,$.auditContextFromRequest)(e);await (0,$.writeAuditLog)(r,{actorId:t.userId,actorType:"user",action:"account.password.reset",resourceType:"user",resourceId:t.userId,ip:a.ip,userAgent:a.userAgent,requestId:a.requestId})}catch{}try{let e=await r`
        SELECT email FROM app_user WHERE id = ${t.userId}::uuid LIMIT 1
      `,a=e[0]?.email;if(a){let e=(0,R.securityAlertEmail)("Password reset",i,new Date().toISOString());await (0,k.sendMail)({to:a,subject:e.subject,text:e.text,html:e.html})}}catch{}return Response.json({ok:!0})}catch(e){return(0,S.responseForDbError)("auth.password_reset.confirm",e)??(0,g.apiError)("internal_error")}}e.s(["POST",()=>A,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],766794);var I=e.i(766794);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/auth/password-reset/confirm/route",pathname:"/api/auth/password-reset/confirm",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/auth/password-reset/confirm/route.ts",nextConfigOutput:"",userland:I}),{workAsyncStorage:N,workUnitAsyncStorage:O,serverHooks:q}=C;function P(){return(0,a.patchFetch)({workAsyncStorage:N,workUnitAsyncStorage:O})}async function M(e,t,a){C.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let x="/api/auth/password-reset/confirm/route";x=x.replace(/\/index$/,"")||"/";let g=await C.prepare(e,t,{srcPage:x,multiZoneDraftMode:!1});if(!g)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:w,params:b,nextConfig:v,parsedUrl:E,isDraftMode:k,prerenderManifest:R,routerServerContext:$,isOnDemandRevalidate:S,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:I,serverActionsManifest:N}=g,O=(0,s.normalizeAppPath)(x),q=!!(R.dynamicRoutes[O]||R.routes[A]),P=async()=>((null==$?void 0:$.render404)?await $.render404(e,t,E,!1):t.end("This page could not be found"),null);if(q&&!k){let e=!!R.routes[A],t=R.dynamicRoutes[O];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await P();throw new h.NoFallbackError}}let M=null;!q||C.isDev||k||(M="/index"===(M=A)?"/":M);let D=!0===C.isDev||!q,z=q&&!D;N&&I&&(0,o.setManifestsSingleton)({page:x,clientReferenceManifest:I,serverActionsManifest:N});let H=e.method||"GET",L=(0,i.getTracer)(),U=L.getActiveScopeSpan(),j={params:b,prerenderManifest:R,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:D,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>C.onRequestError(e,t,a,n,$)},sharedContext:{buildId:w}},F=new l.NodeNextRequest(e),Y=new l.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(F,(0,d.signalFromNodeResponse)(t));try{let o=async e=>C.handle(V,j).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=L.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${H} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${x}`)}),s=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&S&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await o(n);e.fetchMetrics=j.renderOpts.fetchMetrics;let l=j.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let d=j.renderOpts.collectedTags;if(!q)return await (0,p.sendResponse)(F,Y,i,j.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,f.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==j.renderOpts.collectedRevalidate&&!(j.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&j.renderOpts.collectedRevalidate,a=void 0===j.renderOpts.collectedExpire||j.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:j.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:x,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:z,isOnDemandRevalidate:S})},!1,$),t}},c=await C.handleResponse({req:e,nextConfig:v,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:R,isRoutePPREnabled:!1,isOnDemandRevalidate:S,revalidateOnlyGenerated:T,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:s});if(!q)return null;if((null==c||null==(i=c.value)?void 0:i.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",S?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),k&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,f.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&q||h.delete(m.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,_.getCacheControlHeader)(c.cacheControl)),await (0,p.sendResponse)(F,Y,new Response(c.value.body,{headers:h,status:c.value.status||200})),null};U?await l(U):await L.withPropagatedContext(e.headers,()=>L.trace(c.BaseServerSpan.handleRequest,{spanName:`${H} ${x}`,kind:i.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:z,isOnDemandRevalidate:S})},!1,$),q)throw t;return await (0,p.sendResponse)(F,Y,new Response(null,{status:500})),null}}e.s(["handler",()=>M,"patchFetch",()=>P,"routeModule",()=>C,"serverHooks",()=>q,"workAsyncStorage",()=>N,"workUnitAsyncStorage",()=>O],530074)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__a925980d._.js.map