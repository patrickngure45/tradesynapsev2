module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let o=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||o.has("Retry-After")||o.set("Retry-After","3"),Response.json(a,{status:r,headers:o})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function o(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>o,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let o=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&o.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(o){var a;if(!r(o))throw o;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function o(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>o,"retryOnceOnTransientDbError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function o(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),o=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(o))}return t}function s(e){return n(e.headers.get("cookie"))[r]??null}function i(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(n),"utf8")),i=o(e.secret,s);return`${s}.${i}`}function d(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,n),i=a.slice(n+1);if(!s||!i)return{ok:!1,error:"session_token_invalid"};let d=o(e.secret,s),l=Buffer.from(i),c=Buffer.from(d);if(l.length!==c.length||!(0,t.timingSafeEqual)(l,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function l(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>i,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>l,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function o(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>o,"requireActingUserIdInProd",()=>a])},583627,e=>{"use strict";var t=e.i(977775),r=e.i(300959),a=e.i(691180);async function o(e,r){let a=(0,t.getActingUserId)(r);if(!a)return{ok:!1,error:"auth_required"};let o=await e`
    SELECT role FROM app_user WHERE id = ${a}::uuid LIMIT 1
  `;return 0===o.length?{ok:!1,error:"user_not_found"}:"admin"!==o[0].role?{ok:!1,error:"admin_required"}:{ok:!0,userId:a}}async function n(e,t){let n=(0,a.getSessionTokenFromRequest)(t),s=await o(e,t);if(s.ok)return s;if("user_not_found"===s.error||"auth_required"===s.error){let e=n?{"set-cookie":(0,a.serializeClearSessionCookie)({secure:!0})}:void 0;return{ok:!1,response:(0,r.apiError)("auth_required",{headers:e})}}return{ok:!1,response:(0,r.apiError)(s.error)}}e.s(["requireAdminForApi",()=>n])},361179,e=>{"use strict";async function t(e,t){let r=t.visible_at??new Date,a=JSON.stringify(t.payload??{});return(await e`
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
  `)[0].id}async function r(e,t){let r=Math.max(1,Math.min(500,Math.floor(t.limit))),a=Math.max(5,Math.min(600,Math.floor(t.lockTtlSeconds??30))),o=t.topics?.length?t.topics:null;return o?await e`
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
        AND topic = ANY(${e.array(o)})
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
  `}async function o(e,t){let r=n(t.error);await e`
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
  `}async function i(e,t){return(await e`
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
  `).length>0}async function d(e,t){let r=Math.max(1,Math.min(200,Math.floor(t?.limit??50))),a=Math.max(0,Math.floor(t?.offset??0)),o=t?.topic??null;return o?e`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${o}
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
  `)[0]??null}e.s(["ackOutbox",()=>a,"claimOutboxBatch",()=>r,"countDeadLetters",()=>l,"deadLetterOutbox",()=>s,"enqueueOutbox",()=>t,"failOutbox",()=>o,"getDeadLetterById",()=>u,"listDeadLetters",()=>d,"resolveDeadLetter",()=>c,"retryDeadLetter",()=>i,"stringifyUnknownError",()=>n])},727402,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),o=e.i(759756),n=e.i(561916),s=e.i(174677),i=e.i(869741),d=e.i(316795),l=e.i(487718),c=e.i(995169),u=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),E=e.i(10372),g=e.i(193695);e.i(52474);var m=e.i(600220),h=e.i(843793),v=e.i(583627),y=e.i(300959),x=e.i(361179),N=e.i(184883);async function R(e){let t=(0,h.getSql)(),r=await (0,v.requireAdminForApi)(t,e);if(!r.ok)return r.response;let a=new URL(e.url),o=a.searchParams.get("id")??void 0,n=Math.max(1,Math.min(200,Number(a.searchParams.get("limit")??"50"))),s=Math.max(0,Number(a.searchParams.get("offset")??"0")),i=a.searchParams.get("topic")??void 0;try{if(o){let e=await (0,x.getDeadLetterById)(t,{id:o});if(!e)return Response.json({error:"not_found",message:"Event not found or not dead-lettered"},{status:404});return Response.json({dead_letter:e})}let[e,r]=await Promise.all([(0,x.listDeadLetters)(t,{limit:n,offset:s,topic:i}),(0,x.countDeadLetters)(t,{topic:i})]);return Response.json({dead_letters:e,total:r,count:e.length,limit:n,offset:s})}catch(t){let e=(0,N.responseForDbError)("admin.outbox.dead-letters.list",t);if(e)return e;throw t}}async function S(e){let t=(0,h.getSql)(),r=await (0,v.requireAdminForApi)(t,e);if(!r.ok)return r.response;let a=await e.json().catch(()=>({})),o="string"==typeof a.id?a.id:null,n="string"==typeof a.action?a.action:"retry";if(!o||"retry"!==n&&"resolve"!==n)return(0,y.apiError)("invalid_input");try{if(!("resolve"===n?await (0,x.resolveDeadLetter)(t,{id:o}):await (0,x.retryDeadLetter)(t,{id:o})))return Response.json({error:"not_found",message:"Event not found or not dead-lettered"},{status:404});return Response.json("resolve"===n?{resolved:!0,id:o}:{retried:!0,id:o})}catch(t){let e=(0,N.responseForDbError)("admin.outbox.dead-letters.retry",t);if(e)return e;throw t}}e.s(["GET",()=>R,"POST",()=>S,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],267938);var k=e.i(267938);let b=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/exchange/admin/outbox/dead-letters/route",pathname:"/api/exchange/admin/outbox/dead-letters",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/admin/outbox/dead-letters/route.ts",nextConfigOutput:"",userland:k}),{workAsyncStorage:w,workUnitAsyncStorage:L,serverHooks:T}=b;function A(){return(0,a.patchFetch)({workAsyncStorage:w,workUnitAsyncStorage:L})}async function O(e,t,a){b.isDev&&(0,o.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/exchange/admin/outbox/dead-letters/route";h=h.replace(/\/index$/,"")||"/";let v=await b.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!v)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:y,params:x,nextConfig:N,parsedUrl:R,isDraftMode:S,prerenderManifest:k,routerServerContext:w,isOnDemandRevalidate:L,revalidateOnlyGenerated:T,resolvedPathname:A,clientReferenceManifest:O,serverActionsManifest:I}=v,C=(0,i.normalizeAppPath)(h),D=!!(k.dynamicRoutes[C]||k.routes[A]),U=async()=>((null==w?void 0:w.render404)?await w.render404(e,t,R,!1):t.end("This page could not be found"),null);if(D&&!S){let e=!!k.routes[A],t=k.dynamicRoutes[C];if(t&&!1===t.fallback&&!e){if(N.experimental.adapterPath)return await U();throw new g.NoFallbackError}}let M=null;!D||b.isDev||S||(M="/index"===(M=A)?"/":M);let P=!0===b.isDev||!D,q=D&&!P;I&&O&&(0,s.setManifestsSingleton)({page:h,clientReferenceManifest:O,serverActionsManifest:I});let $=e.method||"GET",j=(0,n.getTracer)(),H=j.getActiveScopeSpan(),F={params:x,prerenderManifest:k,renderOpts:{experimental:{authInterrupts:!!N.experimental.authInterrupts},cacheComponents:!!N.cacheComponents,supportsDynamicResponse:P,incrementalCache:(0,o.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:N.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,o)=>b.onRequestError(e,t,a,o,w)},sharedContext:{buildId:y}},W=new d.NodeNextRequest(e),B=new d.NodeNextResponse(t),K=l.NextRequestAdapter.fromNodeNextRequest(W,(0,l.signalFromNodeResponse)(t));try{let s=async e=>b.handle(K,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=j.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${$} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${$} ${h}`)}),i=!!(0,o.getRequestMeta)(e,"minimalMode"),d=async o=>{var n,d;let l=async({previousCacheEntry:r})=>{try{if(!i&&L&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await s(o);e.fetchMetrics=F.renderOpts.fetchMetrics;let d=F.renderOpts.pendingWaitUntil;d&&a.waitUntil&&(a.waitUntil(d),d=void 0);let l=F.renderOpts.collectedTags;if(!D)return await (0,_.sendResponse)(W,B,n,F.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);l&&(t[E.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,a=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:m.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await b.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:L})},!1,w),t}},c=await b.handleResponse({req:e,nextConfig:N,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:k,isRoutePPREnabled:!1,isOnDemandRevalidate:L,revalidateOnlyGenerated:T,responseGenerator:l,waitUntil:a.waitUntil,isMinimalMode:i});if(!D)return null;if((null==c||null==(n=c.value)?void 0:n.kind)!==m.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(d=c.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});i||t.setHeader("x-nextjs-cache",L?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),S&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let g=(0,p.fromNodeOutgoingHttpHeaders)(c.value.headers);return i&&D||g.delete(E.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||g.get("Cache-Control")||g.set("Cache-Control",(0,f.getCacheControlHeader)(c.cacheControl)),await (0,_.sendResponse)(W,B,new Response(c.value.body,{headers:g,status:c.value.status||200})),null};H?await d(H):await j.withPropagatedContext(e.headers,()=>j.trace(c.BaseServerSpan.handleRequest,{spanName:`${$} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":$,"http.target":e.url}},d))}catch(t){if(t instanceof g.NoFallbackError||await b.onRequestError(e,t,{routerKind:"App Router",routePath:C,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:L})},!1,w),D)throw t;return await (0,_.sendResponse)(W,B,new Response(null,{status:500})),null}}e.s(["handler",()=>O,"patchFetch",()=>A,"routeModule",()=>b,"serverHooks",()=>T,"workAsyncStorage",()=>w,"workUnitAsyncStorage",()=>L],727402)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__617c9964._.js.map