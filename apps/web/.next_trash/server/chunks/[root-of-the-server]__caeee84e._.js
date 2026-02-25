module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),i={error:e};"string"==typeof t?.details?(i.message=t.details,i.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(i.details=t.details,"message"in t.details&&(i.message=t.details.message));let a=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||a.has("Retry-After")||a.set("Retry-After","3"),Response.json(i,{status:r,headers:a})}function i(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function a(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>a,"apiZodError",()=>i])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),i=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&i.has(t))return!0;let a=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&a.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function i(e,t){try{return await e()}catch(a){var i;if(!r(a))throw a;return await (i=t?.delayMs??50,new Promise(e=>setTimeout(e,i))),await e()}}function a(e,i){return r(i)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>a,"retryOnceOnTransientDbError",()=>i])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function i(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function a(e,r){return i((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let i=r.slice(0,e).trim(),a=r.slice(e+1).trim();i&&(t[i]=decodeURIComponent(a))}return t}function o(e){return n(e.headers.get("cookie"))[r]??null}function s(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},o=i(Buffer.from(JSON.stringify(n),"utf8")),s=a(e.secret,o);return`${o}.${s}`}function l(e){let r,i=e.token.trim(),n=i.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let o=i.slice(0,n),s=i.slice(n+1);if(!o||!s)return{ok:!1,error:"session_token_invalid"};let l=a(e.secret,o),d=Buffer.from(s),c=Buffer.from(l);if(d.length!==c.length||!(0,t.timingSafeEqual)(d,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=o.length%4,t=(o+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function d(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>s,"getSessionTokenFromRequest",()=>o,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>d,"verifySessionToken",()=>l])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let i=(0,t.getSessionTokenFromRequest)(e);if(i){let e=(0,t.verifySessionToken)({token:i,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let i=process.env.INTERNAL_SERVICE_SECRET;if(i){let t=e.headers.get("x-internal-service-token");if(t&&t===i){let t=e.headers.get("x-user-id");if(t)return t}}return null}function i(e){return e?null:"missing_x_user_id"}function a(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>a,"requireActingUserIdInProd",()=>i])},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,i){let a="number"==typeof e?e:Number(String(e??""));return Number.isFinite(a)?Math.max(t,Math.min(r,Math.trunc(a))):i}async function i(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function a(e,a){var o;let s,l,d,c,u,p=!0,f=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${a.userId}::uuid
        AND type = ${a.type}
      LIMIT 1
    `;t.length>0&&(p=!1!==t[0].in_app_enabled,f=!0===t[0].email_enabled)}catch{}if(!p&&!f)return"";let _=String(a.title??"").trim()||"Notification",m=String(a.body??""),y=(o=a.type,(l=t(s={...a.metadata??{}},"order_id","orderId"))&&(s.order_id=l),(d=t(s,"withdrawal_id","withdrawalId"))&&(s.withdrawal_id=d),(c=t(s,"tx_hash","txHash"))&&(s.tx_hash=c),t(s,"severity")||(s.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(o)),(u=t(s,"href")??function(e,r){let i=t(r,"order_id","orderId"),a=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(i&&e.startsWith("p2p_"))return`/p2p/orders/${i}`;if(a&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(o,s))&&u.startsWith("/")&&(s.href=u),s);if("system"!==a.type){let t=await i(e,a.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let i=r(e.tz_offset_min,-840,840,0),a=new Date(t.getTime()+6e4*i),n=60*a.getUTCHours()+a.getUTCMinutes(),o=r(e.quiet_start_min,0,1439,1320),s=r(e.quiet_end_min,0,1439,480);return o===s||(o<s?n>=o&&n<s:n>=o||n<s)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${a.userId}::uuid, ${a.type}, ${_}, ${m}, ${y}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let h="";if(p){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${a.userId}::uuid,
        ${a.type},
        ${_},
        ${m},
        ${y}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];h=t.id;try{let r=JSON.stringify({id:t.id,user_id:a.userId,type:a.type,title:_,body:m,metadata_json:y,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(f)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${a.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",i=t?.email_verified===!0;if(r&&r.includes("@")&&i){let t=`[Coinwaka] ${_}`,i=m?`${_}

${m}`:_,o=m?`<p><strong>${n(_)}</strong></p><p>${n(m)}</p>`:`<p><strong>${n(_)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${a.userId}::uuid,
            ${r},
            'notification',
            ${a.type},
            ${t},
            ${i},
            ${o},
            ${y}::jsonb
          )
        `}}catch{}return h}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function o(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
    SELECT id, type, title, body, metadata_json, read, created_at
    FROM ex_notification
    WHERE user_id = ${t.userId}::uuid
      ${t.unreadOnly?e`AND read = false`:e``}
    ORDER BY created_at DESC
    LIMIT ${r}
  `}async function s(e,t){let r=await e`
    SELECT count(*)::text AS count
    FROM ex_notification
    WHERE user_id = ${t}::uuid AND read = false
  `;return Number(r[0]?.count??"0")}async function l(e,t){return 0===t.ids.length?0:(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t.userId}::uuid
      AND id = ANY(${t.ids}::uuid[])
      AND read = false
  `).count}async function d(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>s,"createNotification",()=>a,"listNotifications",()=>o,"markAllRead",()=>d,"markRead",()=>l])},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",i="http://localhost:3000".trim(),a=(()=>{try{if(!i)return"";return new URL(i).origin}catch{return""}})(),n=(process.env.EMAIL_LOGO_URL??"").trim(),o=(process.env.EMAIL_LOGO_ALT??t).trim()||t,s=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function d(e){let i=new Date().getFullYear(),d=l(e.preheader),c=n?`
      <div style="line-height:0;">
        <img src="${l(n)}" width="${s}" alt="${l(o)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
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
              <div>&copy; ${i} ${l(t)}.</div>
              ${a?`<div style="margin-top:6px;">Website: <a href="${l(a)}" style="color:#4f46e5;text-decoration:none;">${l(a)}</a></div>`:""}
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
    `})}}function _(e,r,i){return{subject:`Security Alert — ${t}`,text:`Security event on your account:

Action: ${e}
IP: ${r}
Time: ${i}

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
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(i)}</td>
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
    `})}}function y(e){let r=`[Ops] ${e.title} — ${t}`,i=(e.statusUrl??"").trim(),a=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...a.length?["Signals:",...a.map(e=>`- ${e}`)]:[],...i?["",`Status: ${i}`]:[]].join("\n"),html:d({preheader:e.summary,bodyHtml:`
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;color:#111827;">${l(e.title)}</h2>
      <p style="margin:0 0 12px;color:#374151;">${l(e.summary)}</p>
      ${a.length?`
        <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:12px 12px;margin:14px 0;border-radius:8px;">
          <div style="font-size:12px;color:#7c2d12;font-weight:700;margin-bottom:6px;">Signals</div>
          <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:12px;line-height:1.5;">
            ${a.map(e=>`<li>${l(e)}</li>`).join("\n")}
          </ul>
        </div>
      `:""}
      ${i?`
        <p style="margin:10px 0 0;color:#374151;">Open the status page for details:</p>
        ${c({url:i,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(i)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>p,"kycRejectedEmail",()=>f,"opsAlertEmail",()=>y,"passwordResetEmail",()=>m,"securityAlertEmail",()=>_,"verificationEmail",()=>u])},944273,e=>{"use strict";var t=e.i(666680);async function r(e,r){let i=(0,t.randomBytes)(32).toString("hex"),a=new Date(Date.now()+864e5);return await e`
    INSERT INTO email_verification_token (user_id, token, expires_at)
    VALUES (${r}::uuid, ${i}, ${a.toISOString()}::timestamptz)
  `,i}async function i(e,t){let r=await e`
    SELECT id, user_id::text AS user_id, expires_at, used_at
    FROM email_verification_token
    WHERE token = ${t}
    LIMIT 1
  `;if(0===r.length)return null;let i=r[0];return i.used_at||new Date(i.expires_at).getTime()<Date.now()?null:(await e`
    UPDATE email_verification_token
    SET used_at = now()
    WHERE id = ${i.id}::uuid
  `,await e`
    UPDATE app_user
    SET email_verified = true, updated_at = now()
    WHERE id = ${i.user_id}::uuid
  `,{userId:i.user_id})}e.s(["consumeVerificationToken",()=>i,"createVerificationToken",()=>r])},779458,e=>{"use strict";var t=e.i(747909),r=e.i(174017),i=e.i(996250),a=e.i(759756),n=e.i(561916),o=e.i(174677),s=e.i(869741),l=e.i(316795),d=e.i(487718),c=e.i(995169),u=e.i(47587),p=e.i(666012),f=e.i(570101),_=e.i(626937),m=e.i(10372),y=e.i(193695);e.i(52474);var h=e.i(600220),g=e.i(469719),x=e.i(843793),b=e.i(300959),w=e.i(977775),v=e.i(944273),E=e.i(194748),R=e.i(184883),k=e.i(909815),S=e.i(303395);let $=g.z.object({token:g.z.string().min(1)}),T=g.z.object({action:g.z.literal("resend")});async function A(e){let t=(0,x.getSql)(),r=await e.json().catch(()=>({})),i=$.safeParse(r);if(i.success)try{let e=await (0,v.consumeVerificationToken)(t,i.data.token);if(!e)return(0,b.apiError)("invalid_or_expired_token",{status:400});return await (0,E.createNotification)(t,{userId:e.userId,type:"system",title:"Email Verified",body:"Your email address has been verified. You now have Basic KYC access."}),await t`
        UPDATE app_user
        SET kyc_level = CASE WHEN kyc_level = 'none' THEN 'basic' ELSE kyc_level END,
            email_verified = true
        WHERE id = ${e.userId}::uuid
      `,Response.json({ok:!0,verified:!0})}catch(t){let e=(0,R.responseForDbError)("account.verify-email.consume",t);if(e)return e;throw t}if(T.safeParse(r).success){let r=(0,w.getActingUserId)(e),i=(0,w.requireActingUserIdInProd)(r);if(i)return(0,b.apiError)(i);if(!r)return(0,b.apiError)("unauthorized",{status:401});try{let i,a=await t`
        SELECT email_verified, email FROM app_user WHERE id = ${r} LIMIT 1
      `;if(0===a.length)return(0,b.apiError)("user_not_found");if(a[0].email_verified)return(0,b.apiError)("already_verified",{status:409});let n=await (0,v.createVerificationToken)(t,r),o=e.headers.get("origin")??"http://localhost:3000"??"http://localhost:3010",s=`${o}/verify-email?token=${n}`,l=a[0].email,d=(0,S.verificationEmail)(s);try{i=await (0,k.sendMail)({to:l,subject:d.subject,text:d.text,html:d.html})}catch(e){return console.error("[verify-email] Failed to send verification email:",e instanceof Error?e.message:e),(0,b.apiError)("upstream_unavailable",{details:"Email delivery failed. Please try again later."})}return Response.json({ok:!0,message:i.sent?"Verification email sent":"Verification email sent (demo: link below)",...{},email:l})}catch(t){let e=(0,R.responseForDbError)("account.verify-email.resend",t);if(e)return e;throw t}}return(0,b.apiError)("invalid_input")}e.s(["POST",()=>A,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],208016);var I=e.i(208016);let C=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/account/verify-email/route",pathname:"/api/account/verify-email",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/account/verify-email/route.ts",nextConfigOutput:"",userland:I}),{workAsyncStorage:N,workUnitAsyncStorage:O,serverHooks:M}=C;function q(){return(0,i.patchFetch)({workAsyncStorage:N,workUnitAsyncStorage:O})}async function P(e,t,i){C.isDev&&(0,a.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/account/verify-email/route";g=g.replace(/\/index$/,"")||"/";let x=await C.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==i.waitUntil||i.waitUntil.call(i,Promise.resolve()),null;let{buildId:b,params:w,nextConfig:v,parsedUrl:E,isDraftMode:R,prerenderManifest:k,routerServerContext:S,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:I,serverActionsManifest:N}=x,O=(0,s.normalizeAppPath)(g),M=!!(k.dynamicRoutes[O]||k.routes[A]),q=async()=>((null==S?void 0:S.render404)?await S.render404(e,t,E,!1):t.end("This page could not be found"),null);if(M&&!R){let e=!!k.routes[A],t=k.dynamicRoutes[O];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await q();throw new y.NoFallbackError}}let P=null;!M||C.isDev||R||(P="/index"===(P=A)?"/":P);let D=!0===C.isDev||!M,U=M&&!D;N&&I&&(0,o.setManifestsSingleton)({page:g,clientReferenceManifest:I,serverActionsManifest:N});let j=e.method||"GET",L=(0,n.getTracer)(),H=L.getActiveScopeSpan(),z={params:w,prerenderManifest:k,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:D,incrementalCache:(0,a.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:i.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,i,a)=>C.onRequestError(e,t,i,a,S)},sharedContext:{buildId:b}},F=new l.NodeNextRequest(e),V=new l.NodeNextResponse(t),W=d.NextRequestAdapter.fromNodeNextRequest(F,(0,d.signalFromNodeResponse)(t));try{let o=async e=>C.handle(W,z).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=L.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let i=r.get("next.route");if(i){let t=`${j} ${i}`;e.setAttributes({"next.route":i,"http.route":i,"next.span_name":t}),e.updateName(t)}else e.updateName(`${j} ${g}`)}),s=!!(0,a.getRequestMeta)(e,"minimalMode"),l=async a=>{var n,l;let d=async({previousCacheEntry:r})=>{try{if(!s&&$&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await o(a);e.fetchMetrics=z.renderOpts.fetchMetrics;let l=z.renderOpts.pendingWaitUntil;l&&i.waitUntil&&(i.waitUntil(l),l=void 0);let d=z.renderOpts.collectedTags;if(!M)return await (0,p.sendResponse)(F,V,n,z.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,f.toNodeOutgoingHttpHeaders)(n.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==z.renderOpts.collectedRevalidate&&!(z.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&z.renderOpts.collectedRevalidate,i=void 0===z.renderOpts.collectedExpire||z.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:z.renderOpts.collectedExpire;return{value:{kind:h.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:i}}}}catch(t){throw(null==r?void 0:r.isStale)&&await C.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:$})},!1,S),t}},c=await C.handleResponse({req:e,nextConfig:v,cacheKey:P,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:k,isRoutePPREnabled:!1,isOnDemandRevalidate:$,revalidateOnlyGenerated:T,responseGenerator:d,waitUntil:i.waitUntil,isMinimalMode:s});if(!M)return null;if((null==c||null==(n=c.value)?void 0:n.kind)!==h.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",$?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let y=(0,f.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&M||y.delete(m.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||y.get("Cache-Control")||y.set("Cache-Control",(0,_.getCacheControlHeader)(c.cacheControl)),await (0,p.sendResponse)(F,V,new Response(c.value.body,{headers:y,status:c.value.status||200})),null};H?await l(H):await L.withPropagatedContext(e.headers,()=>L.trace(c.BaseServerSpan.handleRequest,{spanName:`${j} ${g}`,kind:n.SpanKind.SERVER,attributes:{"http.method":j,"http.target":e.url}},l))}catch(t){if(t instanceof y.NoFallbackError||await C.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:U,isOnDemandRevalidate:$})},!1,S),M)throw t;return await (0,p.sendResponse)(F,V,new Response(null,{status:500})),null}}e.s(["handler",()=>P,"patchFetch",()=>q,"routeModule",()=>C,"serverHooks",()=>M,"workAsyncStorage",()=>N,"workUnitAsyncStorage",()=>O],779458)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__caeee84e._.js.map