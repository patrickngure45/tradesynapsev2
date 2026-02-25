module.exports=[666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function n(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function i(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),n=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(n))}return t}function s(e){return i(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,i={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(i),"utf8")),o=n(e.secret,s);return`${s}.${o}`}function d(e){let r,a=e.token.trim(),i=a.indexOf(".");if(i<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,i),o=a.slice(i+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let d=n(e.secret,s),_=Buffer.from(o),c=Buffer.from(d);if(_.length!==c.length||!(0,t.timingSafeEqual)(_,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function _(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>i,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>_,"verifySessionToken",()=>d])},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(n){var a;if(!r(n))throw n;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function n(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>a])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===r.length?"user_not_found":"active"!==r[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let n="number"==typeof e?e:Number(String(e??""));return Number.isFinite(n)?Math.max(t,Math.min(r,Math.trunc(n))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function n(e,n){var s;let o,d,_,c,u,l=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${n.userId}::uuid
        AND type = ${n.type}
      LIMIT 1
    `;t.length>0&&(l=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!l&&!p)return"";let f=String(n.title??"").trim()||"Notification",m=String(n.body??""),E=(s=n.type,(d=t(o={...n.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(_=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=_),(c=t(o,"tx_hash","txHash"))&&(o.tx_hash=c),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(u=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),n=t(r,"withdrawal_id","withdrawalId"),i=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(n&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return i?`/p2p?side=SELL&asset=${encodeURIComponent(i)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&u.startsWith("/")&&(o.href=u),o);if("system"!==n.type){let t=await a(e,n.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),n=new Date(t.getTime()+6e4*a),i=60*n.getUTCHours()+n.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?i>=s&&i<o:i>=s||i<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${n.userId}::uuid, ${n.type}, ${f}, ${m}, ${E}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let g="";if(l){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${n.userId}::uuid,
        ${n.type},
        ${f},
        ${m},
        ${E}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];g=t.id;try{let r=JSON.stringify({id:t.id,user_id:n.userId,type:n.type,title:f,body:m,metadata_json:E,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${n.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${f}`,a=m?`${f}

${m}`:f,s=m?`<p><strong>${i(f)}</strong></p><p>${i(m)}</p>`:`<p><strong>${i(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${n.userId}::uuid,
            ${r},
            'notification',
            ${n.type},
            ${t},
            ${a},
            ${s},
            ${E}::jsonb
          )
        `}}catch{}return g}function i(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}async function _(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>n,"listNotifications",()=>s,"markAllRead",()=>_,"markRead",()=>d])},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,n=t.max??60;return{consume:async function(t){let i=(await e`
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
    `)[0],s=Number(i.window_start_ms)+a,o=Math.max(0,i.tokens);return{allowed:i.tokens>=0,remaining:o,resetMs:s,limit:n}},name:r}}e.s(["createPgRateLimiter",()=>t])},60828,e=>{"use strict";async function t(e,t){await e`
    INSERT INTO arcade_consumption (
      user_id,
      kind,
      code,
      rarity,
      quantity,
      context_type,
      context_id,
      module,
      metadata_json
    ) VALUES (
      ${t.user_id}::uuid,
      ${t.kind},
      ${t.code},
      ${t.rarity??null},
      ${Math.max(1,Math.floor(Number(t.quantity??1)))},
      ${t.context_type},
      ${t.context_id??null},
      ${t.module??null},
      ${e.json(t.metadata??{})}
    )
  `}e.s(["logArcadeConsumption",()=>t])},891454,e=>{"use strict";var t=e.i(300959),r=e.i(691180);async function a(e,a){let n=String(process.env.PROOFPACK_SESSION_SECRET??"").trim();if(n){let i=(0,r.getSessionTokenFromRequest)(a);if(i){let a=(0,r.verifySessionToken)({token:i,secret:n});if(!a.ok)return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};let s=a.payload.uid,o=Math.max(0,Math.trunc(Number(a.payload.sv??0)||0));try{let r=await e`
          SELECT session_version
          FROM app_user
          WHERE id = ${s}::uuid
          LIMIT 1
        `;if(!r[0])return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};if(Math.max(0,Math.trunc(Number(r[0].session_version??0)||0))!==o)return{ok:!1,response:(0,t.apiError)("session_revoked",{status:401})}}catch{return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}return{ok:!0,userId:s}}}else if(1)return{ok:!1,response:(0,t.apiError)("session_secret_not_configured")};let i=String(process.env.INTERNAL_SERVICE_SECRET??"").trim();if(i){let e=String(a.headers.get("x-internal-service-token")??"").trim();if(e&&e===i){let e=String(a.headers.get("x-user-id")??"").trim();if(e&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(e))return{ok:!0,userId:e}}}return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}e.s(["requireSessionUserId",()=>a])},677702,e=>{"use strict";var t=e.i(469719);let r=t.z.union([t.z.string(),t.z.number()]).transform(function(e){return"number"==typeof e?String(e):e.trim()}).refine(e=>e.length>0&&e.length<=80,"Invalid amount").refine(function(e){return/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(e)},"Invalid amount").refine(function(e){return""!==e.replace(".","").replace(/^0+/,"")},"Amount must be > 0");e.s(["amount3818PositiveSchema",0,r])},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let r=String(process.env[t]??"").trim();r&&r.length>=8&&e.push(r)}return e}();function r(e){let r=e;for(let e of t)e&&r.includes(e)&&(r=r.split(e).join("[REDACTED]"));return r}function a(e,t,a){var n;let i,s=e.headers.get("x-request-id")??"unknown",o=new URL(e.url,"http://localhost");i={...n={requestId:s,method:e.method,path:o.pathname,status:t.status,durationMs:Date.now()-a.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:a.userId??null,meta:a.meta,ts:new Date().toISOString()},userAgent:n.userAgent?r(n.userAgent):n.userAgent,meta:n.meta?function e(t,a){if(a>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return r(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,a+1));if("object"==typeof t){let r={},n=0;for(let[i,s]of Object.entries(t)){if((n+=1)>80){r.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(i)?r[i]=e(s,a+1):r[i]="[REDACTED]"}return r}return String(t)}(n.meta,0):n.meta},process.stdout.write(JSON.stringify(i)+"\n")}e.s(["logRouteResponse",()=>a],371276)},361179,e=>{"use strict";async function t(e,t){let r=t.visible_at??new Date,a=JSON.stringify(t.payload??{});return(await e`
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
  `)[0].id}async function r(e,t){let r=Math.max(1,Math.min(500,Math.floor(t.limit))),a=Math.max(5,Math.min(600,Math.floor(t.lockTtlSeconds??30))),n=t.topics?.length?t.topics:null;return n?await e`
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
        AND topic = ANY(${e.array(n)})
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
  `}async function n(e,t){let r=i(t.error);await e`
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
  `}function i(e){if(e instanceof Error)return e.message||e.name;if("string"==typeof e)return e;try{return JSON.stringify(e)}catch{return String(e)}}async function s(e,t){let r=i(t.error);await e`
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
  `).length>0}async function d(e,t){let r=Math.max(1,Math.min(200,Math.floor(t?.limit??50))),a=Math.max(0,Math.floor(t?.offset??0)),n=t?.topic??null;return n?e`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${n}
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
  `}async function _(e,t){let r=t?.topic??null,a=r?await e`
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
  `)[0]??null}e.s(["ackOutbox",()=>a,"claimOutboxBatch",()=>r,"countDeadLetters",()=>_,"deadLetterOutbox",()=>s,"enqueueOutbox",()=>t,"failOutbox",()=>n,"getDeadLetterById",()=>u,"listDeadLetters",()=>d,"resolveDeadLetter",()=>c,"retryDeadLetter",()=>o,"stringifyUnknownError",()=>i])},279174,e=>{"use strict";var t=e.i(666680);let r="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function a(e,a,n){let i=function(e){let t=e.replace(/[=\s]/g,"").toUpperCase(),a=0,n=0,i=[];for(let e of t){let t=r.indexOf(e);if(-1===t)throw Error(`Invalid base32 character: ${e}`);n=n<<5|t,(a+=5)>=8&&(i.push(n>>>a-8&255),a-=8)}return Buffer.from(i)}(e),s=Math.floor(Math.floor((n??Date.now())/1e3)/30);for(let e=-1;e<=1;e++)if(function(e,r){let a=Buffer.alloc(8);a.writeBigUInt64BE(r);let n=(0,t.createHmac)("sha1",e).update(a).digest(),i=15&n[n.length-1];return String(((127&n[i])<<24|(255&n[i+1])<<16|(255&n[i+2])<<8|255&n[i+3])%1e6).padStart(6,"0")}(i,BigInt(s+e))===a.trim())return!0;return!1}function n(){return function(e){let t=0,a=0,n="";for(let i of e)for(a=a<<8|i,t+=8;t>=5;)n+=r[a>>>t-5&31],t-=5;return t>0&&(n+=r[a<<5-t&31]),n}((0,t.randomBytes)(20))}function i(e){let t=e.issuer??"TradeSynapse",r=`${t}:${e.email}`,a=new URLSearchParams({secret:e.secret,issuer:t,algorithm:"SHA1",digits:String(6),period:String(30)});return`otpauth://totp/${encodeURIComponent(r)}?${a.toString()}`}function s(e=8){let r="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",a=[];for(let n=0;n<e;n++){let e=(0,t.randomBytes)(8),n="";for(let t of e)n+=r[t%r.length];a.push(`${n.slice(0,4)}-${n.slice(4)}`)}return a}e.s(["buildTOTPUri",()=>i,"generateBackupCodes",()=>s,"generateTOTPSecret",()=>n,"verifyTOTP",()=>a])},795374,e=>{"use strict";var t=e.i(279174);async function r(e,r,a){let n=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===n.length||!n[0].totp_enabled||!n[0].totp_secret)return null;let i=String(a??"").trim();return i&&6===i.length&&/^\d{6}$/.test(i)?(0,t.verifyTOTP)(n[0].totp_secret,i)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}async function a(e,r,a){let n=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===n.length)return null;if(!n[0].totp_enabled||!n[0].totp_secret)return Response.json({error:"totp_setup_required",message:"2FA must be enabled for this operation."},{status:403});let i=String(a??"").trim();return i&&6===i.length&&/^\d{6}$/.test(i)?(0,t.verifyTOTP)(n[0].totp_secret,i)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}e.s(["enforceTotpIfEnabled",()=>r,"enforceTotpRequired",()=>a])},151693,e=>{"use strict";var t=e.i(666680),r=e.i(691180);let a="pp_stepup";function n(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,r){return n((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function s(e){return(0,r.parseCookieHeader)(e.headers.get("cookie"))[a]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:300,a={uid:e.userId,amr:"passkey",iat:t,exp:t+r},s=n(Buffer.from(JSON.stringify(a),"utf8")),o=i(e.secret,s);return`${s}.${o}`}function d(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"stepup_token_invalid"};let s=a.slice(0,n),o=a.slice(n+1);if(!s||!o)return{ok:!1,error:"stepup_token_invalid"};let d=i(e.secret,s),_=Buffer.from(o),c=Buffer.from(d);if(_.length!==c.length||!(0,t.timingSafeEqual)(_,c))return{ok:!1,error:"stepup_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"stepup_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"passkey"!==r.amr||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"stepup_token_invalid"};let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"stepup_token_expired"}:{ok:!0,payload:r}}function _(e){let t=[`${a}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}e.s(["createStepUpToken",()=>o,"getStepUpTokenFromRequest",()=>s,"serializeStepUpCookie",()=>_,"verifyStepUpToken",()=>d])},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__e6bfc433._.js.map