module.exports=[324725,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},666680,(e,t,a)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let a="pp_session";function r(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,a){return r((0,t.createHmac)("sha256",e).update(a,"utf8").digest())}function s(e){if(!e)return{};let t={};for(let a of e.split(/;\s*/g)){let e=a.indexOf("=");if(e<=0)continue;let r=a.slice(0,e).trim(),i=a.slice(e+1).trim();r&&(t[r]=decodeURIComponent(i))}return t}function n(e){return s(e.headers.get("cookie"))[a]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),a="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,s={uid:e.userId,iat:t,exp:t+a,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},n=r(Buffer.from(JSON.stringify(s),"utf8")),o=i(e.secret,n);return`${n}.${o}`}function d(e){let a,r=e.token.trim(),s=r.indexOf(".");if(s<=0)return{ok:!1,error:"session_token_invalid"};let n=r.slice(0,s),o=r.slice(s+1);if(!n||!o)return{ok:!1,error:"session_token_invalid"};let d=i(e.secret,n),l=Buffer.from(o),_=Buffer.from(d);if(l.length!==_.length||!(0,t.timingSafeEqual)(l,_))return{ok:!1,error:"session_token_invalid"};try{let e,t;a=JSON.parse((e=n.length%4,t=(n+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!a||"object"!=typeof a||"string"!=typeof a.uid||!a.uid||"number"!=typeof a.exp||!Number.isFinite(a.exp))return{ok:!1,error:"session_token_invalid"};if(null!=a.sv){let e=Number(a.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};a.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return a.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:a}}function l(e){let t=[`${a}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function _(e){let t=[`${a}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>n,"parseCookieHeader",()=>s,"serializeClearSessionCookie",()=>_,"serializeSessionCookie",()=>l,"verifySessionToken",()=>d])},918622,(e,t,a)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,a)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,a)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,a)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,a)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,a)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,a)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,a)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,a)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function a(e,t){let a=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),r={error:e};"string"==typeof t?.details?(r.message=t.details,r.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(r.details=t.details,"message"in t.details&&(r.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(r,{status:a,headers:i})}function r(e){return e instanceof t.ZodError?a("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return a("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>a,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>r])},184883,e=>{"use strict";var t=e.i(300959);function a(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),a=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),r=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&r.has(t))return!0;let i=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&i.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(a))}async function r(e,t){try{return await e()}catch(i){var r;if(!a(i))throw i;return await (r=t?.delayMs??50,new Promise(e=>setTimeout(e,r))),await e()}}function i(e,r){return a(r)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>a,"responseForDbError",()=>i,"retryOnceOnTransientDbError",()=>r])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let a=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===a.length?"user_not_found":"active"!==a[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},194748,e=>{"use strict";function t(e,...a){for(let t of a){let a=e[t];if("string"==typeof a&&a.trim())return a}return null}function a(e,t,a,r){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(a,Math.trunc(i))):r}async function r(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var n;let o,d,l,_,u,c=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(c=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!c&&!p)return"";let E=String(i.title??"").trim()||"Notification",f=String(i.body??""),m=(n=i.type,(d=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(l=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=l),(_=t(o,"tx_hash","txHash"))&&(o.tx_hash=_),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(n)),(u=t(o,"href")??function(e,a){let r=t(a,"order_id","orderId"),i=t(a,"withdrawal_id","withdrawalId"),s=t(a,"asset_symbol","assetSymbol","symbol");if(r&&e.startsWith("p2p_"))return`/p2p/orders/${r}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return s?`/p2p?side=SELL&asset=${encodeURIComponent(s)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(n,o))&&u.startsWith("/")&&(o.href=u),o);if("system"!==i.type){let t=await r(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let r=a(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*r),s=60*i.getUTCHours()+i.getUTCMinutes(),n=a(e.quiet_start_min,0,1439,1320),o=a(e.quiet_end_min,0,1439,480);return n===o||(n<o?s>=n&&s<o:s>=n||s<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${E}, ${f}, ${m}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let h="";if(c){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${E},
        ${f},
        ${m}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];h=t.id;try{let a=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:E,body:f,metadata_json:m,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${a})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${i.userId}::uuid
        LIMIT 1
      `)[0],a=t?.email?String(t.email).trim().toLowerCase():"",r=t?.email_verified===!0;if(a&&a.includes("@")&&r){let t=`[Coinwaka] ${E}`,r=f?`${E}

