module.exports=[324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let s=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||s.has("Retry-After")||s.set("Retry-After","3"),Response.json(a,{status:r,headers:s})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function s(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>s,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function s(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function i(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),s=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(s))}return t}function n(e){return i(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,i={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},n=a(Buffer.from(JSON.stringify(i),"utf8")),o=s(e.secret,n);return`${n}.${o}`}function d(e){let r,a=e.token.trim(),i=a.indexOf(".");if(i<=0)return{ok:!1,error:"session_token_invalid"};let n=a.slice(0,i),o=a.slice(i+1);if(!n||!o)return{ok:!1,error:"session_token_invalid"};let d=s(e.secret,n),c=Buffer.from(o),_=Buffer.from(d);if(c.length!==_.length||!(0,t.timingSafeEqual)(c,_))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=n.length%4,t=(n+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function c(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function _(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>n,"parseCookieHeader",()=>i,"serializeClearSessionCookie",()=>_,"serializeSessionCookie",()=>c,"verifySessionToken",()=>d])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===r.length?"user_not_found":"active"!==r[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let s="number"==typeof e?e:Number(String(e??""));return Number.isFinite(s)?Math.max(t,Math.min(r,Math.trunc(s))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function s(e,s){var n;let o,d,c,_,u,l=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${s.userId}::uuid
        AND type = ${s.type}
      LIMIT 1
    `;t.length>0&&(l=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!l&&!p)return"";let f=String(s.title??"").trim()||"Notification",m=String(s.body??""),y=(n=s.type,(d=t(o={...s.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(c=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=c),(_=t(o,"tx_hash","txHash"))&&(o.tx_hash=_),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(n)),(u=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),s=t(r,"withdrawal_id","withdrawalId"),i=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(s&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return i?`/p2p?side=SELL&asset=${encodeURIComponent(i)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(n,o))&&u.startsWith("/")&&(o.href=u),o);if("system"!==s.type){let t=await a(e,s.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),s=new Date(t.getTime()+6e4*a),i=60*s.getUTCHours()+s.getUTCMinutes(),n=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return n===o||(n<o?i>=n&&i<o:i>=n||i<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${s.userId}::uuid, ${s.type}, ${f}, ${m}, ${y}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let w="";if(l){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${s.userId}::uuid,
        ${s.type},
        ${f},
        ${m},
        ${y}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];w=t.id;try{let r=JSON.stringify({id:t.id,user_id:s.userId,type:s.type,title:f,body:m,metadata_json:y,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${s.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${f}`,a=m?`${f}

${m}`:f,n=m?`<p><strong>${i(f)}</strong></p><p>${i(m)}</p>`:`<p><strong>${i(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${s.userId}::uuid,
            ${r},
            'notification',
            ${s.type},
            ${t},
            ${a},
            ${n},
            ${y}::jsonb
          )
        `}}catch{}return w}function i(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function n(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
    SELECT id, type, title, body, metadata_json, read, created_at
    FROM ex_notification
    WHERE user_id = ${t.userId}::uuid
      ${t.unreadOnly?e`AND read = false`:e``}
    ORDER BY created_at DESC
    LIMIT ${r}
  `}async function o(e,t){let r=await e`
    SELECT count(*)::text AS count
    FROM ex_notification
    WHERE user_id = ${t}::uuid AND read = false
  `;return Number(r[0]?.count??"0")}async function d(e,t){return 0===t.ids.length?0:(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t.userId}::uuid
      AND id = ANY(${t.ids}::uuid[])
      AND read = false
  `).count}async function c(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>s,"listNotifications",()=>n,"markAllRead",()=>c,"markRead",()=>d])},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,s=t.max??60;return{consume:async function(t){let i=(await e`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${r}, ${t}, ${s-1}, ${a}, ${s}, now())
      ON CONFLICT (name, key)
      DO UPDATE SET
        tokens = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN ${s-1}
          ELSE GREATEST(rate_limit_bucket.tokens - 1, -1)
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN now()
          ELSE rate_limit_bucket.window_start
        END,
        window_ms   = ${a},
        max_tokens  = ${s}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `)[0],n=Number(i.window_start_ms)+a,o=Math.max(0,i.tokens);return{allowed:i.tokens>=0,remaining:o,resetMs:n,limit:s}},name:r}}e.s(["createPgRateLimiter",()=>t])},891454,e=>{"use strict";var t=e.i(300959),r=e.i(691180);async function a(e,a){let s=String(process.env.PROOFPACK_SESSION_SECRET??"").trim();if(s){let i=(0,r.getSessionTokenFromRequest)(a);if(i){let a=(0,r.verifySessionToken)({token:i,secret:s});if(!a.ok)return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};let n=a.payload.uid,o=Math.max(0,Math.trunc(Number(a.payload.sv??0)||0));try{let r=await e`
          SELECT session_version
          FROM app_user
          WHERE id = ${n}::uuid
          LIMIT 1
        `;if(!r[0])return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};if(Math.max(0,Math.trunc(Number(r[0].session_version??0)||0))!==o)return{ok:!1,response:(0,t.apiError)("session_revoked",{status:401})}}catch{return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}return{ok:!0,userId:n}}}else if(1)return{ok:!1,response:(0,t.apiError)("session_secret_not_configured")};let i=String(process.env.INTERNAL_SERVICE_SECRET??"").trim();if(i){let e=String(a.headers.get("x-internal-service-token")??"").trim();if(e&&e===i){let e=String(a.headers.get("x-user-id")??"").trim();if(e&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(e))return{ok:!0,userId:e}}}return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}e.s(["requireSessionUserId",()=>a])},794383,e=>{"use strict";function t(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function r(e){return"string"==typeof e?e.trim().length>0:"number"==typeof e?Number.isFinite(e):"boolean"==typeof e}function a(e){if(!Array.isArray(e))return[];let r=[];for(let a of e){if(!t(a))continue;let e="string"==typeof a.identifier?a.identifier.trim():"",s="string"==typeof a.name?a.name.trim():e,i="string"==typeof a.id?a.id:void 0,n=t(a.details)?a.details:null;(e||s)&&r.push({id:i,identifier:e||s,name:s||e,details:n})}return r}function s(e){return!!e.length&&e.some(e=>!!e.details&&!!t(e.details)&&Object.values(e.details).some(r))}e.s(["hasUsablePaymentDetails",()=>s,"normalizePaymentMethodSnapshot",()=>a])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__c722a1f2._.js.map