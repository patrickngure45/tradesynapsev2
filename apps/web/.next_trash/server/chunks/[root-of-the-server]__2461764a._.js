module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(r,Math.trunc(i))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var d;let o,s,l,u,c,p=!0,_=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(p=!1!==t[0].in_app_enabled,_=!0===t[0].email_enabled)}catch{}if(!p&&!_)return"";let x=String(i.title??"").trim()||"Notification",E=String(i.body??""),f=(d=i.type,(s=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=s),(l=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=l),(u=t(o,"tx_hash","txHash"))&&(o.tx_hash=u),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(d)),(c=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),i=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(d,o))&&c.startsWith("/")&&(o.href=c),o);if("system"!==i.type){let t=await a(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*a),n=60*i.getUTCHours()+i.getUTCMinutes(),d=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return d===o||(d<o?n>=d&&n<o:n>=d||n<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${x}, ${E}, ${f}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let m="";if(p){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${x},
        ${E},
        ${f}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];m=t.id;try{let r=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:x,body:E,metadata_json:f,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(_)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${i.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${x}`,a=E?`${x}

${E}`:x,d=E?`<p><strong>${n(x)}</strong></p><p>${n(E)}</p>`:`<p><strong>${n(x)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${i.userId}::uuid,
            ${r},
            'notification',
            ${i.type},
            ${t},
            ${a},
            ${d},
            ${f}::jsonb
          )
        `}}catch{}return m}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function d(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `;return Number(r[0]?.count??"0")}async function s(e,t){return 0===t.ids.length?0:(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t.userId}::uuid
      AND id = ANY(${t.ids}::uuid[])
      AND read = false
  `).count}async function l(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>d,"markAllRead",()=>l,"markRead",()=>s])},587596,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),i=e.i(759756),n=e.i(561916),d=e.i(174677),o=e.i(869741),s=e.i(316795),l=e.i(487718),u=e.i(995169),c=e.i(47587),p=e.i(666012),_=e.i(570101),x=e.i(626937),E=e.i(10372),f=e.i(193695);e.i(52474);var m=e.i(600220),h=e.i(89171),y=e.i(843793),R=e.i(194748);async function w(e){let t=function(e){let t=process.env.P2P_CRON_SECRET??process.env.EXCHANGE_CRON_SECRET??process.env.CRON_SECRET;if(!t)return"cron_secret_not_configured";let r=e.headers.get("x-cron-secret")??e.nextUrl.searchParams.get("secret");return r&&r===t?null:"cron_unauthorized"}(e);if(t)return h.NextResponse.json({error:t},{status:"cron_unauthorized"===t?401:500});let r=(0,y.getSql)(),a=Math.max(1,Math.min(200,Number(e.nextUrl.searchParams.get("limit")??"50"))),i=Math.max(1,Math.min(60,Number(process.env.P2P_EXPIRY_WARNING_MINUTES??"5")||5));try{let e=await r.begin(async e=>{let t=await e`
				WITH candidates AS (
					SELECT id
					FROM p2p_order
					WHERE status = 'created'
						AND expires_at > now()
						AND expires_at <= now() + make_interval(mins => ${i})
					ORDER BY expires_at ASC
					LIMIT ${a}
					FOR UPDATE SKIP LOCKED
				)
				SELECT
					o.id::text,
					o.buyer_id::text,
					o.seller_id::text,
					o.expires_at,
					o.fiat_currency,
					o.amount_fiat::text
				FROM p2p_order o
				JOIN candidates c ON c.id = o.id
				WHERE NOT EXISTS (
					SELECT 1
					FROM ex_notification n
					WHERE n.user_id = o.buyer_id
						AND n.type = 'p2p_order_expiring'
						AND (n.metadata_json->>'order_id') = (o.id::text)
				)
			`;for(let r of t)await (0,R.createNotification)(e,{userId:r.buyer_id,type:"p2p_order_expiring",title:"Payment window ending soon",body:`Order ${r.id.slice(0,8)} expires soon. Mark as paid only after you actually sent ${r.amount_fiat} ${r.fiat_currency}.`,metadata:{order_id:r.id,expires_at:r.expires_at?.toISOString?.()??String(r.expires_at),warn_minutes:i}});let r=await e`
				WITH candidates AS (
					SELECT id
					FROM p2p_order
					WHERE status = 'created'
						AND expires_at <= now()
					ORDER BY expires_at ASC
					LIMIT ${a}
					FOR UPDATE SKIP LOCKED
				)
				UPDATE p2p_order o
				SET status = 'cancelled', cancelled_at = now()
				FROM candidates c
				WHERE o.id = c.id
				RETURNING
					o.id::text,
					o.ad_id::text,
					(SELECT ad.side FROM p2p_ad ad WHERE ad.id = o.ad_id) AS ad_side,
					(SELECT ad.inventory_hold_id::text FROM p2p_ad ad WHERE ad.id = o.ad_id) AS ad_inventory_hold_id,
					o.escrow_hold_id::text,
					o.amount_asset::text,
					o.seller_id::text,
					o.buyer_id::text,
					o.fiat_currency,
					o.amount_fiat::text
			`;for(let t of r)t.escrow_hold_id&&await e`
						UPDATE ex_hold
						SET status = 'released', released_at = now()
						WHERE id = ${t.escrow_hold_id}::uuid
							AND status = 'active'
					`,await e`
					UPDATE p2p_ad
					SET remaining_amount = remaining_amount + (${t.amount_asset}::numeric)
					WHERE id = ${t.ad_id}::uuid
				`,"SELL"===t.ad_side&&t.ad_inventory_hold_id&&await e`
						UPDATE ex_hold
						SET
							remaining_amount = remaining_amount + (${t.amount_asset}::numeric)
						WHERE id = ${t.ad_inventory_hold_id}::uuid
							AND status = 'active'
					`,await e`
					INSERT INTO p2p_chat_message (order_id, sender_id, content)
					VALUES (${t.id}::uuid, NULL, 'System: Order expired due to payment timeout. Escrow released.')
				`,await (0,R.createNotification)(e,{userId:t.buyer_id,type:"p2p_order_cancelled",title:"P2P Order Expired",body:`Order ${t.id.slice(0,8)} expired. Funds were released back to the seller.`,metadata:{order_id:t.id,reason:"expired"}}),await (0,R.createNotification)(e,{userId:t.seller_id,type:"p2p_order_cancelled",title:"P2P Order Expired",body:`Order ${t.id.slice(0,8)} expired. Your escrow was released back to your available balance.`,metadata:{order_id:t.id,reason:"expired"}});return{expiringSoonCount:t.length,expiringSoonIds:t.map(e=>e.id),expiredCount:r.length,expiredIds:r.map(e=>e.id)}});return h.NextResponse.json({ok:!0,...e})}catch(e){return console.error("P2P expire-orders cron failed:",e),h.NextResponse.json({ok:!1,error:"internal_error"},{status:500})}}async function g(e){return w(e)}e.s(["GET",()=>g,"POST",()=>w,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],836838);var S=e.i(836838);let T=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/p2p/cron/expire-orders/route",pathname:"/api/p2p/cron/expire-orders",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/p2p/cron/expire-orders/route.ts",nextConfigOutput:"",userland:S}),{workAsyncStorage:N,workUnitAsyncStorage:A,serverHooks:v}=T;function b(){return(0,a.patchFetch)({workAsyncStorage:N,workUnitAsyncStorage:A})}async function I(e,t,a){T.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/p2p/cron/expire-orders/route";h=h.replace(/\/index$/,"")||"/";let y=await T.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:R,params:w,nextConfig:g,parsedUrl:S,isDraftMode:N,prerenderManifest:A,routerServerContext:v,isOnDemandRevalidate:b,revalidateOnlyGenerated:I,resolvedPathname:C,clientReferenceManifest:O,serverActionsManifest:$}=y,P=(0,o.normalizeAppPath)(h),D=!!(A.dynamicRoutes[P]||A.routes[C]),M=async()=>((null==v?void 0:v.render404)?await v.render404(e,t,S,!1):t.end("This page could not be found"),null);if(D&&!N){let e=!!A.routes[C],t=A.dynamicRoutes[P];if(t&&!1===t.fallback&&!e){if(g.experimental.adapterPath)return await M();throw new f.NoFallbackError}}let H=null;!D||T.isDev||N||(H="/index"===(H=C)?"/":H);let U=!0===T.isDev||!D,L=D&&!U;$&&O&&(0,d.setManifestsSingleton)({page:h,clientReferenceManifest:O,serverActionsManifest:$});let q=e.method||"GET",j=(0,n.getTracer)(),k=j.getActiveScopeSpan(),W={params:w,prerenderManifest:A,renderOpts:{experimental:{authInterrupts:!!g.experimental.authInterrupts},cacheComponents:!!g.cacheComponents,supportsDynamicResponse:U,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:g.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>T.onRequestError(e,t,a,i,v)},sharedContext:{buildId:R}},F=new s.NodeNextRequest(e),K=new s.NodeNextResponse(t),G=l.NextRequestAdapter.fromNodeNextRequest(F,(0,l.signalFromNodeResponse)(t));try{let d=async e=>T.handle(G,W).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=j.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${q} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${q} ${h}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),s=async i=>{var n,s;let l=async({previousCacheEntry:r})=>{try{if(!o&&b&&I&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await d(i);e.fetchMetrics=W.renderOpts.fetchMetrics;let s=W.renderOpts.pendingWaitUntil;s&&a.waitUntil&&(a.waitUntil(s),s=void 0);let l=W.renderOpts.collectedTags;if(!D)return await (0,p.sendResponse)(F,K,n,W.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,_.toNodeOutgoingHttpHeaders)(n.headers);l&&(t[E.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==W.renderOpts.collectedRevalidate&&!(W.renderOpts.collectedRevalidate>=E.INFINITE_CACHE)&&W.renderOpts.collectedRevalidate,a=void 0===W.renderOpts.collectedExpire||W.renderOpts.collectedExpire>=E.INFINITE_CACHE?void 0:W.renderOpts.collectedExpire;return{value:{kind:m.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await T.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:b})},!1,v),t}},u=await T.handleResponse({req:e,nextConfig:g,cacheKey:H,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:A,isRoutePPREnabled:!1,isOnDemandRevalidate:b,revalidateOnlyGenerated:I,responseGenerator:l,waitUntil:a.waitUntil,isMinimalMode:o});if(!D)return null;if((null==u||null==(n=u.value)?void 0:n.kind)!==m.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(s=u.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",b?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),N&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,_.fromNodeOutgoingHttpHeaders)(u.value.headers);return o&&D||f.delete(E.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,x.getCacheControlHeader)(u.cacheControl)),await (0,p.sendResponse)(F,K,new Response(u.value.body,{headers:f,status:u.value.status||200})),null};k?await s(k):await j.withPropagatedContext(e.headers,()=>j.trace(u.BaseServerSpan.handleRequest,{spanName:`${q} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":q,"http.target":e.url}},s))}catch(t){if(t instanceof f.NoFallbackError||await T.onRequestError(e,t,{routerKind:"App Router",routePath:P,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:b})},!1,v),D)throw t;return await (0,p.sendResponse)(F,K,new Response(null,{status:500})),null}}e.s(["handler",()=>I,"patchFetch",()=>b,"routeModule",()=>T,"serverHooks",()=>v,"workAsyncStorage",()=>N,"workUnitAsyncStorage",()=>A],587596)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__2461764a._.js.map