${f}`:E,n=f?`<p><strong>${s(E)}</strong></p><p>${s(f)}</p>`:`<p><strong>${s(E)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${i.userId}::uuid,
            ${a},
            'notification',
            ${i.type},
            ${t},
            ${r},
            ${n},
            ${m}::jsonb
          )
        `}}catch{}return h}function s(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function n(e,t){let a=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>n,"markAllRead",()=>l,"markRead",()=>d])},831075,e=>{"use strict";function t(e,t){let{name:a}=t,r=t.windowMs??6e4,i=t.max??60;return{consume:async function(t){let s=(await e`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${a}, ${t}, ${i-1}, ${r}, ${i}, now())
      ON CONFLICT (name, key)
      DO UPDATE SET
        tokens = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN ${i-1}
          ELSE GREATEST(rate_limit_bucket.tokens - 1, -1)
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN now()
          ELSE rate_limit_bucket.window_start
        END,
        window_ms   = ${r},
        max_tokens  = ${i}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `)[0],n=Number(s.window_start_ms)+r,o=Math.max(0,s.tokens);return{allowed:s.tokens>=0,remaining:o,resetMs:n,limit:i}},name:a}}e.s(["createPgRateLimiter",()=>t])},891454,e=>{"use strict";var t=e.i(300959),a=e.i(691180);async function r(e,r){let i=String(process.env.PROOFPACK_SESSION_SECRET??"").trim();if(i){let s=(0,a.getSessionTokenFromRequest)(r);if(s){let r=(0,a.verifySessionToken)({token:s,secret:i});if(!r.ok)return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};let n=r.payload.uid,o=Math.max(0,Math.trunc(Number(r.payload.sv??0)||0));try{let a=await e`
          SELECT session_version
          FROM app_user
          WHERE id = ${n}::uuid
          LIMIT 1
        `;if(!a[0])return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};if(Math.max(0,Math.trunc(Number(a[0].session_version??0)||0))!==o)return{ok:!1,response:(0,t.apiError)("session_revoked",{status:401})}}catch{return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}return{ok:!0,userId:n}}}else if(1)return{ok:!1,response:(0,t.apiError)("session_secret_not_configured")};let s=String(process.env.INTERNAL_SERVICE_SECRET??"").trim();if(s){let e=String(r.headers.get("x-internal-service-token")??"").trim();if(e&&e===s){let e=String(r.headers.get("x-user-id")??"").trim();if(e&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(e))return{ok:!0,userId:e}}}return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}e.s(["requireSessionUserId",()=>r])},315569,e=>{"use strict";let t=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;async function a(e,a,r){let i=(a.method??"GET").toUpperCase();if("GET"!==i&&"HEAD"!==i)return{ok:!0,scope:{actorUserId:r,userId:r,impersonating:!1}};let s=(a.headers.get("x-impersonate-user-id")??"").trim(),n="";try{n=(new URL(a.url).searchParams.get("user_id")??"").trim()}catch{}let o=s||n;if(!o||o===r)return{ok:!0,scope:{actorUserId:r,userId:r,impersonating:!1}};if(!t.test(String(o??"").trim()))return{ok:!1,error:"invalid_input"};let d=await e`
    SELECT role FROM app_user WHERE id = ${r}::uuid LIMIT 1
  `;return 0===d.length?{ok:!1,error:"user_not_found"}:"admin"!==d[0].role?{ok:!0,scope:{actorUserId:r,userId:r,impersonating:!1}}:0===(await e`
    SELECT true AS ok FROM app_user WHERE id = ${o}::uuid LIMIT 1
  `).length?{ok:!1,error:"user_not_found"}:{ok:!0,scope:{actorUserId:r,userId:o,impersonating:!0}}}e.s(["resolveReadOnlyUserScope",()=>a])},677702,e=>{"use strict";var t=e.i(469719);let a=t.z.union([t.z.string(),t.z.number()]).transform(function(e){return"number"==typeof e?String(e):e.trim()}).refine(e=>e.length>0&&e.length<=80,"Invalid amount").refine(function(e){return/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(e)},"Invalid amount").refine(function(e){return""!==e.replace(".","").replace(/^0+/,"")},"Amount must be > 0");e.s(["amount3818PositiveSchema",0,a])},90878,e=>{"use strict";async function t(e,t){await e`
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
      `;return r[0]?.total??0}async function _(e,t){return(await e`
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
  `)[0]??null}e.s(["ackOutbox",()=>r,"claimOutboxBatch",()=>a,"countDeadLetters",()=>l,"deadLetterOutbox",()=>n,"enqueueOutbox",()=>t,"failOutbox",()=>i,"getDeadLetterById",()=>u,"listDeadLetters",()=>d,"resolveDeadLetter",()=>_,"retryDeadLetter",()=>o,"stringifyUnknownError",()=>s])},844297,e=>{"use strict";var t=e.i(666680);function a(){let e=process.env.PROOFPACK_SESSION_SECRET;if(!e||e.length<32)throw Error("PROOFPACK_SESSION_SECRET must be at least 32 chars for credential encryption");return Buffer.from(e,"utf-8").subarray(0,32)}function r(e){let r=a(),i=(0,t.randomBytes)(12),s=(0,t.createCipheriv)("aes-256-gcm",r,i),n=s.update(e,"utf8","hex");n+=s.final("hex");let o=s.getAuthTag().toString("hex");return`${i.toString("hex")}:${n}:${o}`}function i(e){let r=a(),i=e.split(":");if(3!==i.length)throw Error("Invalid encrypted credential format");let[s,n,o]=i,d=Buffer.from(s,"hex"),l=Buffer.from(o,"hex"),_=(0,t.createDecipheriv)("aes-256-gcm",r,d);_.setAuthTag(l);let u=_.update(n,"hex","utf8");return u+_.final("utf8")}e.s(["decryptCredential",()=>i,"encryptCredential",()=>r])},24672,e=>{"use strict";async function t(e,t){let a=String(t.service??"").trim();if(!a)return;let r=t.status??"ok",i=t.details??{};await e`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${a},
      ${r},
      ${e.json(i)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (service) DO UPDATE
      SET status = EXCLUDED.status,
          details_json = EXCLUDED.details_json,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = EXCLUDED.updated_at
  `}async function a(e){return await e`
    SELECT
      service,
      status,
      details_json,
      last_seen_at::text
    FROM app_service_heartbeat
    ORDER BY service ASC
  `}e.s(["listServiceHeartbeats",()=>a,"upsertServiceHeartbeat",()=>t])},358217,e=>{"use strict";async function t(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim(),i=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),s=await e`
    INSERT INTO ex_job_lock (key, holder_id, held_until, updated_at)
    VALUES (${a}, ${r}, now() + make_interval(secs => ${i}), now())
    ON CONFLICT (key)
    DO UPDATE SET
      holder_id = EXCLUDED.holder_id,
      held_until = EXCLUDED.held_until,
      updated_at = now()
    WHERE ex_job_lock.held_until < now()
       OR ex_job_lock.holder_id = EXCLUDED.holder_id
    RETURNING held_until::text AS held_until
  `;if(s.length>0)return{acquired:!0,held_until:s[0].held_until};let[n]=await e`
    SELECT held_until::text AS held_until, holder_id
    FROM ex_job_lock
    WHERE key = ${a}
    LIMIT 1
  `;return{acquired:!1,held_until:n?.held_until??null,holder_id:n?.holder_id??null}}async function a(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim();await e`
    UPDATE ex_job_lock
    SET held_until = now(), updated_at = now()
    WHERE key = ${a}
      AND holder_id = ${r}
  `}async function r(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim(),i=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),s=await e`
    UPDATE ex_job_lock
    SET held_until = now() + make_interval(secs => ${i}), updated_at = now()
    WHERE key = ${a}
      AND holder_id = ${r}
    RETURNING held_until::text AS held_until
  `;if(s.length>0)return{renewed:!0,held_until:s[0].held_until};let[n]=await e`
    SELECT held_until::text AS held_until
    FROM ex_job_lock
    WHERE key = ${a}
    LIMIT 1
  `;return{renewed:!1,held_until:n?.held_until??null}}e.s(["releaseJobLock",()=>a,"renewJobLock",()=>r,"tryAcquireJobLock",()=>t])},784756,e=>{"use strict";async function t(e,t,a,r){let[i]=await e`
    INSERT INTO copy_trading_leader (user_id, display_name, bio, is_public)
    VALUES (${t}, ${a}, ${r??null}, true)
    ON CONFLICT (user_id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      bio = EXCLUDED.bio,
      updated_at = now()
    RETURNING id, user_id, display_name, bio, is_public,
              total_followers, total_pnl_pct::text, win_rate::text, created_at
  `;return i}async function a(e){return await e`
    SELECT id, user_id, display_name, bio, is_public,
           total_followers, total_pnl_pct::text, win_rate::text, created_at
    FROM copy_trading_leader
    WHERE is_public = true
    ORDER BY total_pnl_pct DESC, total_followers DESC
    LIMIT 50
  `}async function r(e,t,a,i={}){let{copyRatio:s=1,maxPerTrade:n,connectionId:o}=i,[d]=await e`
    INSERT INTO copy_trading_subscription
      (follower_user_id, leader_id, copy_ratio, max_per_trade, connection_id)
    VALUES (
      ${t}, ${a}, ${s},
      ${n??null}, ${o??null}
    )
    ON CONFLICT (follower_user_id, leader_id) DO UPDATE SET
      status = 'active',
      copy_ratio = ${s},
      max_per_trade = ${n??null},
      connection_id = ${o??null},
      updated_at = now()
    RETURNING id, follower_user_id, leader_id, status,
              copy_ratio::text, max_per_trade::text, connection_id, created_at
  `;return await e`
    UPDATE copy_trading_leader SET
      total_followers = (
        SELECT count(*) FROM copy_trading_subscription
        WHERE leader_id = ${a} AND status = 'active'
      ),
      updated_at = now()
    WHERE id = ${a}
  `,{...d,leader_name:""}}async function i(e,t,a,r){let i={};void 0!==r.status&&(i.status=r.status),void 0!==r.copyRatio&&(i.copy_ratio=r.copyRatio),void 0!==r.maxPerTrade&&(i.max_per_trade=r.maxPerTrade);let[s]=await e`
    UPDATE copy_trading_subscription SET
      status = COALESCE(${r.status??null}, status),
      copy_ratio = COALESCE(${r.copyRatio??null}, copy_ratio),
      max_per_trade = COALESCE(${r.maxPerTrade??null}, max_per_trade),
      updated_at = now()
    WHERE id = ${t} AND follower_user_id = ${a}
    RETURNING id, follower_user_id, leader_id, status,
              copy_ratio::text, max_per_trade::text, connection_id, created_at
  `;return s?(await e`
    UPDATE copy_trading_leader SET
      total_followers = (
        SELECT count(*) FROM copy_trading_subscription
        WHERE leader_id = ${s.leader_id} AND status = 'active'
      ),
      updated_at = now()
    WHERE id = ${s.leader_id}
  `,{...s,leader_name:""}):null}async function s(e,t){return await e`
    SELECT s.id, s.follower_user_id, s.leader_id, s.status,
           s.copy_ratio::text, s.max_per_trade::text, s.connection_id, s.created_at,
           l.display_name AS leader_name
    FROM copy_trading_subscription s
    JOIN copy_trading_leader l ON l.id = s.leader_id
    WHERE s.follower_user_id = ${t}
    ORDER BY s.created_at DESC
  `}async function n(e,t){return await e`
    SELECT s.id, s.follower_user_id, s.leader_id, s.status,
           s.copy_ratio::text, s.max_per_trade::text, s.connection_id AS follower_connection_id,
           s.created_at, l.display_name AS leader_name
    FROM copy_trading_subscription s
    JOIN copy_trading_leader l ON l.id = s.leader_id
    WHERE l.user_id = ${t}
      AND s.status = 'active'
  `}async function o(e,t){let a=await n(e,t.leaderUserId);if(0===a.length)return;let r=process.env.INTERNAL_SERVICE_SECRET;r?await Promise.all(a.map(async e=>{try{let a=parseFloat(e.copy_ratio),i=parseFloat(t.quantity)*a;if(e.max_per_trade){let t=parseFloat(e.max_per_trade);i>t&&(i=t)}if(i<=1e-8)return;let s={market_id:t.marketId,side:t.side,type:"market",quantity:i.toFixed(8)},n=await fetch("http://localhost:3000/api/exchange/orders",{method:"POST",headers:{"Content-Type":"application/json","x-internal-service-token":r,"x-user-id":e.follower_user_id},body:JSON.stringify(s)});n.ok||(await n.text(),console.error(`[copy-trading] Failed for sub ${e.id}: HTTP ${n.status}`))}catch(t){console.error(`[copy-trading] Error processing sub ${e.id}:`,t instanceof Error?t.message:t)}})):console.error("[copy-trading] INTERNAL_SERVICE_SECRET not set — cannot propagate orders")}e.s(["getActiveSubscriptionsForLeader",()=>n,"getMySubscriptions",()=>s,"getPublicLeaders",()=>a,"propagateLeaderOrder",()=>o,"registerLeader",()=>t,"subscribe",()=>r,"updateSubscription",()=>i])},939249,e=>{"use strict";var t=e.i(630862);function a(e,a){let r=(0,t.toBigInt3818)(e),i=(0,t.toBigInt3818)(a);return!(i<=0n)&&r%i===0n}function r(e,a){let r=(0,t.toBigInt3818)(e),i=(0,t.toBigInt3818)(a);if(i<=0n)throw Error("invalid step");return(0,t.fromBigInt3818)(r/i*i)}e.s(["isMultipleOfStep3818",()=>a,"quantizeDownToStep3818",()=>r])},695184,e=>{"use strict";var t=e.i(56778),a=e.i(901323),r=e.i(10967);let i=["function balanceOf(address owner) view returns (uint256)","function transfer(address to, uint256 amount) returns (bool)","function decimals() view returns (uint8)","function symbol() view returns (string)","event Transfer(address indexed from, address indexed to, uint256 value)"],s={USDT:"0x55d398326f99059fF775485246999027B3197955"};function n(e){return s[e.toUpperCase()]??null}async function o(e){let r=(0,a.getBscReadProvider)(),i=await r.getBalance(e);return t.ethers.formatEther(i)}async function d(e,r){let s=(0,a.getBscReadProvider)(),n=new t.ethers.Contract(e,i,s),[o,d]=await Promise.all([n.balanceOf(r),n.decimals()]);return{balance:t.ethers.formatUnits(o,d),decimals:d}}async function l(e){let t=[];try{let a=await o(e);t.push({symbol:"BNB",balance:a,contractAddress:null})}catch{t.push({symbol:"BNB",balance:"0",contractAddress:null})}for(let a of["USDT"]){let r=n(a);if(r)try{let{balance:i}=await d(r,e);t.push({symbol:a,balance:i,contractAddress:r})}catch{t.push({symbol:a,balance:"0",contractAddress:r})}}return t}async function _(e,s,n,o,d=18){let l=(0,r.rankRpcUrls)("bsc"),u=0===Number("true")?97:56,c=t.ethers.Network.from({name:"bnb",chainId:u}),p=t.ethers.parseUnits(o,d),E=null;if(l.length<=1){let r=(0,a.getBscProvider)(),o=new t.ethers.Wallet(s,r),d=new t.ethers.Contract(e,i,o),l=await d.transfer(n,p);return await l.wait(1),{txHash:l.hash}}for(let a of l){let o=new t.ethers.JsonRpcProvider(a,c,{staticNetwork:c}),d=new t.ethers.Wallet(s,o),l=new t.ethers.Contract(e,i,d),_=Date.now();try{let e=await l.transfer(n,p);return(0,r.markRpcOk)(a,Date.now()-_),await e.wait(1).catch(()=>void 0),{txHash:e.hash}}catch(e){if((0,r.markRpcFail)(a),E=e,!(0,r.isLikelyRpcTransportError)(e))throw e}}throw E instanceof Error?E:Error("bsc_rpc_all_failed")}async function u(e,i,s){let n=(0,r.rankRpcUrls)("bsc"),o=0===Number("true")?97:56,d=t.ethers.Network.from({name:"bnb",chainId:o}),l=t.ethers.parseEther(s),_=null;if(n.length<=1){let r=(0,a.getBscProvider)(),s=new t.ethers.Wallet(e,r),n=await s.sendTransaction({to:i,value:l});return await n.wait(1),{txHash:n.hash}}for(let a of n){let s=new t.ethers.JsonRpcProvider(a,d,{staticNetwork:d}),n=new t.ethers.Wallet(e,s),o=Date.now();try{let e=await n.sendTransaction({to:i,value:l});return(0,r.markRpcOk)(a,Date.now()-o),await e.wait(1).catch(()=>void 0),{txHash:e.hash}}catch(e){if((0,r.markRpcFail)(a),_=e,!(0,r.isLikelyRpcTransportError)(e))throw e}}throw _ instanceof Error?_:Error("bsc_rpc_all_failed")}e.s(["getAllBalances",()=>l,"getTokenAddress",()=>n,"getTokenBalance",()=>d,"sendBnb",()=>u,"sendToken",()=>_])},675677,e=>{"use strict";var t=e.i(56778);let a=null,r=null;function i(){let e=process.env.DEPLOYER_PRIVATE_KEY;if(!e)throw Error("DEPLOYER_PRIVATE_KEY is not set");return e.startsWith("0x")?e:`0x${e}`}function s(){return a||(a=new t.ethers.Wallet(i()).address.toLowerCase()),a}function n(){return r||(r=i()),r}e.s(["getHotWalletAddress",()=>s,"getHotWalletKey",()=>n])},220900,e=>{"use strict";var t=e.i(630862);function a(e){let a={amount:e.amount,asset_symbol:e.asset_symbol??null,destination_address:e.destination_address??null,available_amount:e.available_amount??null,allowlist_age_minutes:"number"==typeof e.allowlist_age_minutes&&Number.isFinite(e.allowlist_age_minutes)?e.allowlist_age_minutes:null,user_withdrawals_1h:e.user_withdrawals_1h??null,user_withdrawals_24h:e.user_withdrawals_24h??null,rules:[]},r=0;try{let i=(0,t.toBigInt3818)(e.amount),s=1n*10n**18n;i>=1000n*s?(r+=70,a.rules.push({code:"amount_ge_1000",delta:70})):i>=100n*s?(r+=45,a.rules.push({code:"amount_ge_100",delta:45})):i>=10n*s?(r+=20,a.rules.push({code:"amount_ge_10",delta:20})):i>=s&&(r+=10,a.rules.push({code:"amount_ge_1",delta:10}))}catch{r+=15,a.rules.push({code:"amount_parse_failed",delta:15})}try{if(e.available_amount){let i=(0,t.toBigInt3818)(e.available_amount),s=(0,t.toBigInt3818)(e.amount);if(i>0n&&s>0n){let e=Number(10000n*s/i>20000n?20000n:10000n*s/i);e>=9500?(r+=50,a.rules.push({code:"amount_ge_95pct_available",delta:50,ratio_bps:e})):e>=7500?(r+=35,a.rules.push({code:"amount_ge_75pct_available",delta:35,ratio_bps:e})):e>=5e3&&(r+=20,a.rules.push({code:"amount_ge_50pct_available",delta:20,ratio_bps:e}))}}}catch{}"number"==typeof e.allowlist_age_minutes&&Number.isFinite(e.allowlist_age_minutes)&&(e.allowlist_age_minutes<10?(r+=20,a.rules.push({code:"allowlist_age_lt_10m",delta:20})):e.allowlist_age_minutes<60&&(r+=10,a.rules.push({code:"allowlist_age_lt_60m",delta:10}))),"number"==typeof e.user_withdrawals_1h&&Number.isFinite(e.user_withdrawals_1h)&&(e.user_withdrawals_1h>=3?(r+=25,a.rules.push({code:"withdrawals_1h_ge_3",delta:25})):e.user_withdrawals_1h>=2&&(r+=10,a.rules.push({code:"withdrawals_1h_ge_2",delta:10}))),"number"==typeof e.user_withdrawals_24h&&Number.isFinite(e.user_withdrawals_24h)&&(e.user_withdrawals_24h>=10?(r+=40,a.rules.push({code:"withdrawals_24h_ge_10",delta:40})):e.user_withdrawals_24h>=5?(r+=25,a.rules.push({code:"withdrawals_24h_ge_5",delta:25})):e.user_withdrawals_24h>=3&&(r+=10,a.rules.push({code:"withdrawals_24h_ge_3",delta:10})));let i="allow";return(r=Math.max(0,Math.min(100,Math.round(r))))>=85?i="block":r>=60?i="hold":r>=25&&(i="friction"),{score:r,recommended_action:i,factors:a,version:"ex_withdrawal_v0"}}e.s(["assessExchangeWithdrawalRiskV0",()=>a])},654657,e=>{"use strict";var t=e.i(675677),a=e.i(695184),r=e.i(361179),i=e.i(194748);async function s(e,s){let o,{withdrawalId:d}=s,l=await e.begin(async e=>{let t=await e`
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
    `;return 0===t.length?null:t[0]});if(!l)return;let _=await e`
    SELECT id::text AS id, symbol, chain, contract_address, decimals
    FROM ex_asset
    WHERE id = ${l.asset_id}
    LIMIT 1
  `;if(0===_.length)return void await n(e,l,"asset_not_found");let u=_[0];try{let r=(0,t.getHotWalletKey)();if("BNB"!==u.symbol.toUpperCase()||u.contract_address){let t=u.contract_address??(0,a.getTokenAddress)(u.symbol);if(!t)return void await n(e,l,`no_contract_address_for_${u.symbol}`);o=(await (0,a.sendToken)(t,r,l.destination_address,l.amount,u.decimals)).txHash}else o=(await (0,a.sendBnb)(r,l.destination_address,l.amount)).txHash}catch(a){let t=a instanceof Error?a.message:String(a);await n(e,l,t);return}await e.begin(async e=>{await e`
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
          ${{withdrawal_id:l.id,tx_hash:o,asset:u.symbol}}::jsonb
        )
        RETURNING id
      `)[0].id;await e`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${r}, ${a[0].id}, ${l.asset_id}::uuid, (${l.amount}::numeric) * -1),
          (${r}, ${t[0].id}, ${l.asset_id}::uuid, (${l.amount}::numeric))
      `}await (0,r.enqueueOutbox)(e,{topic:"ex.withdrawal.confirmed",aggregate_type:"withdrawal",aggregate_id:l.id,payload:{withdrawal_id:l.id,user_id:l.user_id,tx_hash:o,asset_symbol:u.symbol,amount:l.amount}}),await (0,i.createNotification)(e,{userId:l.user_id,type:"withdrawal_completed",title:"Withdrawal Confirmed",body:`Your withdrawal of ${l.amount} ${u.symbol} has been confirmed. TX: ${o.slice(0,10)}…`,metadata:{withdrawalId:l.id,txHash:o}})})}async function n(e,t,a){await e.begin(async e=>{await e`
      UPDATE ex_withdrawal_request
      SET status = 'failed', failure_reason = ${a}, updated_at = now()
      WHERE id = ${t.id}
    `,t.hold_id&&await e`
        UPDATE ex_hold
        SET status = 'released', released_at = now()
        WHERE id = ${t.hold_id} AND status = 'active'
      `,await (0,r.enqueueOutbox)(e,{topic:"ex.withdrawal.failed",aggregate_type:"withdrawal",aggregate_id:t.id,payload:{withdrawal_id:t.id,user_id:t.user_id,failure_reason:a}}),await (0,i.createNotification)(e,{userId:t.user_id,type:"system",title:"Withdrawal Failed",body:`Your withdrawal of ${t.amount} could not be completed: ${a}`,metadata:{withdrawalId:t.id,failureReason:a}})})}e.s(["handleWithdrawalBroadcast",()=>s])},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__e2f237f6._.js.map