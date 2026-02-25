module.exports=[918622,(e,t,a)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,a)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,a)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,a)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,a)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,a)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,a)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,a)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,a)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function a(e,t){let a=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),r={error:e};"string"==typeof t?.details?(r.message=t.details,r.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(r.details=t.details,"message"in t.details&&(r.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(r,{status:a,headers:i})}function r(e){return e instanceof t.ZodError?a("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return a("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>a,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>r])},184883,e=>{"use strict";var t=e.i(300959);function a(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),a=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),r=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&r.has(t))return!0;let i=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&i.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(a))}async function r(e,t){try{return await e()}catch(i){var r;if(!a(i))throw i;return await (r=t?.delayMs??50,new Promise(e=>setTimeout(e,r))),await e()}}function i(e,r){return a(r)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>a,"responseForDbError",()=>i,"retryOnceOnTransientDbError",()=>r])},666680,(e,t,a)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let a="pp_session";function r(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,a){return r((0,t.createHmac)("sha256",e).update(a,"utf8").digest())}function s(e){if(!e)return{};let t={};for(let a of e.split(/;\s*/g)){let e=a.indexOf("=");if(e<=0)continue;let r=a.slice(0,e).trim(),i=a.slice(e+1).trim();r&&(t[r]=decodeURIComponent(i))}return t}function n(e){return s(e.headers.get("cookie"))[a]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),a="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,s={uid:e.userId,iat:t,exp:t+a,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},n=r(Buffer.from(JSON.stringify(s),"utf8")),o=i(e.secret,n);return`${n}.${o}`}function d(e){let a,r=e.token.trim(),s=r.indexOf(".");if(s<=0)return{ok:!1,error:"session_token_invalid"};let n=r.slice(0,s),o=r.slice(s+1);if(!n||!o)return{ok:!1,error:"session_token_invalid"};let d=i(e.secret,n),l=Buffer.from(o),u=Buffer.from(d);if(l.length!==u.length||!(0,t.timingSafeEqual)(l,u))return{ok:!1,error:"session_token_invalid"};try{let e,t;a=JSON.parse((e=n.length%4,t=(n+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!a||"object"!=typeof a||"string"!=typeof a.uid||!a.uid||"number"!=typeof a.exp||!Number.isFinite(a.exp))return{ok:!1,error:"session_token_invalid"};if(null!=a.sv){let e=Number(a.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};a.sv=Math.max(0,Math.trunc(e))}let c=Math.floor((e.now??Date.now())/1e3);return a.exp<=c?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:a}}function l(e){let t=[`${a}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function u(e){let t=[`${a}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>n,"parseCookieHeader",()=>s,"serializeClearSessionCookie",()=>u,"serializeSessionCookie",()=>l,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function a(e){let a=process.env.PROOFPACK_SESSION_SECRET??"";if(a){let r=(0,t.getSessionTokenFromRequest)(e);if(r){let e=(0,t.verifySessionToken)({token:r,secret:a});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let r=process.env.INTERNAL_SERVICE_SECRET;if(r){let t=e.headers.get("x-internal-service-token");if(t&&t===r){let t=e.headers.get("x-user-id");if(t)return t}}return null}function r(e){return e?null:"missing_x_user_id"}function i(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>a,"isParty",()=>i,"requireActingUserIdInProd",()=>r])},406461,(e,t,a)=>{t.exports=e.x("zlib",()=>require("zlib"))},921517,(e,t,a)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,a)=>{t.exports=e.x("https",()=>require("https"))},792509,(e,t,a)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,a)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,a)=>{t.exports=e.x("buffer",()=>require("buffer"))},583627,e=>{"use strict";var t=e.i(977775),a=e.i(300959),r=e.i(691180);async function i(e,a){let r=(0,t.getActingUserId)(a);if(!r)return{ok:!1,error:"auth_required"};let i=await e`
    SELECT role FROM app_user WHERE id = ${r}::uuid LIMIT 1
  `;return 0===i.length?{ok:!1,error:"user_not_found"}:"admin"!==i[0].role?{ok:!1,error:"admin_required"}:{ok:!0,userId:r}}async function s(e,t){let s=(0,r.getSessionTokenFromRequest)(t),n=await i(e,t);if(n.ok)return n;if("user_not_found"===n.error||"auth_required"===n.error){let e=s?{"set-cookie":(0,r.serializeClearSessionCookie)({secure:!0})}:void 0;return{ok:!1,response:(0,a.apiError)("auth_required",{headers:e})}}return{ok:!1,response:(0,a.apiError)(n.error)}}e.s(["requireAdminForApi",()=>s])},194748,e=>{"use strict";function t(e,...a){for(let t of a){let a=e[t];if("string"==typeof a&&a.trim())return a}return null}function a(e,t,a,r){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(a,Math.trunc(i))):r}async function r(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var n;let o,d,l,u,c,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(i.title??"").trim()||"Notification",E=String(i.body??""),h=(n=i.type,(d=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(l=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=l),(u=t(o,"tx_hash","txHash"))&&(o.tx_hash=u),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(n)),(c=t(o,"href")??function(e,a){let r=t(a,"order_id","orderId"),i=t(a,"withdrawal_id","withdrawalId"),s=t(a,"asset_symbol","assetSymbol","symbol");if(r&&e.startsWith("p2p_"))return`/p2p/orders/${r}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return s?`/p2p?side=SELL&asset=${encodeURIComponent(s)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(n,o))&&c.startsWith("/")&&(o.href=c),o);if("system"!==i.type){let t=await r(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let r=a(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*r),s=60*i.getUTCHours()+i.getUTCMinutes(),n=a(e.quiet_start_min,0,1439,1320),o=a(e.quiet_end_min,0,1439,480);return n===o||(n<o?s>=n&&s<o:s>=n||s<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${f}, ${E}, ${h}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let w="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${f},
        ${E},
        ${h}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];w=t.id;try{let a=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:f,body:E,metadata_json:h,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${a})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${i.userId}::uuid
        LIMIT 1
      `)[0],a=t?.email?String(t.email).trim().toLowerCase():"",r=t?.email_verified===!0;if(a&&a.includes("@")&&r){let t=`[Coinwaka] ${f}`,r=E?`${f}

${E}`:f,n=E?`<p><strong>${s(f)}</strong></p><p>${s(E)}</p>`:`<p><strong>${s(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${i.userId}::uuid,
            ${a},
            'notification',
            ${i.type},
            ${t},
            ${r},
            ${n},
            ${h}::jsonb
          )
        `}}catch{}return w}function s(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function n(e,t){let a=Math.max(1,Math.min(200,t.limit??50));return await e`
    SELECT id, type, title, body, metadata_json, read, created_at
    FROM ex_notification
    WHERE user_id = ${t.userId}::uuid
      ${t.unreadOnly?e`AND read = false`:e``}
    ORDER BY created_at DESC
    LIMIT ${a}
  `}async function o(e,t){let a=await e`
    SELECT count(*)::text AS count
    FROM ex_notification
    WHERE user_id = ${t}::uuid AND read = false
  `;return Number(a[0]?.count??"0")}async function d(e,t){return 0===t.ids.length?0:(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t.userId}::uuid
      AND id = ANY(${t.ids}::uuid[])
      AND read = false
  `).count}async function l(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>n,"markAllRead",()=>l,"markRead",()=>d])},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function a(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>a,"writeAuditLog",()=>t])},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let a=String(process.env[t]??"").trim();a&&a.length>=8&&e.push(a)}return e}();function a(e){let a=e;for(let e of t)e&&a.includes(e)&&(a=a.split(e).join("[REDACTED]"));return a}function r(e,t,r){var i;let s,n=e.headers.get("x-request-id")??"unknown",o=new URL(e.url,"http://localhost");s={...i={requestId:n,method:e.method,path:o.pathname,status:t.status,durationMs:Date.now()-r.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:r.userId??null,meta:r.meta,ts:new Date().toISOString()},userAgent:i.userAgent?a(i.userAgent):i.userAgent,meta:i.meta?function e(t,r){if(r>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return a(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,r+1));if("object"==typeof t){let a={},i=0;for(let[s,n]of Object.entries(t)){if((i+=1)>80){a.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(s)?a[s]=e(n,r+1):a[s]="[REDACTED]"}return a}return String(t)}(i.meta,0):i.meta},process.stdout.write(JSON.stringify(s)+"\n")}e.s(["logRouteResponse",()=>r],371276)},361179,e=>{"use strict";async function t(e,t){let a=t.visible_at??new Date,r=JSON.stringify(t.payload??{});return(await e`
    INSERT INTO app_outbox_event (topic, aggregate_type, aggregate_id, payload_json, visible_at)
    VALUES (
      ${t.topic},
      ${t.aggregate_type??null},
      ${t.aggregate_id??null},
      (
        CASE
          WHEN jsonb_typeof(((${r}::jsonb #>> '{}')::jsonb)) = 'object'
            THEN ((${r}::jsonb #>> '{}')::jsonb)
          ELSE jsonb_build_object('value', ((${r}::jsonb #>> '{}')::jsonb))
        END
      ),
      ${a}
    )
    RETURNING id
  `)[0].id}async function a(e,t){let a=Math.max(1,Math.min(500,Math.floor(t.limit))),r=Math.max(5,Math.min(600,Math.floor(t.lockTtlSeconds??30))),i=t.topics?.length?t.topics:null;return i?await e`
    WITH picked AS (
      SELECT id
      FROM app_outbox_event
      WHERE processed_at IS NULL
        AND dead_lettered_at IS NULL
        AND visible_at <= now()
        AND (
          locked_at IS NULL
          OR locked_at < (now() - make_interval(secs => ${r}))
        )
        AND topic = ANY(${e.array(i)})
      ORDER BY visible_at ASC, created_at ASC, id ASC
      LIMIT ${a}
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
            OR locked_at < (now() - make_interval(secs => ${r}))
          )
        ORDER BY visible_at ASC, created_at ASC, id ASC
        LIMIT ${a}
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
    `}async function r(e,t){await e`
    UPDATE app_outbox_event
    SET processed_at = now(), locked_at = NULL, lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND lock_id = ${t.lockId}::uuid
      AND processed_at IS NULL
  `}async function i(e,t){let a=s(t.error);await e`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${a},
      visible_at = ${t.nextVisibleAt.toISOString()},
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND lock_id = ${t.lockId}::uuid
      AND processed_at IS NULL
  `}function s(e){if(e instanceof Error)return e.message||e.name;if("string"==typeof e)return e;try{return JSON.stringify(e)}catch{return String(e)}}async function n(e,t){let a=s(t.error);await e`
    UPDATE app_outbox_event
    SET
      attempts = attempts + 1,
      last_error = ${a},
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
  `).length>0}async function d(e,t){let a=Math.max(1,Math.min(200,Math.floor(t?.limit??50))),r=Math.max(0,Math.floor(t?.offset??0)),i=t?.topic??null;return i?e`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${i}
      ORDER BY dead_lettered_at DESC
      LIMIT ${a} OFFSET ${r}
    `:e`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    ORDER BY dead_lettered_at DESC
    LIMIT ${a} OFFSET ${r}
  `}async function l(e,t){let a=t?.topic??null,r=a?await e`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
          AND topic = ${a}
      `:await e`
        SELECT count(*)::int AS total FROM app_outbox_event
        WHERE dead_lettered_at IS NOT NULL
          AND processed_at IS NULL
      `;return r[0]?.total??0}async function u(e,t){return(await e`
    UPDATE app_outbox_event
    SET
      processed_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `).length>0}async function c(e,t){return(await e`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
    LIMIT 1
  `)[0]??null}e.s(["ackOutbox",()=>r,"claimOutboxBatch",()=>a,"countDeadLetters",()=>l,"deadLetterOutbox",()=>n,"enqueueOutbox",()=>t,"failOutbox",()=>i,"getDeadLetterById",()=>c,"listDeadLetters",()=>d,"resolveDeadLetter",()=>u,"retryDeadLetter",()=>o,"stringifyUnknownError",()=>s])},695184,e=>{"use strict";var t=e.i(56778),a=e.i(901323),r=e.i(10967);let i=["function balanceOf(address owner) view returns (uint256)","function transfer(address to, uint256 amount) returns (bool)","function decimals() view returns (uint8)","function symbol() view returns (string)","event Transfer(address indexed from, address indexed to, uint256 value)"],s={USDT:"0x55d398326f99059fF775485246999027B3197955"};function n(e){return s[e.toUpperCase()]??null}async function o(e){let r=(0,a.getBscReadProvider)(),i=await r.getBalance(e);return t.ethers.formatEther(i)}async function d(e,r){let s=(0,a.getBscReadProvider)(),n=new t.ethers.Contract(e,i,s),[o,d]=await Promise.all([n.balanceOf(r),n.decimals()]);return{balance:t.ethers.formatUnits(o,d),decimals:d}}async function l(e){let t=[];try{let a=await o(e);t.push({symbol:"BNB",balance:a,contractAddress:null})}catch{t.push({symbol:"BNB",balance:"0",contractAddress:null})}for(let a of["USDT"]){let r=n(a);if(r)try{let{balance:i}=await d(r,e);t.push({symbol:a,balance:i,contractAddress:r})}catch{t.push({symbol:a,balance:"0",contractAddress:r})}}return t}async function u(e,s,n,o,d=18){let l=(0,r.rankRpcUrls)("bsc"),c=0===Number("true")?97:56,_=t.ethers.Network.from({name:"bnb",chainId:c}),p=t.ethers.parseUnits(o,d),f=null;if(l.length<=1){let r=(0,a.getBscProvider)(),o=new t.ethers.Wallet(s,r),d=new t.ethers.Contract(e,i,o),l=await d.transfer(n,p);return await l.wait(1),{txHash:l.hash}}for(let a of l){let o=new t.ethers.JsonRpcProvider(a,_,{staticNetwork:_}),d=new t.ethers.Wallet(s,o),l=new t.ethers.Contract(e,i,d),u=Date.now();try{let e=await l.transfer(n,p);return(0,r.markRpcOk)(a,Date.now()-u),await e.wait(1).catch(()=>void 0),{txHash:e.hash}}catch(e){if((0,r.markRpcFail)(a),f=e,!(0,r.isLikelyRpcTransportError)(e))throw e}}throw f instanceof Error?f:Error("bsc_rpc_all_failed")}async function c(e,i,s){let n=(0,r.rankRpcUrls)("bsc"),o=0===Number("true")?97:56,d=t.ethers.Network.from({name:"bnb",chainId:o}),l=t.ethers.parseEther(s),u=null;if(n.length<=1){let r=(0,a.getBscProvider)(),s=new t.ethers.Wallet(e,r),n=await s.sendTransaction({to:i,value:l});return await n.wait(1),{txHash:n.hash}}for(let a of n){let s=new t.ethers.JsonRpcProvider(a,d,{staticNetwork:d}),n=new t.ethers.Wallet(e,s),o=Date.now();try{let e=await n.sendTransaction({to:i,value:l});return(0,r.markRpcOk)(a,Date.now()-o),await e.wait(1).catch(()=>void 0),{txHash:e.hash}}catch(e){if((0,r.markRpcFail)(a),u=e,!(0,r.isLikelyRpcTransportError)(e))throw e}}throw u instanceof Error?u:Error("bsc_rpc_all_failed")}e.s(["getAllBalances",()=>l,"getTokenAddress",()=>n,"getTokenBalance",()=>d,"sendBnb",()=>c,"sendToken",()=>u])},675677,e=>{"use strict";var t=e.i(56778);let a=null,r=null;function i(){let e=process.env.DEPLOYER_PRIVATE_KEY;if(!e)throw Error("DEPLOYER_PRIVATE_KEY is not set");return e.startsWith("0x")?e:`0x${e}`}function s(){return a||(a=new t.ethers.Wallet(i()).address.toLowerCase()),a}function n(){return r||(r=i()),r}e.s(["getHotWalletAddress",()=>s,"getHotWalletKey",()=>n])},654657,e=>{"use strict";var t=e.i(675677),a=e.i(695184),r=e.i(361179),i=e.i(194748);async function s(e,s){let o,{withdrawalId:d}=s,l=await e.begin(async e=>{let t=await e`
      UPDATE ex_withdrawal_request
      SET status = 'broadcasted', updated_at = now()
      WHERE id = ${d} AND status = 'approved'
      RETURNING
        id,
        user_id::text AS user_id,
        asset_id::text AS asset_id,
        amount::text AS amount,
        destination_address,
        hold_id::text AS hold_id,
        status
    `;return 0===t.length?null:t[0]});if(!l)return;let u=await e`
    SELECT id::text AS id, symbol, chain, contract_address, decimals
    FROM ex_asset
    WHERE id = ${l.asset_id}
    LIMIT 1
  `;if(0===u.length)return void await n(e,l,"asset_not_found");let c=u[0];try{let r=(0,t.getHotWalletKey)();if("BNB"!==c.symbol.toUpperCase()||c.contract_address){let t=c.contract_address??(0,a.getTokenAddress)(c.symbol);if(!t)return void await n(e,l,`no_contract_address_for_${c.symbol}`);o=(await (0,a.sendToken)(t,r,l.destination_address,l.amount,c.decimals)).txHash}else o=(await (0,a.sendBnb)(r,l.destination_address,l.amount)).txHash}catch(a){let t=a instanceof Error?a.message:String(a);await n(e,l,t);return}await e.begin(async e=>{await e`
      UPDATE ex_withdrawal_request
      SET status = 'confirmed', tx_hash = ${o}, updated_at = now()
      WHERE id = ${l.id}
    `,l.hold_id&&await e`
        UPDATE ex_hold
        SET status = 'consumed', remaining_amount = 0, released_at = now()
        WHERE id = ${l.hold_id} AND status = 'active'
      `;let t=await e`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${"00000000-0000-0000-0000-000000000001"}::uuid, ${l.asset_id}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `,a=await e`
      SELECT id FROM ex_ledger_account
      WHERE user_id = ${l.user_id}::uuid AND asset_id = ${l.asset_id}::uuid
      LIMIT 1
    `;if(a.length>0&&t.length>0){let r=(await e`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'withdrawal_settlement',
          ${"withdrawal:"+l.id},
          ${{withdrawal_id:l.id,tx_hash:o,asset:c.symbol}}::jsonb
        )
        RETURNING id
      `)[0].id;await e`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${r}, ${a[0].id}, ${l.asset_id}::uuid, (${l.amount}::numeric) * -1),
          (${r}, ${t[0].id}, ${l.asset_id}::uuid, (${l.amount}::numeric))
      `}await (0,r.enqueueOutbox)(e,{topic:"ex.withdrawal.confirmed",aggregate_type:"withdrawal",aggregate_id:l.id,payload:{withdrawal_id:l.id,user_id:l.user_id,tx_hash:o,asset_symbol:c.symbol,amount:l.amount}}),await (0,i.createNotification)(e,{userId:l.user_id,type:"withdrawal_completed",title:"Withdrawal Confirmed",body:`Your withdrawal of ${l.amount} ${c.symbol} has been confirmed. TX: ${o.slice(0,10)}…`,metadata:{withdrawalId:l.id,txHash:o}})})}async function n(e,t,a){await e.begin(async e=>{await e`
      UPDATE ex_withdrawal_request
      SET status = 'failed', failure_reason = ${a}, updated_at = now()
      WHERE id = ${t.id}
    `,t.hold_id&&await e`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${t.hold_id} AND status = 'active'
      `,await (0,r.enqueueOutbox)(e,{topic:"ex.withdrawal.failed",aggregate_type:"withdrawal",aggregate_id:t.id,payload:{withdrawal_id:t.id,user_id:t.user_id,failure_reason:a}}),await (0,i.createNotification)(e,{userId:t.user_id,type:"system",title:"Withdrawal Failed",body:`Your withdrawal of ${t.amount} could not be completed: ${a}`,metadata:{withdrawalId:t.id,failureReason:a}})})}e.s(["handleWithdrawalBroadcast",()=>s])},280973,e=>{"use strict";var t=e.i(747909),a=e.i(174017),r=e.i(996250),i=e.i(759756),s=e.i(561916),n=e.i(174677),o=e.i(869741),d=e.i(316795),l=e.i(487718),u=e.i(995169),c=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),E=e.i(10372),h=e.i(193695);e.i(52474);var w=e.i(600220),m=e.i(469719),g=e.i(843793),y=e.i(300959),R=e.i(184883),x=e.i(583627),S=e.i(371276),N=e.i(90878),b=e.i(654657);let T=m.z.string().uuid();async function A(e,{params:t}){let a=Date.now(),r=(0,g.getSql)(),i=await (0,x.requireAdminForApi)(r,e);if(!i.ok)return i.response;let{id:s}=await t;try{T.parse(s)}catch(e){return(0,y.apiZodError)(e)??(0,y.apiError)("invalid_input")}let n=await r`
    SELECT id, status
    FROM ex_withdrawal_request
    WHERE id = ${s}
    LIMIT 1
  `;if(0===n.length)return(0,y.apiError)("not_found",{status:404});let o=n[0];if("broadcasted"===o.status||"confirmed"===o.status||"failed"===o.status){let t=await r`
      SELECT status, tx_hash
      FROM ex_withdrawal_request
      WHERE id = ${s}
    `,i=Response.json({ok:!0,withdrawal_id:s,status:t[0]?.status??o.status,tx_hash:t[0]?.tx_hash??null});return(0,S.logRouteResponse)(e,i,{startMs:a,meta:{withdrawalId:s,idempotent:!0}}),i}if("approved"!==o.status)return(0,y.apiError)("trade_state_conflict",{status:409,details:{current_status:o.status,message:"Only approved withdrawals can be broadcast"}});try{await (0,b.handleWithdrawalBroadcast)(r,{withdrawalId:s});let t=await r`
      SELECT status, tx_hash
      FROM ex_withdrawal_request
      WHERE id = ${s}
    `,i=Response.json({ok:!0,withdrawal_id:s,status:t[0]?.status??"unknown",tx_hash:t[0]?.tx_hash??null});(0,S.logRouteResponse)(e,i,{startMs:a,meta:{withdrawalId:s}});try{await (0,N.writeAuditLog)(r,{actorType:"admin",action:"withdrawal.broadcast",resourceType:"withdrawal",resourceId:s,...(0,N.auditContextFromRequest)(e),detail:{final_status:t[0]?.status,tx_hash:t[0]?.tx_hash}})}catch{}return i}catch(t){let e=(0,R.responseForDbError)("exchange.admin.withdrawals.broadcast",t);if(e)return e;throw t}}e.s(["POST",()=>A,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],491267);var v=e.i(491267);let I=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/exchange/admin/withdrawals/[id]/broadcast/route",pathname:"/api/exchange/admin/withdrawals/[id]/broadcast",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/admin/withdrawals/[id]/broadcast/route.ts",nextConfigOutput:"",userland:v}),{workAsyncStorage:k,workUnitAsyncStorage:L,serverHooks:O}=I;function C(){return(0,r.patchFetch)({workAsyncStorage:k,workUnitAsyncStorage:L})}async function $(e,t,r){I.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let m="/api/exchange/admin/withdrawals/[id]/broadcast/route";m=m.replace(/\/index$/,"")||"/";let g=await I.prepare(e,t,{srcPage:m,multiZoneDraftMode:!1});if(!g)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:y,params:R,nextConfig:x,parsedUrl:S,isDraftMode:N,prerenderManifest:b,routerServerContext:T,isOnDemandRevalidate:A,revalidateOnlyGenerated:v,resolvedPathname:k,clientReferenceManifest:L,serverActionsManifest:O}=g,C=(0,o.normalizeAppPath)(m),$=!!(b.dynamicRoutes[C]||b.routes[k]),D=async()=>((null==T?void 0:T.render404)?await T.render404(e,t,S,!1):t.end("This page could not be found"),null);if($&&!N){let e=!!b.routes[k],t=b.dynamicRoutes[C];if(t&&!1===t.fallback&&!e){if(x.experimental.adapterPath)return await D();throw new h.NoFallbackError}}let U=null;!$||I.isDev||N||(U="/index"===(U=k)?"/":U);let P=!0===I.isDev||!$,M=$&&!P;O&&L&&(0,n.setManifestsSingleton)({page:m,clientReferenceManifest:L,serverActionsManifest:O});let q=e.method||"GET",H=(0,s.getTracer)(),j=H.getActiveScopeSpan(),F={params:R,prerenderManifest:b,renderOpts:{experimental:{authInterrupts:!!x.experimental.authInterrupts},cacheComponents:!!x.cacheComponents,supportsDynamicResponse:P,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:x.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,i)=>I.onRequestError(e,t,r,i,T)},sharedContext:{buildId:y}},W=new d.NodeNextRequest(e),B=new d.NodeNextResponse(t),K=l.NextRequestAdapter.fromNodeNextRequest(W,(0,l.signalFromNodeResponse)(t));try{let n=async e=>I.handle(K,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=H.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route");if(r){let t=`${q} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":t}),e.updateName(t)}else e.updateName(`${q} ${m}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),d=async i=>{var s,d;let l=async({previousCacheEntry:a})=>{try{if(!o&&A&&v&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let s=await n(i);e.fetchMetrics=F.renderOpts.fetchMetrics;let d=F.renderOpts.pendingWaitUntil;d&&r.waitUntil&&(r.waitUntil(d),d=void 0);let l=F.renderOpts.collectedTags;if(!$)return await (0,_.sendResponse)(W,B,s,F.renderOpts.pendingWaitUntil),null;{let e=await s.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(s.headers);l&&(t[E.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,r=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:w.CachedRouteKind.APP_ROUTE,status:s.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await I.onRequestError(e,t,{routerKind:"App Router",routePath:m,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:A})},!1,T),t}},u=await I.handleResponse({req:e,nextConfig:x,cacheKey:U,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:b,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:v,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:o});if(!$)return null;if((null==u||null==(s=u.value)?void 0:s.kind)!==w.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(d=u.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",A?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),N&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,p.fromNodeOutgoingHttpHeaders)(u.value.headers);return o&&$||h.delete(E.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,f.getCacheControlHeader)(u.cacheControl)),await (0,_.sendResponse)(W,B,new Response(u.value.body,{headers:h,status:u.value.status||200})),null};j?await d(j):await H.withPropagatedContext(e.headers,()=>H.trace(u.BaseServerSpan.handleRequest,{spanName:`${q} ${m}`,kind:s.SpanKind.SERVER,attributes:{"http.method":q,"http.target":e.url}},d))}catch(t){if(t instanceof h.NoFallbackError||await I.onRequestError(e,t,{routerKind:"App Router",routePath:C,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:A})},!1,T),$)throw t;return await (0,_.sendResponse)(W,B,new Response(null,{status:500})),null}}e.s(["handler",()=>$,"patchFetch",()=>C,"routeModule",()=>I,"serverHooks",()=>O,"workAsyncStorage",()=>k,"workUnitAsyncStorage",()=>L],280973)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__c5602a59._.js.map