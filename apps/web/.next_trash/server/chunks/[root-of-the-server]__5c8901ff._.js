module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),n={error:e};"string"==typeof t?.details?(n.message=t.details,n.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(n.details=t.details,"message"in t.details&&(n.message=t.details.message));let o=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||o.has("Retry-After")||o.set("Retry-After","3"),Response.json(n,{status:r,headers:o})}function n(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function o(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>o,"apiZodError",()=>n])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function n(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function o(e,r){return n((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function i(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let n=r.slice(0,e).trim(),o=r.slice(e+1).trim();n&&(t[n]=decodeURIComponent(o))}return t}function a(e){return i(e.headers.get("cookie"))[r]??null}function s(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,i={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},a=n(Buffer.from(JSON.stringify(i),"utf8")),s=o(e.secret,a);return`${a}.${s}`}function l(e){let r,n=e.token.trim(),i=n.indexOf(".");if(i<=0)return{ok:!1,error:"session_token_invalid"};let a=n.slice(0,i),s=n.slice(i+1);if(!a||!s)return{ok:!1,error:"session_token_invalid"};let l=o(e.secret,a),d=Buffer.from(s),c=Buffer.from(l);if(d.length!==c.length||!(0,t.timingSafeEqual)(d,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=a.length%4,t=(a+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function d(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>s,"getSessionTokenFromRequest",()=>a,"parseCookieHeader",()=>i,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>d,"verifySessionToken",()=>l])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let n=(0,t.getSessionTokenFromRequest)(e);if(n){let e=(0,t.verifySessionToken)({token:n,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let n=process.env.INTERNAL_SERVICE_SECRET;if(n){let t=e.headers.get("x-internal-service-token");if(t&&t===n){let t=e.headers.get("x-user-id");if(t)return t}}return null}function n(e){return e?null:"missing_x_user_id"}function o(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>o,"requireActingUserIdInProd",()=>n])},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},279174,e=>{"use strict";var t=e.i(666680);let r="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function n(e,n,o){let i=function(e){let t=e.replace(/[=\s]/g,"").toUpperCase(),n=0,o=0,i=[];for(let e of t){let t=r.indexOf(e);if(-1===t)throw Error(`Invalid base32 character: ${e}`);o=o<<5|t,(n+=5)>=8&&(i.push(o>>>n-8&255),n-=8)}return Buffer.from(i)}(e),a=Math.floor(Math.floor((o??Date.now())/1e3)/30);for(let e=-1;e<=1;e++)if(function(e,r){let n=Buffer.alloc(8);n.writeBigUInt64BE(r);let o=(0,t.createHmac)("sha1",e).update(n).digest(),i=15&o[o.length-1];return String(((127&o[i])<<24|(255&o[i+1])<<16|(255&o[i+2])<<8|255&o[i+3])%1e6).padStart(6,"0")}(i,BigInt(a+e))===n.trim())return!0;return!1}function o(){return function(e){let t=0,n=0,o="";for(let i of e)for(n=n<<8|i,t+=8;t>=5;)o+=r[n>>>t-5&31],t-=5;return t>0&&(o+=r[n<<5-t&31]),o}((0,t.randomBytes)(20))}function i(e){let t=e.issuer??"TradeSynapse",r=`${t}:${e.email}`,n=new URLSearchParams({secret:e.secret,issuer:t,algorithm:"SHA1",digits:String(6),period:String(30)});return`otpauth://totp/${encodeURIComponent(r)}?${n.toString()}`}function a(e=8){let r="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",n=[];for(let o=0;o<e;o++){let e=(0,t.randomBytes)(8),o="";for(let t of e)o+=r[t%r.length];n.push(`${o.slice(0,4)}-${o.slice(4)}`)}return n}e.s(["buildTOTPUri",()=>i,"generateBackupCodes",()=>a,"generateTOTPSecret",()=>o,"verifyTOTP",()=>n])},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",n="http://localhost:3000".trim(),o=(()=>{try{if(!n)return"";return new URL(n).origin}catch{return""}})(),i=(process.env.EMAIL_LOGO_URL??"").trim(),a=(process.env.EMAIL_LOGO_ALT??t).trim()||t,s=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function d(e){let n=new Date().getFullYear(),d=l(e.preheader),c=i?`
      <div style="line-height:0;">
        <img src="${l(i)}" width="${s}" alt="${l(a)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
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
    `})}}function g(e){let r=`[Ops] ${e.title} — ${t}`,n=(e.statusUrl??"").trim(),o=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...o.length?["Signals:",...o.map(e=>`- ${e}`)]:[],...n?["",`Status: ${n}`]:[]].join("\n"),html:d({preheader:e.summary,bodyHtml:`
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
        ${c({url:n,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(n)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>p,"kycRejectedEmail",()=>f,"opsAlertEmail",()=>g,"passwordResetEmail",()=>m,"securityAlertEmail",()=>_,"verificationEmail",()=>u])},23254,e=>{"use strict";var t=e.i(747909),r=e.i(174017),n=e.i(996250),o=e.i(759756),i=e.i(561916),a=e.i(174677),s=e.i(869741),l=e.i(316795),d=e.i(487718),c=e.i(995169),u=e.i(47587),p=e.i(666012),f=e.i(570101),_=e.i(626937),m=e.i(10372),g=e.i(193695);e.i(52474);var h=e.i(600220),x=e.i(843793),y=e.i(977775),b=e.i(279174),v=e.i(90878),w=e.i(909815),k=e.i(303395),R=e.i(300959);async function E(e){let t,r=(0,x.getSql)(),n=(0,y.getActingUserId)(e),o=(0,y.requireActingUserIdInProd)(n);if(o||!n)return(0,R.apiError)(o??"unauthorized",{status:401});try{t=await e.json()}catch{return(0,R.apiError)("invalid_input")}let i=String(t.code??"").trim();if(!i||6!==i.length||!/^\d{6}$/.test(i))return(0,R.apiError)("invalid_input",{details:{message:"Invalid 2FA code format"}});let a=await r`
    SELECT totp_secret, totp_enabled FROM app_user WHERE id = ${n}
  `;if(0===a.length)return(0,R.apiError)("user_not_found",{status:404});if(a[0].totp_enabled)return(0,R.apiError)("totp_already_enabled",{status:409});if(!a[0].totp_secret)return(0,R.apiError)("totp_not_set_up");if(!(0,b.verifyTOTP)(a[0].totp_secret,i))return(0,R.apiError)("invalid_totp_code",{status:403});let s=(0,b.generateBackupCodes)();await r.begin(async t=>{await t`
      UPDATE app_user
      SET totp_enabled = true, totp_backup_codes = ${s}
      WHERE id = ${n}
    `,await (0,v.writeAuditLog)(t,{actorId:n,actorType:"user",action:"auth.totp.enabled",resourceType:"user",resourceId:n,...(0,v.auditContextFromRequest)(e)})});try{let t=await r`SELECT email FROM app_user WHERE id = ${n} LIMIT 1`,o=t[0]?.email;if(o){let t=e.headers.get("x-forwarded-for")??e.headers.get("x-real-ip")??"unknown",r=(0,k.securityAlertEmail)("Two-factor authentication enabled",t,new Date().toISOString());await (0,w.sendMail)({to:o,subject:r.subject,text:r.text,html:r.html})}}catch(e){console.error("[totp/enable] Failed to send security alert email:",e instanceof Error?e.message:e)}return Response.json({ok:!0,backup_codes:s})}e.s(["POST",()=>E,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],828690);var $=e.i(828690);let S=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/account/totp/enable/route",pathname:"/api/account/totp/enable",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/account/totp/enable/route.ts",nextConfigOutput:"",userland:$}),{workAsyncStorage:A,workUnitAsyncStorage:C,serverHooks:T}=S;function I(){return(0,n.patchFetch)({workAsyncStorage:A,workUnitAsyncStorage:C})}async function q(e,t,n){S.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let x="/api/account/totp/enable/route";x=x.replace(/\/index$/,"")||"/";let y=await S.prepare(e,t,{srcPage:x,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==n.waitUntil||n.waitUntil.call(n,Promise.resolve()),null;let{buildId:b,params:v,nextConfig:w,parsedUrl:k,isDraftMode:R,prerenderManifest:E,routerServerContext:$,isOnDemandRevalidate:A,revalidateOnlyGenerated:C,resolvedPathname:T,clientReferenceManifest:I,serverActionsManifest:q}=y,M=(0,s.normalizeAppPath)(x),O=!!(E.dynamicRoutes[M]||E.routes[T]),P=async()=>((null==$?void 0:$.render404)?await $.render404(e,t,k,!1):t.end("This page could not be found"),null);if(O&&!R){let e=!!E.routes[T],t=E.dynamicRoutes[M];if(t&&!1===t.fallback&&!e){if(w.experimental.adapterPath)return await P();throw new g.NoFallbackError}}let N=null;!O||S.isDev||R||(N="/index"===(N=T)?"/":N);let U=!0===S.isDev||!O,H=O&&!U;q&&I&&(0,a.setManifestsSingleton)({page:x,clientReferenceManifest:I,serverActionsManifest:q});let z=e.method||"GET",j=(0,i.getTracer)(),L=j.getActiveScopeSpan(),F={params:v,prerenderManifest:E,renderOpts:{experimental:{authInterrupts:!!w.experimental.authInterrupts},cacheComponents:!!w.cacheComponents,supportsDynamicResponse:U,incrementalCache:(0,o.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:w.cacheLife,waitUntil:n.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,n,o)=>S.onRequestError(e,t,n,o,$)},sharedContext:{buildId:b}},D=new l.NodeNextRequest(e),B=new l.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(D,(0,d.signalFromNodeResponse)(t));try{let a=async e=>S.handle(V,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=j.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let n=r.get("next.route");if(n){let t=`${z} ${n}`;e.setAttributes({"next.route":n,"http.route":n,"next.span_name":t}),e.updateName(t)}else e.updateName(`${z} ${x}`)}),s=!!(0,o.getRequestMeta)(e,"minimalMode"),l=async o=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&A&&C&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await a(o);e.fetchMetrics=F.renderOpts.fetchMetrics;let l=F.renderOpts.pendingWaitUntil;l&&n.waitUntil&&(n.waitUntil(l),l=void 0);let d=F.renderOpts.collectedTags;if(!O)return await (0,p.sendResponse)(D,B,i,F.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,f.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,n=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:h.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:n}}}}catch(t){throw(null==r?void 0:r.isStale)&&await S.onRequestError(e,t,{routerKind:"App Router",routePath:x,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:A})},!1,$),t}},c=await S.handleResponse({req:e,nextConfig:w,cacheKey:N,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:E,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:C,responseGenerator:d,waitUntil:n.waitUntil,isMinimalMode:s});if(!O)return null;if((null==c||null==(i=c.value)?void 0:i.kind)!==h.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",A?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let g=(0,f.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&O||g.delete(m.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||g.get("Cache-Control")||g.set("Cache-Control",(0,_.getCacheControlHeader)(c.cacheControl)),await (0,p.sendResponse)(D,B,new Response(c.value.body,{headers:g,status:c.value.status||200})),null};L?await l(L):await j.withPropagatedContext(e.headers,()=>j.trace(c.BaseServerSpan.handleRequest,{spanName:`${z} ${x}`,kind:i.SpanKind.SERVER,attributes:{"http.method":z,"http.target":e.url}},l))}catch(t){if(t instanceof g.NoFallbackError||await S.onRequestError(e,t,{routerKind:"App Router",routePath:M,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:A})},!1,$),O)throw t;return await (0,p.sendResponse)(D,B,new Response(null,{status:500})),null}}e.s(["handler",()=>q,"patchFetch",()=>I,"routeModule",()=>S,"serverHooks",()=>T,"workAsyncStorage",()=>A,"workUnitAsyncStorage",()=>C],23254)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__5c8901ff._.js.map