module.exports=[666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function n(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function o(e,r){return n((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function i(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let n=r.slice(0,e).trim(),o=r.slice(e+1).trim();n&&(t[n]=decodeURIComponent(o))}return t}function s(e){return i(e.headers.get("cookie"))[r]??null}function a(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,i={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=n(Buffer.from(JSON.stringify(i),"utf8")),a=o(e.secret,s);return`${s}.${a}`}function l(e){let r,n=e.token.trim(),i=n.indexOf(".");if(i<=0)return{ok:!1,error:"session_token_invalid"};let s=n.slice(0,i),a=n.slice(i+1);if(!s||!a)return{ok:!1,error:"session_token_invalid"};let l=o(e.secret,s),d=Buffer.from(a),u=Buffer.from(l);if(d.length!==u.length||!(0,t.timingSafeEqual)(d,u))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let c=Math.floor((e.now??Date.now())/1e3);return r.exp<=c?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function d(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function u(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>a,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>i,"serializeClearSessionCookie",()=>u,"serializeSessionCookie",()=>d,"verifySessionToken",()=>l])},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),n={error:e};"string"==typeof t?.details?(n.message=t.details,n.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(n.details=t.details,"message"in t.details&&(n.message=t.details.message));let o=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||o.has("Retry-After")||o.set("Retry-After","3"),Response.json(n,{status:r,headers:o})}function n(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function o(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>o,"apiZodError",()=>n])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),n=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&n.has(t))return!0;let o=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&o.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function n(e,t){try{return await e()}catch(o){var n;if(!r(o))throw o;return await (n=t?.delayMs??50,new Promise(e=>setTimeout(e,n))),await e()}}function o(e,n){return r(n)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>o,"retryOnceOnTransientDbError",()=>n])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===r.length?"user_not_found":"active"!==r[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},891454,e=>{"use strict";var t=e.i(300959),r=e.i(691180);async function n(e,n){let o=String(process.env.PROOFPACK_SESSION_SECRET??"").trim();if(o){let i=(0,r.getSessionTokenFromRequest)(n);if(i){let n=(0,r.verifySessionToken)({token:i,secret:o});if(!n.ok)return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};let s=n.payload.uid,a=Math.max(0,Math.trunc(Number(n.payload.sv??0)||0));try{let r=await e`
          SELECT session_version
          FROM app_user
          WHERE id = ${s}::uuid
          LIMIT 1
        `;if(!r[0])return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};if(Math.max(0,Math.trunc(Number(r[0].session_version??0)||0))!==a)return{ok:!1,response:(0,t.apiError)("session_revoked",{status:401})}}catch{return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}return{ok:!0,userId:s}}}else if(1)return{ok:!1,response:(0,t.apiError)("session_secret_not_configured")};let i=String(process.env.INTERNAL_SERVICE_SECRET??"").trim();if(i){let e=String(n.headers.get("x-internal-service-token")??"").trim();if(e&&e===i){let e=String(n.headers.get("x-user-id")??"").trim();if(e&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(e))return{ok:!0,userId:e}}}return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}e.s(["requireSessionUserId",()=>n])},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",n="http://localhost:3000".trim(),o=(()=>{try{if(!n)return"";return new URL(n).origin}catch{return""}})(),i=(process.env.EMAIL_LOGO_URL??"").trim(),s=(process.env.EMAIL_LOGO_ALT??t).trim()||t,a=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function d(e){let n=new Date().getFullYear(),d=l(e.preheader),u=i?`
      <div style="line-height:0;">
        <img src="${l(i)}" width="${a}" alt="${l(s)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
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
              ${u}
            </td>
          </tr>

          <tr>
            <td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
              ${e.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;" align="center">
              <div>&copy; ${n} ${l(t)}.</div>
              ${o?`<div style="margin-top:6px;">Website: <a href="${l(o)}" style="color:#4f46e5;text-decoration:none;">${l(o)}</a></div>`:""}
              <div style="margin-top:6px;">Support: <a href="mailto:${l(r)}" style="color:#4f46e5;text-decoration:none;">${l(r)}</a></div>
              <div style="margin-top:10px;color:#9ca3af;font-size:11px;">You’re receiving this email because an account action was requested for your email address.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}function u(e){let t=e.url,r=l(e.label);return`
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
    <tr>
      <td bgcolor="#4f46e5" style="border-radius:10px;">
        <a href="${t}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${r}</a>
      </td>
    </tr>
  </table>`}function c(e){let r=`Verify your email — ${t}`;return{subject:r,text:`Verify your email address to finish setting up your ${t} account:

${e}

This link expires in 24 hours.

If you didn't create an account, you can ignore this email.`,html:d({preheader:`Verify your email to finish setting up your ${t} account.`,bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Verify your email</h2>
      <p style="margin:0 0 12px;">Thanks for signing up. Click the button below to verify your email address.</p>
      ${u({url:e,label:"Verify email"})}
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
    `})}}function _(e,r,n){return{subject:`Security Alert — ${t}`,text:`Security event on your account:

Action: ${e}
IP: ${r}
Time: ${n}

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
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(n)}</td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#b91c1c;font-size:13px;"><strong>If this wasn’t you</strong>, change your password immediately and enable 2FA.</p>
    `})}}function h(e){let r=`Reset your password — ${t}`;return{subject:r,text:`A password reset was requested for your ${t} account.

Reset your password using this link (expires in 1 hour):
${e}

If you didn't request this, you can ignore this email.`,html:d({preheader:"Reset your password (link expires in 1 hour).",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Reset your password</h2>
      <p style="margin:0 0 12px;">A password reset was requested for your account.</p>
      ${u({url:e,label:"Reset password"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 1 hour.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t request this, you can ignore this email.</p>
    `})}}function m(e){let r=`[Ops] ${e.title} — ${t}`,n=(e.statusUrl??"").trim(),o=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...o.length?["Signals:",...o.map(e=>`- ${e}`)]:[],...n?["",`Status: ${n}`]:[]].join("\n"),html:d({preheader:e.summary,bodyHtml:`
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;color:#111827;">${l(e.title)}</h2>
      <p style="margin:0 0 12px;color:#374151;">${l(e.summary)}</p>
      ${o.length?`
        <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:12px 12px;margin:14px 0;border-radius:8px;">
          <div style="font-size:12px;color:#7c2d12;font-weight:700;margin-bottom:6px;">Signals</div>
          <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:12px;line-height:1.5;">
            ${o.map(e=>`<li>${l(e)}</li>`).join("\n")}
          </ul>
        </div>
      `:""}
      ${n?`
        <p style="margin:10px 0 0;color:#374151;">Open the status page for details:</p>
        ${u({url:n,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(n)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>p,"kycRejectedEmail",()=>f,"opsAlertEmail",()=>m,"passwordResetEmail",()=>h,"securityAlertEmail",()=>_,"verificationEmail",()=>c])},279174,e=>{"use strict";var t=e.i(666680);let r="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function n(e,n,o){let i=function(e){let t=e.replace(/[=\s]/g,"").toUpperCase(),n=0,o=0,i=[];for(let e of t){let t=r.indexOf(e);if(-1===t)throw Error(`Invalid base32 character: ${e}`);o=o<<5|t,(n+=5)>=8&&(i.push(o>>>n-8&255),n-=8)}return Buffer.from(i)}(e),s=Math.floor(Math.floor((o??Date.now())/1e3)/30);for(let e=-1;e<=1;e++)if(function(e,r){let n=Buffer.alloc(8);n.writeBigUInt64BE(r);let o=(0,t.createHmac)("sha1",e).update(n).digest(),i=15&o[o.length-1];return String(((127&o[i])<<24|(255&o[i+1])<<16|(255&o[i+2])<<8|255&o[i+3])%1e6).padStart(6,"0")}(i,BigInt(s+e))===n.trim())return!0;return!1}function o(){return function(e){let t=0,n=0,o="";for(let i of e)for(n=n<<8|i,t+=8;t>=5;)o+=r[n>>>t-5&31],t-=5;return t>0&&(o+=r[n<<5-t&31]),o}((0,t.randomBytes)(20))}function i(e){let t=e.issuer??"TradeSynapse",r=`${t}:${e.email}`,n=new URLSearchParams({secret:e.secret,issuer:t,algorithm:"SHA1",digits:String(6),period:String(30)});return`otpauth://totp/${encodeURIComponent(r)}?${n.toString()}`}function s(e=8){let r="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",n=[];for(let o=0;o<e;o++){let e=(0,t.randomBytes)(8),o="";for(let t of e)o+=r[t%r.length];n.push(`${o.slice(0,4)}-${o.slice(4)}`)}return n}e.s(["buildTOTPUri",()=>i,"generateBackupCodes",()=>s,"generateTOTPSecret",()=>o,"verifyTOTP",()=>n])},795374,e=>{"use strict";var t=e.i(279174);async function r(e,r,n){let o=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===o.length||!o[0].totp_enabled||!o[0].totp_secret)return null;let i=String(n??"").trim();return i&&6===i.length&&/^\d{6}$/.test(i)?(0,t.verifyTOTP)(o[0].totp_secret,i)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}async function n(e,r,n){let o=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===o.length)return null;if(!o[0].totp_enabled||!o[0].totp_secret)return Response.json({error:"totp_setup_required",message:"2FA must be enabled for this operation."},{status:403});let i=String(n??"").trim();return i&&6===i.length&&/^\d{6}$/.test(i)?(0,t.verifyTOTP)(o[0].totp_secret,i)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}e.s(["enforceTotpIfEnabled",()=>r,"enforceTotpRequired",()=>n])},449507,e=>{"use strict";var t=e.i(666680);function r(e,r){return new Promise((n,o)=>{(0,t.scrypt)(e,r,64,{N:16384,r:8,p:1},(e,t)=>{e?o(e):n(t)})})}async function n(e){let n=(0,t.randomBytes)(32),o=await r(e,n);return`${n.toString("hex")}:${o.toString("hex")}`}async function o(e,n){let[o,i]=n.split(":");if(!o||!i)return!1;let s=Buffer.from(o,"hex"),a=Buffer.from(i,"hex"),l=await r(e,s);return l.length===a.length&&(0,t.timingSafeEqual)(l,a)}e.s(["hashPassword",()=>n,"verifyPassword",()=>o])},104563,e=>{"use strict";var t=e.i(747909),r=e.i(174017),n=e.i(996250),o=e.i(759756),i=e.i(561916),s=e.i(174677),a=e.i(869741),l=e.i(316795),d=e.i(487718),u=e.i(995169),c=e.i(47587),p=e.i(666012),f=e.i(570101),_=e.i(626937),h=e.i(10372),m=e.i(193695);e.i(52474);var g=e.i(600220),y=e.i(469719),x=e.i(843793),w=e.i(300959),b=e.i(891454),v=e.i(364608),E=e.i(449507),R=e.i(184883),k=e.i(795374),S=e.i(909815),$=e.i(303395),T=e.i(90878);let A=y.z.object({currentPassword:y.z.string().min(1),newPassword:y.z.string().min(8).max(128),totp_code:y.z.string().length(6).regex(/^\d{6}$/).optional()});async function C(e){let t=(0,x.getSql)(),r=await (0,b.requireSessionUserId)(t,e);if(!r.ok)return r.response;let n=r.userId,o=await e.json().catch(()=>({})),i=A.safeParse(o);if(!i.success)return(0,w.apiError)("invalid_input");let{currentPassword:s,newPassword:a}=i.data;try{let r=await (0,k.enforceTotpIfEnabled)(t,n,i.data.totp_code);if(r)return r;let o=await (0,R.retryOnceOnTransientDbError)(()=>(0,v.requireActiveUser)(t,n));if(o)return(0,w.apiError)(o);let l=await t`
      SELECT password_hash FROM app_user WHERE id = ${n} LIMIT 1
    `;if(0===l.length)return(0,w.apiError)("user_not_found");let d=l[0].password_hash;if(!d)return(0,w.apiError)("password_not_set");if(!await (0,E.verifyPassword)(s,d))return(0,w.apiError)("invalid_current_password",{status:403});let u=await (0,E.hashPassword)(a);await t`
      UPDATE app_user
      SET password_hash = ${u}, session_version = coalesce(session_version, 0) + 1, updated_at = now()
      WHERE id = ${n}::uuid
    `;try{await (0,T.writeAuditLog)(t,{actorId:n,actorType:"user",action:"account.password.changed",resourceType:"user",resourceId:n,...(0,T.auditContextFromRequest)(e)})}catch(e){console.error("[password] Failed to write audit log:",e instanceof Error?e.message:e)}try{let r=await t`SELECT email FROM app_user WHERE id = ${n} LIMIT 1`,o=r[0]?.email;if(o){let t=e.headers.get("x-forwarded-for")??e.headers.get("x-real-ip")??"unknown",r=(0,$.securityAlertEmail)("Password changed",t,new Date().toISOString());await (0,S.sendMail)({to:o,subject:r.subject,text:r.text,html:r.html})}}catch(e){console.error("[password] Failed to send security alert email:",e instanceof Error?e.message:e)}return Response.json({ok:!0})}catch(t){let e=(0,R.responseForDbError)("account.password",t);if(e)return e;throw t}}e.s(["POST",()=>C,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],570650);var I=e.i(570650);let O=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/account/password/route",pathname:"/api/account/password",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/account/password/route.ts",nextConfigOutput:"",userland:I}),{workAsyncStorage:q,workUnitAsyncStorage:M,serverHooks:N}=O;function P(){return(0,n.patchFetch)({workAsyncStorage:q,workUnitAsyncStorage:M})}async function F(e,t,n){O.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let y="/api/account/password/route";y=y.replace(/\/index$/,"")||"/";let x=await O.prepare(e,t,{srcPage:y,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:w,params:b,nextConfig:v,parsedUrl:E,isDraftMode:R,prerenderManifest:k,routerServerContext:S,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:C,serverActionsManifest:I}=x,q=(0,a.normalizeAppPath)(y),M=!!(k.dynamicRoutes[q]||k.routes[A]),N=async()=>((null==S?void 0:S.render404)?await S.render404(e,t,E,!1):t.end("This page could not be found"),null);if(M&&!R){let e=!!k.routes[A],t=k.dynamicRoutes[q];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await N();throw new m.NoFallbackError}}let P=null;!M||O.isDev||R||(P="/index"===(P=A)?"/":P);let F=!0===O.isDev||!M,U=M&&!F;I&&C&&(0,s.setManifestsSingleton)({page:y,clientReferenceManifest:C,serverActionsManifest:I});let z=e.method||"GET",L=(0,i.getTracer)(),H=L.getActiveScopeSpan(),j={params:b,prerenderManifest:k,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:F,incrementalCache:(0,o.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,o)=>O.onRequestError(e,t,n,o,S)},sharedContext:{buildId:w}},D=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(D,(0,d.signalFromNodeResponse)(t));try{let s=async e=>O.handle(V,j).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=L.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${z} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${z} ${y}`)}),a=!!(0,o.getRequestMeta)(e,"minimalMode"),l=async o=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!a&&$&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(o);e.fetchMetrics=j.renderOpts.fetchMetrics;let l=j.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let d=j.renderOpts.collectedTags;if(!M)return await (0,p.sendResponse)(D,B,i,j.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,f.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[h.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==j.renderOpts.collectedRevalidate&&!(j.renderOpts.collectedRevalidate>=h.INFINITE_CACHE)&&j.renderOpts.collectedRevalidate,n=void 0===j.renderOpts.collectedExpire||j.renderOpts.collectedExpire>=h.INFINITE_CACHE?void 0:j.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await O.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:$})},!1,S),t}},u=await O.handleResponse({req:e,nextConfig:v,cacheKey:P,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:k,isRoutePPREnabled:!1,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,responseGenerator:d,waitUntil:n.waitUntil,isMinimalMode:a});if(!M)return null;if((null==u||null==(i=u.value)?void 0:i.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(l=u.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});a||t.setHeader("x-nextjs-cache",$?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,f.fromNodeOutgoingHttpHeaders)(u.value.headers);return a&&M||m.delete(h.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,_.getCacheControlHeader)(u.cacheControl)),await (0,p.sendResponse)(D,B,new Response(u.value.body,{headers:m,status:u.value.status||200})),null};H?await l(H):await L.withPropagatedContext(e.headers,()=>L.trace(u.BaseServerSpan.handleRequest,{spanName:`${z} ${y}`,kind:i.SpanKind.SERVER,attributes:{"http.method":z,"http.target":e.url}},l))}catch(t){if(t instanceof m.NoFallbackError||await O.onRequestError(e,t,{routerKind:"App Router",routePath:q,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:$})},!1,S),M)throw t;return await (0,p.sendResponse)(D,B,new Response(null,{status:500})),null}}e.s(["handler",()=>F,"patchFetch",()=>P,"routeModule",()=>O,"serverHooks",()=>N,"workAsyncStorage",()=>q,"workUnitAsyncStorage",()=>M],104563)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__3caf10da._.js.map