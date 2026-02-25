module.exports=[918622,(e,t,a)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,a)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,a)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,a)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,a)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,a)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,a)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,a)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,a)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function a(e,t){let a=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),r={error:e};"string"==typeof t?.details?(r.message=t.details,r.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(r.details=t.details,"message"in t.details&&(r.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(r,{status:a,headers:n})}function r(e){return e instanceof t.ZodError?a("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return a("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>a,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>r])},666680,(e,t,a)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},184883,e=>{"use strict";var t=e.i(300959);function a(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),a=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),r=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&r.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(a))}async function r(e,t){try{return await e()}catch(n){var r;if(!a(n))throw n;return await (r=t?.delayMs??50,new Promise(e=>setTimeout(e,r))),await e()}}function n(e,r){return a(r)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>a,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>r])},361179,e=>{"use strict";async function t(e,t){let a=t.visible_at??new Date,r=JSON.stringify(t.payload??{});return(await e`
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
  `)[0].id}async function a(e,t){let a=Math.max(1,Math.min(500,Math.floor(t.limit))),r=Math.max(5,Math.min(600,Math.floor(t.lockTtlSeconds??30))),n=t.topics?.length?t.topics:null;return n?await e`
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
        AND topic = ANY(${e.array(n)})
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
  `}async function n(e,t){let a=i(t.error);await e`
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
  `}function i(e){if(e instanceof Error)return e.message||e.name;if("string"==typeof e)return e;try{return JSON.stringify(e)}catch{return String(e)}}async function o(e,t){let a=i(t.error);await e`
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
  `}async function s(e,t){return(await e`
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
  `).length>0}async function d(e,t){let a=Math.max(1,Math.min(200,Math.floor(t?.limit??50))),r=Math.max(0,Math.floor(t?.offset??0)),n=t?.topic??null;return n?e`
      SELECT
        id, topic, aggregate_type, aggregate_id, payload_json,
        attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
        created_at, processed_at
      FROM app_outbox_event
      WHERE dead_lettered_at IS NOT NULL
        AND processed_at IS NULL
        AND topic = ${n}
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
      `;return r[0]?.total??0}async function c(e,t){return(await e`
    UPDATE app_outbox_event
    SET
      processed_at = now(),
      locked_at = NULL,
      lock_id = NULL
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
      AND processed_at IS NULL
    RETURNING id
  `).length>0}async function _(e,t){return(await e`
    SELECT
      id, topic, aggregate_type, aggregate_id, payload_json,
      attempts, last_error, dead_lettered_at, visible_at, locked_at, lock_id,
      created_at, processed_at
    FROM app_outbox_event
    WHERE id = ${t.id}::uuid
      AND dead_lettered_at IS NOT NULL
    LIMIT 1
  `)[0]??null}e.s(["ackOutbox",()=>r,"claimOutboxBatch",()=>a,"countDeadLetters",()=>l,"deadLetterOutbox",()=>o,"enqueueOutbox",()=>t,"failOutbox",()=>n,"getDeadLetterById",()=>_,"listDeadLetters",()=>d,"resolveDeadLetter",()=>c,"retryDeadLetter",()=>s,"stringifyUnknownError",()=>i])},24672,e=>{"use strict";async function t(e,t){let a=String(t.service??"").trim();if(!a)return;let r=t.status??"ok",n=t.details??{};await e`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${a},
      ${r},
      ${e.json(n)}::jsonb,
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
  `}e.s(["listServiceHeartbeats",()=>a,"upsertServiceHeartbeat",()=>t])},358217,e=>{"use strict";async function t(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim(),n=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    INSERT INTO ex_job_lock (key, holder_id, held_until, updated_at)
    VALUES (${a}, ${r}, now() + make_interval(secs => ${n}), now())
    ON CONFLICT (key)
    DO UPDATE SET
      holder_id = EXCLUDED.holder_id,
      held_until = EXCLUDED.held_until,
      updated_at = now()
    WHERE ex_job_lock.held_until < now()
       OR ex_job_lock.holder_id = EXCLUDED.holder_id
    RETURNING held_until::text AS held_until
  `;if(i.length>0)return{acquired:!0,held_until:i[0].held_until};let[o]=await e`
    SELECT held_until::text AS held_until, holder_id
    FROM ex_job_lock
    WHERE key = ${a}
    LIMIT 1
  `;return{acquired:!1,held_until:o?.held_until??null,holder_id:o?.holder_id??null}}async function a(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim();await e`
    UPDATE ex_job_lock
    SET held_until = now(), updated_at = now()
    WHERE key = ${a}
      AND holder_id = ${r}
  `}async function r(e,t){let a=String(t.key).trim(),r=String(t.holderId).trim(),n=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    UPDATE ex_job_lock
    SET held_until = now() + make_interval(secs => ${n}), updated_at = now()
    WHERE key = ${a}
      AND holder_id = ${r}
    RETURNING held_until::text AS held_until
  `;if(i.length>0)return{renewed:!0,held_until:i[0].held_until};let[o]=await e`
    SELECT held_until::text AS held_until
    FROM ex_job_lock
    WHERE key = ${a}
    LIMIT 1
  `;return{renewed:!1,held_until:o?.held_until??null}}e.s(["releaseJobLock",()=>a,"renewJobLock",()=>r,"tryAcquireJobLock",()=>t])},572956,e=>{"use strict";var t=e.i(747909),a=e.i(174017),r=e.i(996250),n=e.i(759756),i=e.i(561916),o=e.i(174677),s=e.i(869741),d=e.i(316795),l=e.i(487718),c=e.i(995169),_=e.i(47587),u=e.i(666012),p=e.i(570101),E=e.i(626937),h=e.i(10372),f=e.i(193695);e.i(52474);var g=e.i(600220),N=e.i(469719),m=e.i(300959),y=e.i(843793),R=e.i(184883),x=e.i(666680),v=e.i(361179),S=e.i(24672),b=e.i(358217);let L=N.z.object({limit:N.z.string().optional().transform(e=>null==e?50:Math.max(1,Math.min(500,Number(e)||50)))});async function w(e){let t,a;if("production"===String("production").toLowerCase()&&"1"!==String(process.env.EXCHANGE_ENABLE_CONDITIONAL_ORDERS??"").trim()||!(a=String(process.env.EXCHANGE_CRON_SECRET??process.env.CRON_SECRET??"").trim())||(e.headers.get("x-cron-secret")??new URL(e.url).searchParams.get("secret")??"")!==a)return(0,m.apiError)("forbidden");let r=new URL(e.url);try{t=L.parse({limit:r.searchParams.get("limit")??void 0})}catch(e){return(0,m.apiZodError)(e)??(0,m.apiError)("invalid_input")}let n=(0,y.getSql)();try{let e=(0,x.randomUUID)(),a="exchange:conditional-orders:enqueue";if(!(await (0,b.tryAcquireJobLock)(n,{key:a,holderId:e,ttlMs:2e4})).acquired)return Response.json({ok:!0,enqueued:!1,skipped:!0});try{let e=await (0,v.enqueueOutbox)(n,{topic:"ex.conditional.evaluate",aggregate_type:"exchange",aggregate_id:"conditional-orders",payload:{limit:t.limit}});await (0,S.upsertServiceHeartbeat)(n,{service:"exchange:conditional-orders",status:"ok",details:{enqueued:!0,outbox_event_id:e,limit:t.limit}})}catch{}finally{await (0,b.releaseJobLock)(n,{key:a,holderId:e})}return Response.json({ok:!0,enqueued:!0,limit:t.limit})}catch(t){let e=(0,R.responseForDbError)("exchange.cron.conditional-orders",t);if(e)return e;throw t}}async function k(e){return w(e)}e.s(["GET",()=>k,"POST",()=>w,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],711415);var T=e.i(711415);let A=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/exchange/cron/conditional-orders/route",pathname:"/api/exchange/cron/conditional-orders",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/cron/conditional-orders/route.ts",nextConfigOutput:"",userland:T}),{workAsyncStorage:D,workUnitAsyncStorage:O,serverHooks:U}=A;function I(){return(0,r.patchFetch)({workAsyncStorage:D,workUnitAsyncStorage:O})}async function C(e,t,r){A.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let N="/api/exchange/cron/conditional-orders/route";N=N.replace(/\/index$/,"")||"/";let m=await A.prepare(e,t,{srcPage:N,multiZoneDraftMode:!1});if(!m)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:y,params:R,nextConfig:x,parsedUrl:v,isDraftMode:S,prerenderManifest:b,routerServerContext:L,isOnDemandRevalidate:w,revalidateOnlyGenerated:k,resolvedPathname:T,clientReferenceManifest:D,serverActionsManifest:O}=m,U=(0,s.normalizeAppPath)(N),I=!!(b.dynamicRoutes[U]||b.routes[T]),C=async()=>((null==L?void 0:L.render404)?await L.render404(e,t,v,!1):t.end("This page could not be found"),null);if(I&&!S){let e=!!b.routes[T],t=b.dynamicRoutes[U];if(t&&!1===t.fallback&&!e){if(x.experimental.adapterPath)return await C();throw new f.NoFallbackError}}let M=null;!I||A.isDev||S||(M="/index"===(M=T)?"/":M);let $=!0===A.isDev||!I,j=I&&!$;O&&D&&(0,o.setManifestsSingleton)({page:N,clientReferenceManifest:D,serverActionsManifest:O});let P=e.method||"GET",q=(0,i.getTracer)(),H=q.getActiveScopeSpan(),F={params:R,prerenderManifest:b,renderOpts:{experimental:{authInterrupts:!!x.experimental.authInterrupts},cacheComponents:!!x.cacheComponents,supportsDynamicResponse:$,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:x.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,n)=>A.onRequestError(e,t,r,n,L)},sharedContext:{buildId:y}},W=new d.NodeNextRequest(e),B=new d.NodeNextResponse(t),G=l.NextRequestAdapter.fromNodeNextRequest(W,(0,l.signalFromNodeResponse)(t));try{let o=async e=>A.handle(G,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=q.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route");if(r){let t=`${P} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":t}),e.updateName(t)}else e.updateName(`${P} ${N}`)}),s=!!(0,n.getRequestMeta)(e,"minimalMode"),d=async n=>{var i,d;let l=async({previousCacheEntry:a})=>{try{if(!s&&w&&k&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await o(n);e.fetchMetrics=F.renderOpts.fetchMetrics;let d=F.renderOpts.pendingWaitUntil;d&&r.waitUntil&&(r.waitUntil(d),d=void 0);let l=F.renderOpts.collectedTags;if(!I)return await (0,u.sendResponse)(W,B,i,F.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(i.headers);l&&(t[h.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=h.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,r=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=h.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await A.onRequestError(e,t,{routerKind:"App Router",routePath:N,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:w})},!1,L),t}},c=await A.handleResponse({req:e,nextConfig:x,cacheKey:M,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:b,isRoutePPREnabled:!1,isOnDemandRevalidate:w,revalidateOnlyGenerated:k,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:s});if(!I)return null;if((null==c||null==(i=c.value)?void 0:i.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(d=c.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",w?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),S&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,p.fromNodeOutgoingHttpHeaders)(c.value.headers);return s&&I||f.delete(h.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,E.getCacheControlHeader)(c.cacheControl)),await (0,u.sendResponse)(W,B,new Response(c.value.body,{headers:f,status:c.value.status||200})),null};H?await d(H):await q.withPropagatedContext(e.headers,()=>q.trace(c.BaseServerSpan.handleRequest,{spanName:`${P} ${N}`,kind:i.SpanKind.SERVER,attributes:{"http.method":P,"http.target":e.url}},d))}catch(t){if(t instanceof f.NoFallbackError||await A.onRequestError(e,t,{routerKind:"App Router",routePath:U,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:w})},!1,L),I)throw t;return await (0,u.sendResponse)(W,B,new Response(null,{status:500})),null}}e.s(["handler",()=>C,"patchFetch",()=>I,"routeModule",()=>A,"serverHooks",()=>U,"workAsyncStorage",()=>D,"workUnitAsyncStorage",()=>O],572956)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__a787132d._.js.map