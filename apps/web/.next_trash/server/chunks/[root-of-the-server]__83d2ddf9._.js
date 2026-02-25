module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,r)=>{t.exports=e.x("buffer",()=>require("buffer"))},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let n="number"==typeof e?e:Number(String(e??""));return Number.isFinite(n)?Math.max(t,Math.min(r,Math.trunc(n))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function n(e,n){var s;let o,l,d,u,c,p=!0,_=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${n.userId}::uuid
        AND type = ${n.type}
      LIMIT 1
    `;t.length>0&&(p=!1!==t[0].in_app_enabled,_=!0===t[0].email_enabled)}catch{}if(!p&&!_)return"";let h=String(n.title??"").trim()||"Notification",E=String(n.body??""),f=(s=n.type,(l=t(o={...n.metadata??{}},"order_id","orderId"))&&(o.order_id=l),(d=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=d),(u=t(o,"tx_hash","txHash"))&&(o.tx_hash=u),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(c=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),n=t(r,"withdrawal_id","withdrawalId"),i=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(n&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return i?`/p2p?side=SELL&asset=${encodeURIComponent(i)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&c.startsWith("/")&&(o.href=c),o);if("system"!==n.type){let t=await a(e,n.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),n=new Date(t.getTime()+6e4*a),i=60*n.getUTCHours()+n.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?i>=s&&i<o:i>=s||i<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${n.userId}::uuid, ${n.type}, ${h}, ${E}, ${f}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let x="";if(p){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${n.userId}::uuid,
        ${n.type},
        ${h},
        ${E},
        ${f}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];x=t.id;try{let r=JSON.stringify({id:t.id,user_id:n.userId,type:n.type,title:h,body:E,metadata_json:f,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(_)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${n.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${h}`,a=E?`${h}

${E}`:h,s=E?`<p><strong>${i(h)}</strong></p><p>${i(E)}</p>`:`<p><strong>${i(h)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${n.userId}::uuid,
            ${r},
            'notification',
            ${n.type},
            ${t},
            ${a},
            ${s},
            ${f}::jsonb
          )
        `}}catch{}return x}function i(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>n,"listNotifications",()=>s,"markAllRead",()=>d,"markRead",()=>l])},24672,e=>{"use strict";async function t(e,t){let r=String(t.service??"").trim();if(!r)return;let a=t.status??"ok",n=t.details??{};await e`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${r},
      ${a},
      ${e.json(n)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (service) DO UPDATE
      SET status = EXCLUDED.status,
          details_json = EXCLUDED.details_json,
          last_seen_at = EXCLUDED.last_seen_at,
          updated_at = EXCLUDED.updated_at
  `}async function r(e){return await e`
    SELECT
      service,
      status,
      details_json,
      last_seen_at::text
    FROM app_service_heartbeat
    ORDER BY service ASC
  `}e.s(["listServiceHeartbeats",()=>r,"upsertServiceHeartbeat",()=>t])},358217,e=>{"use strict";async function t(e,t){let r=String(t.key).trim(),a=String(t.holderId).trim(),n=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    INSERT INTO ex_job_lock (key, holder_id, held_until, updated_at)
    VALUES (${r}, ${a}, now() + make_interval(secs => ${n}), now())
    ON CONFLICT (key)
    DO UPDATE SET
      holder_id = EXCLUDED.holder_id,
      held_until = EXCLUDED.held_until,
      updated_at = now()
    WHERE ex_job_lock.held_until < now()
       OR ex_job_lock.holder_id = EXCLUDED.holder_id
    RETURNING held_until::text AS held_until
  `;if(i.length>0)return{acquired:!0,held_until:i[0].held_until};let[s]=await e`
    SELECT held_until::text AS held_until, holder_id
    FROM ex_job_lock
    WHERE key = ${r}
    LIMIT 1
  `;return{acquired:!1,held_until:s?.held_until??null,holder_id:s?.holder_id??null}}async function r(e,t){let r=String(t.key).trim(),a=String(t.holderId).trim();await e`
    UPDATE ex_job_lock
    SET held_until = now(), updated_at = now()
    WHERE key = ${r}
      AND holder_id = ${a}
  `}async function a(e,t){let r=String(t.key).trim(),a=String(t.holderId).trim(),n=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    UPDATE ex_job_lock
    SET held_until = now() + make_interval(secs => ${n}), updated_at = now()
    WHERE key = ${r}
      AND holder_id = ${a}
    RETURNING held_until::text AS held_until
  `;if(i.length>0)return{renewed:!0,held_until:i[0].held_until};let[s]=await e`
    SELECT held_until::text AS held_until
    FROM ex_job_lock
    WHERE key = ${r}
    LIMIT 1
  `;return{renewed:!1,held_until:s?.held_until??null}}e.s(["releaseJobLock",()=>r,"renewJobLock",()=>a,"tryAcquireJobLock",()=>t])},691823,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),i=e.i(561916),s=e.i(174677),o=e.i(869741),l=e.i(316795),d=e.i(487718),u=e.i(995169),c=e.i(47587),p=e.i(666012),_=e.i(570101),h=e.i(626937),E=e.i(10372),f=e.i(193695);e.i(52474);var x=e.i(600220),m=e.i(89171),y=e.i(843793),w=e.i(24672),R=e.i(569442),g=e.i(358217);function v(e,t,r){return Number.isFinite(e)?Math.max(t,Math.min(r,Math.trunc(e))):t}async function b(e){let t,r=function(e){let t=process.env.EXCHANGE_CRON_SECRET??process.env.CRON_SECRET;if(!t)return"cron_secret_not_configured";let r=e.headers.get("x-cron-secret")??e.nextUrl.searchParams.get("secret");return r&&r===t?null:"cron_unauthorized"}(e);if(r)return m.NextResponse.json({error:r},{status:"cron_unauthorized"===r?401:500});let a="1"!==(t=String(process.env.EXCHANGE_ENABLE_DEPOSIT_SCAN??"").trim())&&"true"!==t.toLowerCase()?"deposit_scan_disabled":null;if(a)return m.NextResponse.json({ok:!1,error:a,hint:"Set EXCHANGE_ENABLE_DEPOSIT_SCAN=1 in production to enable this endpoint."},{status:403});let n=(0,y.getSql)(),i=new URL(e.url),s=v(Number(i.searchParams.get("max")??"250"),1,2e3),o=v(Number(i.searchParams.get("max_ms")??"0"),0,6e4),l=v(Number(i.searchParams.get("confirmations")??""),0,200),d=Number.isFinite(l)?l:void 0,u=v(Number(process.env.EXCHANGE_FINALIZE_LOCK_TTL_MS??6e4),1e4,6e5),c="exchange:finalize-deposits:bsc",p=`${process.env.RAILWAY_SERVICE_NAME??process.env.SERVICE_NAME??"web"}:${crypto.randomUUID()}`,_=await (0,g.tryAcquireJobLock)(n,{key:c,holderId:p,ttlMs:u});if(!_.acquired)return m.NextResponse.json({ok:!1,error:"finalize_in_progress",held_until:_.held_until,holder_id:_.holder_id},{status:429});let h=v(Math.floor(u/2),5e3,3e4),E=null;try{E=setInterval(()=>{(0,g.renewJobLock)(n,{key:c,holderId:p,ttlMs:u}).catch(()=>void 0)},h)}catch{}let f=async e=>{try{await (0,w.upsertServiceHeartbeat)(n,{service:"deposit-finalize:bsc",status:"ok",details:{...e??{}}})}catch{}};try{await f({event:"start",max:s,max_ms:o,confirmations:d??null});let e=await (0,R.finalizePendingBscDeposits)(n,{max:s,maxMs:o>0?o:void 0,confirmations:d});return await f({event:"done",...e}),m.NextResponse.json(e)}catch(t){let e=t instanceof Error?t.message:String(t);return await f({event:"error",message:e}).catch(()=>void 0),m.NextResponse.json({ok:!1,error:"finalize_failed",message:e},{status:500})}finally{if(E)try{clearInterval(E)}catch{}await (0,g.releaseJobLock)(n,{key:c,holderId:p}).catch(()=>void 0)}}async function S(e){return b(e)}e.s(["GET",()=>S,"POST",()=>b,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],61099);var N=e.i(61099);let A=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/exchange/cron/finalize-deposits/route",pathname:"/api/exchange/cron/finalize-deposits",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/cron/finalize-deposits/route.ts",nextConfigOutput:"",userland:N}),{workAsyncStorage:T,workUnitAsyncStorage:C,serverHooks:I}=A;function $(){return(0,a.patchFetch)({workAsyncStorage:T,workUnitAsyncStorage:C})}async function k(e,t,a){A.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let m="/api/exchange/cron/finalize-deposits/route";m=m.replace(/\/index$/,"")||"/";let y=await A.prepare(e,t,{srcPage:m,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:w,params:R,nextConfig:g,parsedUrl:v,isDraftMode:b,prerenderManifest:S,routerServerContext:N,isOnDemandRevalidate:T,revalidateOnlyGenerated:C,resolvedPathname:I,clientReferenceManifest:$,serverActionsManifest:k}=y,M=(0,o.normalizeAppPath)(m),D=!!(S.dynamicRoutes[M]||S.routes[I]),L=async()=>((null==N?void 0:N.render404)?await N.render404(e,t,v,!1):t.end("This page could not be found"),null);if(D&&!b){let e=!!S.routes[I],t=S.dynamicRoutes[M];if(t&&!1===t.fallback&&!e){if(g.experimental.adapterPath)return await L();throw new f.NoFallbackError}}let O=null;!D||A.isDev||b||(O="/index"===(O=I)?"/":O);let j=!0===A.isDev||!D,q=D&&!j;k&&$&&(0,s.setManifestsSingleton)({page:m,clientReferenceManifest:$,serverActionsManifest:k});let U=e.method||"GET",H=(0,i.getTracer)(),P=H.getActiveScopeSpan(),F={params:R,prerenderManifest:S,renderOpts:{experimental:{authInterrupts:!!g.experimental.authInterrupts},cacheComponents:!!g.cacheComponents,supportsDynamicResponse:j,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:g.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>A.onRequestError(e,t,a,n,N)},sharedContext:{buildId:w}},W=new l.NodeNextRequest(e),z=new l.NodeNextResponse(t),X=d.NextRequestAdapter.fromNodeNextRequest(W,(0,d.signalFromNodeResponse)(t));try{let s=async e=>A.handle(X,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=H.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${U} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${U} ${m}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!o&&T&&C&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(n);e.fetchMetrics=F.renderOpts.fetchMetrics;let l=F.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let d=F.renderOpts.collectedTags;if(!D)return await (0,p.sendResponse)(W,z,i,F.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,_.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[E.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,a=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await A.onRequestError(e,t,{routerKind:"App Router",routePath:m,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:T})},!1,N),t}},u=await A.handleResponse({req:e,nextConfig:g,cacheKey:O,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:C,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:o});if(!D)return null;if((null==u||null==(i=u.value)?void 0:i.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(l=u.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",T?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),b&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,_.fromNodeOutgoingHttpHeaders)(u.value.headers);return o&&D||f.delete(E.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,h.getCacheControlHeader)(u.cacheControl)),await (0,p.sendResponse)(W,z,new Response(u.value.body,{headers:f,status:u.value.status||200})),null};P?await l(P):await H.withPropagatedContext(e.headers,()=>H.trace(u.BaseServerSpan.handleRequest,{spanName:`${U} ${m}`,kind:i.SpanKind.SERVER,attributes:{"http.method":U,"http.target":e.url}},l))}catch(t){if(t instanceof f.NoFallbackError||await A.onRequestError(e,t,{routerKind:"App Router",routePath:M,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:T})},!1,N),D)throw t;return await (0,p.sendResponse)(W,z,new Response(null,{status:500})),null}}e.s(["handler",()=>k,"patchFetch",()=>$,"routeModule",()=>A,"serverHooks",()=>I,"workAsyncStorage",()=>T,"workUnitAsyncStorage",()=>C],691823)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__83d2ddf9._.js.map