module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(a,{status:r,headers:i})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let i=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&i.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(i){var a;if(!r(i))throw i;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function i(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>i,"retryOnceOnTransientDbError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),i=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(i))}return t}function s(e){return n(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(n),"utf8")),o=i(e.secret,s);return`${s}.${o}`}function d(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,n),o=a.slice(n+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let d=i(e.secret,s),l=Buffer.from(o),c=Buffer.from(d);if(l.length!==c.length||!(0,t.timingSafeEqual)(l,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function l(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>l,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function i(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>i,"requireActingUserIdInProd",()=>a])},583627,e=>{"use strict";var t=e.i(977775),r=e.i(300959),a=e.i(691180);async function i(e,r){let a=(0,t.getActingUserId)(r);if(!a)return{ok:!1,error:"auth_required"};let i=await e`
    SELECT role FROM app_user WHERE id = ${a}::uuid LIMIT 1
  `;return 0===i.length?{ok:!1,error:"user_not_found"}:"admin"!==i[0].role?{ok:!1,error:"admin_required"}:{ok:!0,userId:a}}async function n(e,t){let n=(0,a.getSessionTokenFromRequest)(t),s=await i(e,t);if(s.ok)return s;if("user_not_found"===s.error||"auth_required"===s.error){let e=n?{"set-cookie":(0,a.serializeClearSessionCookie)({secure:!0})}:void 0;return{ok:!1,response:(0,r.apiError)("auth_required",{headers:e})}}return{ok:!1,response:(0,r.apiError)(s.error)}}e.s(["requireAdminForApi",()=>n])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(r,Math.trunc(i))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var s;let o,d,l,c,u,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(i.title??"").trim()||"Notification",E=String(i.body??""),m=(s=i.type,(d=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(l=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=l),(c=t(o,"tx_hash","txHash"))&&(o.tx_hash=c),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(u=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),i=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&u.startsWith("/")&&(o.href=u),o);if("system"!==i.type){let t=await a(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*a),n=60*i.getUTCHours()+i.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?n>=s&&n<o:n>=s||n<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${f}, ${E}, ${m}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let g="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${f},
        ${E},
        ${m}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];g=t.id;try{let r=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:f,body:E,metadata_json:m,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${i.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${f}`,a=E?`${f}

${E}`:f,s=E?`<p><strong>${n(f)}</strong></p><p>${n(E)}</p>`:`<p><strong>${n(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${i.userId}::uuid,
            ${r},
            'notification',
            ${i.type},
            ${t},
            ${a},
            ${s},
            ${m}::jsonb
          )
        `}}catch{}return g}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}async function l(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>s,"markAllRead",()=>l,"markRead",()=>d])},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let r=String(process.env[t]??"").trim();r&&r.length>=8&&e.push(r)}return e}();function r(e){let r=e;for(let e of t)e&&r.includes(e)&&(r=r.split(e).join("[REDACTED]"));return r}function a(e,t,a){var i;let n,s=e.headers.get("x-request-id")??"unknown",o=new URL(e.url,"http://localhost");n={...i={requestId:s,method:e.method,path:o.pathname,status:t.status,durationMs:Date.now()-a.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:a.userId??null,meta:a.meta,ts:new Date().toISOString()},userAgent:i.userAgent?r(i.userAgent):i.userAgent,meta:i.meta?function e(t,a){if(a>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return r(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,a+1));if("object"==typeof t){let r={},i=0;for(let[n,s]of Object.entries(t)){if((i+=1)>80){r.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(n)?r[n]=e(s,a+1):r[n]="[REDACTED]"}return r}return String(t)}(i.meta,0):i.meta},process.stdout.write(JSON.stringify(n)+"\n")}e.s(["logRouteResponse",()=>a],371276)},361179,e=>{"use strict";async function t(e,t){let r=t.visible_at??new Date,a=JSON.stringify(t.payload??{});return(await e`
    INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json, visible_at)
    VALUES (
      ${t.topic},
      ${t.aggregate_type??null},
      ${t.aggregate_id??null},
      (
        CASE
          WHEN jsonb_typeof(((${a}::jsonb #>> '{}')::jsonb)) = 'object'
            THEN ((${a}::jsonb #>> '{}')::jsonb)
          ELSE jsonb_build_object('value', ((${a}::jsonb #>> '{}')::jsonb))
        END
      ),
      ${r}
    )
    RETURNING id
  `)[0].id}async function r(e,t){let r=Math.max(1,Math.min(500,Math.floor(t.limit))),a=Math.max(5,Math.min(600,Math.floor(t.lockTtlSeconds??30))),i=t.topics?.length?t.topics:null;return i?await e`
    WITH picked AS (
      SELECT id
      FROM app_outbox_event
      WHERE processed_at IS NULL
        AND dead_lettered_at IS NULL
        AND visible_at <= now()
        AND (
          locked_at IS NULL
          OR locked_at < (now() - make_interval(secs => ${a}))
        )
        AND topic = ANY(${e.array(i)})
      ORDER BY visible_at ASC, created_at ASC, id ASC
      LIMIT ${r}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE app_outbox_event o
    SET locked_at = now(), lock_id = ${t.lockId}::uuid
    FROM picked
    WHERE o.id = picked.id
    RETURNING
      o.id,
      o.topic,
      o.aggregate_type,
      o.aggregate_id,
      o.payload_json,
      o.attempts,
      o.last_error,
      o.visible_at,
      o.locked_at,
      o.lock_id,
      o.created_at,
      o.processed_at
  `:await e`
      WITH picked AS (
        SELECT id
        FROM app_outbox_event
        WHERE processed_at IS NULL
          AND dead_lettered_at IS NULL
          AND visible_at <= now()
          AND (
            locked_at IS NULL
            OR locked_at < (now() - make_interval(secs => ${a}))
          )
        ORDER BY visible_at ASC, created_at ASC, id ASC
        LIMIT ${r}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE app_outbox_event o
      SET locked_at = now(), lock_id = ${t.lockId}::uuid
      FROM picked
      WHERE o.id = picked.id
      RETURNING
        o.id,
        o.topic,
        o.aggregate_type,
        o.aggregate_id,
        o.payload_json,
        o.attempts,
        o.last_error,
        o.visible_at,
        o.locked_at,
        o.lock_id,
        o.created_at,
        o.processed_at
    `}async function a(e,t){await e`
    UPDATE app_outbox_event
    SET processed_at = now(), locked_at = NULL, lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND lock_id = ${t.lockId}::uuid
      AND processed_at IS NULL
  `}async function i(e,t){let r=n(t.error);await e`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${r},
      visible_at = ${t.nextVisibleAt.toISOString()},
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND lock_id = ${t.lockId}::uuid
      AND processed_at IS NULL
  `}function n(e){if(e instanceof Error)return e.message||e.name;if("string"==typeof e)return e;try{return JSON.stringify(e)}catch{return String(e)}}async function s(e,t){let r=n(t.error);await e`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${r},
      dead_lettered_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND lock_id = ${t.lockId}::uuid
      AND processed_at IS NULL
  `}async function o(e,t){return(await e`
    UPDATE app_outbox_event
    SET
      dead_lettered_at = NULL,
      locked_at = NULL,
      lock_id = NULL,
      visible_at = now(),
      attempts = 0,
      last_error = NULL
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `).length>0}async function d(e,t){let r=Math.max(1,Math.min(200,Math.floor(t?.limit??50))),a=Math.max(0,Math.floor(t?.offset??0)),i=t?.topic??null;return i?e`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${i}
      ORDER BY dead_lettered_at DESC
      LIMIT ${r} OFFSET ${a}
    `:e`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    ORDER BY dead_lettered_at DESC
    LIMIT ${r} OFFSET ${a}
  `}async function l(e,t){let r=t?.topic??null,a=r?await e`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
          AND topic = ${r}
      `:await e`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
      `;return a[0]?.total??0}async function c(e,t){return(await e`
    UPDATE app_outbox_event
    SET
      processed_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `).length>0}async function u(e,t){return(await e`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
    LIMIT 1
  `)[0]??null}e.s(["ackOutbox",()=>a,"claimOutboxBatch",()=>r,"countDeadLetters",()=>l,"deadLetterOutbox",()=>s,"enqueueOutbox",()=>t,"failOutbox",()=>i,"getDeadLetterById",()=>u,"listDeadLetters",()=>d,"resolveDeadLetter",()=>c,"retryDeadLetter",()=>o,"stringifyUnknownError",()=>n])},781579,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),i=e.i(759756),n=e.i(561916),s=e.i(174677),o=e.i(869741),d=e.i(316795),l=e.i(487718),c=e.i(995169),u=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),E=e.i(10372),m=e.i(193695);e.i(52474);var g=e.i(600220),h=e.i(469719),y=e.i(843793),w=e.i(300959),R=e.i(361179),S=e.i(184883),N=e.i(583627),b=e.i(371276),x=e.i(90878),A=e.i(194748);let T=h.z.string().uuid(),v=h.z.object({reason:h.z.string().min(1).max(500).optional(),rejected_by:h.z.string().min(1).max(200).optional()}).optional();async function I(e,{params:t}){let r,a=Date.now(),i=(0,y.getSql)(),n=await (0,N.requireAdminForApi)(i,e);if(!n.ok)return n.response;let{id:s}=await t;try{T.parse(s)}catch(e){return(0,w.apiZodError)(e)??(0,w.apiError)("invalid_input")}let o=await e.json().catch(()=>({}));try{r=v.parse(o)}catch(e){return(0,w.apiZodError)(e)??(0,w.apiError)("invalid_input")}let d=r?.rejected_by??n.userId;try{let t=await i.begin(async e=>{let t=await e`
      SELECT id, status, hold_id, user_id::text AS user_id, amount::text AS amount
      FROM ex_withdrawal_request
      WHERE id = ${s}
      LIMIT 1
    `;if(0===t.length)return{status:404,body:{error:"not_found"}};let a=t[0];if("rejected"===a.status)return{status:200,body:{ok:!0,withdrawal_id:s,status:"rejected"}};if("approved"===a.status||"broadcasted"===a.status||"confirmed"===a.status||"requested"!==a.status&&"needs_review"!==a.status)return{status:409,body:{error:"trade_state_conflict",details:{current_status:a.status}}};let i=r?.reason??"rejected",n=await e`
      UPDATE ex_withdrawal_request
      SET status = 'rejected', failure_reason = ${i}, approved_by = ${d}, approved_at = now(), updated_at = now()
      WHERE id = ${s} AND status IN ('requested','needs_review')
      RETURNING id
    `;return 0===n.length?{status:409,body:{error:"trade_state_conflict"}}:(a.hold_id&&await e`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${a.hold_id} AND status = 'active'
      `,await (0,R.enqueueOutbox)(e,{topic:"ex.withdrawal.rejected",aggregate_type:"withdrawal",aggregate_id:s,payload:{withdrawal_id:s,rejected_by:d,reason:r?.reason??"rejected",status:"rejected"}}),await (0,A.createNotification)(e,{userId:a.user_id,type:"withdrawal_rejected",title:"Withdrawal Rejected",body:`Your withdrawal of ${a.amount} was rejected${r?.reason?`: ${r.reason}`:"."}`,metadata:{withdrawalId:s,reason:r?.reason??"rejected"}}),{status:200,body:{ok:!0,withdrawal_id:s,status:"rejected"}})}),n=t.body;if("string"==typeof n.error)return(0,w.apiError)(n.error,{status:t.status,details:n.details});let o=Response.json(t.body,{status:t.status});(0,b.logRouteResponse)(e,o,{startMs:a,meta:{withdrawalId:s,rejectedBy:d}});try{await (0,x.writeAuditLog)(i,{actorType:"admin",action:"withdrawal.rejected",resourceType:"withdrawal",resourceId:s,...(0,x.auditContextFromRequest)(e),detail:{rejected_by:d,reason:r?.reason??"rejected"}})}catch{}return o}catch(t){let e=(0,S.responseForDbError)("exchange.admin.withdrawals.reject",t);if(e)return e;throw t}}e.s(["POST",()=>I,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],206535);var k=e.i(206535);let L=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/exchange/admin/withdrawals/[id]/reject/route",pathname:"/api/exchange/admin/withdrawals/[id]/reject",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/admin/withdrawals/[id]/reject/route.ts",nextConfigOutput:"",userland:k}),{workAsyncStorage:O,workUnitAsyncStorage:C,serverHooks:D}=L;function $(){return(0,a.patchFetch)({workAsyncStorage:O,workUnitAsyncStorage:C})}async function U(e,t,a){L.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/exchange/admin/withdrawals/[id]/reject/route";h=h.replace(/\/index$/,"")||"/";let y=await L.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:w,params:R,nextConfig:S,parsedUrl:N,isDraftMode:b,prerenderManifest:x,routerServerContext:A,isOnDemandRevalidate:T,revalidateOnlyGenerated:v,resolvedPathname:I,clientReferenceManifest:k,serverActionsManifest:O}=y,C=(0,o.normalizeAppPath)(h),D=!!(x.dynamicRoutes[C]||x.routes[I]),$=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,N,!1):t.end("This page could not be found"),null);if(D&&!b){let e=!!x.routes[I],t=x.dynamicRoutes[C];if(t&&!1===t.fallback&&!e){if(S.experimental.adapterPath)return await $();throw new m.NoFallbackError}}let U=null;!D||L.isDev||b||(U="/index"===(U=I)?"/":U);let j=!0===L.isDev||!D,M=D&&!j;O&&k&&(0,s.setManifestsSingleton)({page:h,clientReferenceManifest:k,serverActionsManifest:O});let P=e.method||"GET",q=(0,n.getTracer)(),H=q.getActiveScopeSpan(),F={params:R,prerenderManifest:x,renderOpts:{experimental:{authInterrupts:!!S.experimental.authInterrupts},cacheComponents:!!S.cacheComponents,supportsDynamicResponse:j,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:S.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>L.onRequestError(e,t,a,i,A)},sharedContext:{buildId:w}},W=new d.NodeNextRequest(e),K=new d.NodeNextResponse(t),B=l.NextRequestAdapter.fromNodeNextRequest(W,(0,l.signalFromNodeResponse)(t));try{let s=async e=>L.handle(B,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=q.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${P} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${P} ${h}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),d=async i=>{var n,d;let l=async({previousCacheEntry:r})=>{try{if(!o&&T&&v&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await s(i);e.fetchMetrics=F.renderOpts.fetchMetrics;let d=F.renderOpts.pendingWaitUntil;d&&a.waitUntil&&(a.waitUntil(d),d=void 0);let l=F.renderOpts.collectedTags;if(!D)return await (0,_.sendResponse)(W,K,n,F.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);l&&(t[E.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,a=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await L.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,A),t}},c=await L.handleResponse({req:e,nextConfig:S,cacheKey:U,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:x,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:v,responseGenerator:l,waitUntil:a.waitUntil,isMinimalMode:o});if(!D)return null;if((null==c||null==(n=c.value)?void 0:n.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(d=c.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",T?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),b&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let m=(0,p.fromNodeOutgoingHttpHeaders)(c.value.headers);return o&&D||m.delete(E.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||m.get("Cache-Control")||m.set("Cache-Control",(0,f.getCacheControlHeader)(c.cacheControl)),await (0,_.sendResponse)(W,K,new Response(c.value.body,{headers:m,status:c.value.status||200})),null};H?await d(H):await q.withPropagatedContext(e.headers,()=>q.trace(c.BaseServerSpan.handleRequest,{spanName:`${P} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":P,"http.target":e.url}},d))}catch(t){if(t instanceof m.NoFallbackError||await L.onRequestError(e,t,{routerKind:"App Router",routePath:C,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,A),D)throw t;return await (0,_.sendResponse)(W,K,new Response(null,{status:500})),null}}e.s(["handler",()=>U,"patchFetch",()=>$,"routeModule",()=>L,"serverHooks",()=>D,"workAsyncStorage",()=>O,"workUnitAsyncStorage",()=>C],781579)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__6834663d._.js.map