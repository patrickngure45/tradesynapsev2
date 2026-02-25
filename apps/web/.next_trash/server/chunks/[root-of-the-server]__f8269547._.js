module.exports=[324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(n){var a;if(!r(n))throw n;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function n(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function n(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function o(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),n=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(n))}return t}function s(e){return o(e.headers.get("cookie"))[r]??null}function i(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,o={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(o),"utf8")),i=n(e.secret,s);return`${s}.${i}`}function c(e){let r,a=e.token.trim(),o=a.indexOf(".");if(o<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,o),i=a.slice(o+1);if(!s||!i)return{ok:!1,error:"session_token_invalid"};let c=n(e.secret,s),u=Buffer.from(i),d=Buffer.from(c);if(u.length!==d.length||!(0,t.timingSafeEqual)(u,d))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let l=Math.floor((e.now??Date.now())/1e3);return r.exp<=l?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function u(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function d(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>i,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>o,"serializeClearSessionCookie",()=>d,"serializeSessionCookie",()=>u,"verifySessionToken",()=>c])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function n(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>n,"requireActingUserIdInProd",()=>a])},583627,e=>{"use strict";var t=e.i(977775),r=e.i(300959),a=e.i(691180);async function n(e,r){let a=(0,t.getActingUserId)(r);if(!a)return{ok:!1,error:"auth_required"};let n=await e`
    SELECT role FROM app_user WHERE id = ${a}::uuid LIMIT 1
  `;return 0===n.length?{ok:!1,error:"user_not_found"}:"admin"!==n[0].role?{ok:!1,error:"admin_required"}:{ok:!0,userId:a}}async function o(e,t){let o=(0,a.getSessionTokenFromRequest)(t),s=await n(e,t);if(s.ok)return s;if("user_not_found"===s.error||"auth_required"===s.error){let e=o?{"set-cookie":(0,a.serializeClearSessionCookie)({secure:!0})}:void 0;return{ok:!1,response:(0,r.apiError)("auth_required",{headers:e})}}return{ok:!1,response:(0,r.apiError)(s.error)}}e.s(["requireAdminForApi",()=>o])},972591,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),o=e.i(561916),s=e.i(174677),i=e.i(869741),c=e.i(316795),u=e.i(487718),d=e.i(995169),l=e.i(47587),_=e.i(666012),p=e.i(570101),m=e.i(626937),y=e.i(10372),f=e.i(193695);e.i(52474);var E=e.i(600220),v=e.i(89171),R=e.i(300959),S=e.i(583627),x=e.i(843793),h=e.i(184883);async function g(e){let t=(0,x.getSql)(),r=await (0,S.requireAdminForApi)(t,e);if(!r.ok)return r.response;try{let e=await (0,h.retryOnceOnTransientDbError)(async()=>{let[e]=await t`
        SELECT
          (SELECT count(*)::text FROM arcade_action) AS actions_total,
          (SELECT count(*)::text FROM arcade_action WHERE status = 'resolved') AS actions_resolved,
          (SELECT count(*)::text FROM arcade_inventory) AS inventory_rows,
          (SELECT coalesce(sum(quantity),0)::text FROM arcade_inventory) AS inventory_quantity
      `,r=await t`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'daily_drop'
        GROUP BY 1
        ORDER BY count(*) DESC
      `,a=await t`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'daily_drop'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,n=await t`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'calendar_daily'
        GROUP BY 1
        ORDER BY count(*) DESC
      `,o=await t`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'calendar_daily'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,s=await t`
        SELECT
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'time_vault'
        GROUP BY 1
        ORDER BY count(*) DESC
      `,i=await t`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'outcome'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'time_vault'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,c=await t`
        SELECT
          coalesce((outcome_json->'picked'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'boost_draft'
        GROUP BY 1
        ORDER BY count(*) DESC
      `,u=await t`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->'picked'->>'rarity'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'boost_draft'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,d=await t`
        SELECT
          coalesce((outcome_json->>'tier'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'ai_oracle'
        GROUP BY 1
        ORDER BY count(*) DESC
      `,l=await t`
        SELECT
          to_char(date_trunc('day', resolved_at), 'YYYY-MM-DD') AS day,
          coalesce((outcome_json->>'tier'), 'unknown') AS rarity,
          count(*)::text AS count
        FROM arcade_action
        WHERE status = 'resolved'
          AND module = 'ai_oracle'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,_=await t`
        SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
          code,
          coalesce(sum(quantity), 0)::text AS count
        FROM arcade_consumption
        WHERE kind = 'boost'
          AND created_at >= now() - interval '7 days'
        GROUP BY 1, 2
        ORDER BY day ASC
      `,[p]=await t`
        SELECT
          coalesce((SELECT sum(quantity) FROM arcade_consumption WHERE context_type = 'crafting_salvage' AND created_at >= now() - interval '7 days'), 0)::text AS items_salvaged,
          coalesce((SELECT sum(quantity) FROM arcade_consumption WHERE context_type = 'crafting_craft' AND kind = 'shard' AND code = 'arcade_shard' AND created_at >= now() - interval '7 days'), 0)::text AS shards_spent,
          coalesce((SELECT count(*) FROM arcade_consumption WHERE context_type = 'crafting_salvage' AND created_at >= now() - interval '7 days'), 0)::text AS salvage_events,
          coalesce((SELECT count(*) FROM arcade_consumption WHERE context_type = 'crafting_craft' AND created_at >= now() - interval '7 days'), 0)::text AS craft_events
      `,m=await t`
        SELECT
          module,
          count(*)::text AS n,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch from (resolved_at - requested_at)))::text AS p50_s,
          percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch from (resolved_at - requested_at)))::text AS p95_s,
          avg(extract(epoch from (resolved_at - requested_at)))::text AS avg_s
        FROM arcade_action
        WHERE status = 'resolved'
          AND resolved_at >= now() - interval '7 days'
        GROUP BY 1
        ORDER BY module ASC
      `,y=await t`
        SELECT
          module,
          count(*)::text AS count
        FROM arcade_action
        WHERE status IN ('committed', 'scheduled')
          AND resolves_at IS NOT NULL
          AND resolves_at < now()
        GROUP BY 1
        ORDER BY count(*) DESC
      `;return{counts:{actions_total:Number(e?.actions_total??"0"),actions_resolved:Number(e?.actions_resolved??"0"),inventory_rows:Number(e?.inventory_rows??"0"),inventory_quantity:Number(e?.inventory_quantity??"0")},daily_drop:{distribution_all_time:r.map(e=>({rarity:e.rarity,count:Number(e.count??"0")})),distribution_7d:a.map(e=>({day:e.day,rarity:e.rarity,count:Number(e.count??"0")}))},calendar_daily:{distribution_all_time:n.map(e=>({rarity:e.rarity,count:Number(e.count??"0")})),distribution_7d:o.map(e=>({day:e.day,rarity:e.rarity,count:Number(e.count??"0")}))},time_vault:{distribution_all_time:s.map(e=>({rarity:e.rarity,count:Number(e.count??"0")})),distribution_7d:i.map(e=>({day:e.day,rarity:e.rarity,count:Number(e.count??"0")}))},boost_draft:{distribution_all_time:c.map(e=>({rarity:e.rarity,count:Number(e.count??"0")})),distribution_7d:u.map(e=>({day:e.day,rarity:e.rarity,count:Number(e.count??"0")}))},ai_oracle:{distribution_all_time:d.map(e=>({rarity:e.rarity,count:Number(e.count??"0")})),distribution_7d:l.map(e=>({day:e.day,rarity:e.rarity,count:Number(e.count??"0")}))},latency_7d:m.map(e=>({module:e.module,n:Number(e.n??"0"),p50_s:Number(e.p50_s??"0"),p95_s:Number(e.p95_s??"0"),avg_s:Number(e.avg_s??"0")})),overdue:y.map(e=>({module:e.module,count:Number(e.count??"0")})),boost_consumption_7d:_.map(e=>({day:e.day,code:e.code,count:Number(e.count??"0")})),crafting_7d:{items_salvaged:Number(p?.items_salvaged??"0"),shards_spent:Number(p?.shards_spent??"0"),salvage_events:Number(p?.salvage_events??"0"),craft_events:Number(p?.craft_events??"0")}}});return v.NextResponse.json({ok:!0,...e},{status:200})}catch(t){let e=(0,h.responseForDbError)("admin_arcade_transparency",t);if(e)return e;return(0,R.apiError)("internal_error")}}e.s(["GET",()=>g,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],769900);var A=e.i(769900);let w=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/admin/arcade/transparency/route",pathname:"/api/admin/arcade/transparency",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/admin/arcade/transparency/route.ts",nextConfigOutput:"",userland:A}),{workAsyncStorage:b,workUnitAsyncStorage:N,serverHooks:O}=w;function C(){return(0,a.patchFetch)({workAsyncStorage:b,workUnitAsyncStorage:N})}async function k(e,t,a){w.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let v="/api/admin/arcade/transparency/route";v=v.replace(/\/index$/,"")||"/";let R=await w.prepare(e,t,{srcPage:v,multiZoneDraftMode:!1});if(!R)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:S,params:x,nextConfig:h,parsedUrl:g,isDraftMode:A,prerenderManifest:b,routerServerContext:N,isOnDemandRevalidate:O,revalidateOnlyGenerated:C,resolvedPathname:k,clientReferenceManifest:D,serverActionsManifest:T}=R,M=(0,i.normalizeAppPath)(v),q=!!(b.dynamicRoutes[M]||b.routes[k]),P=async()=>((null==N?void 0:N.render404)?await N.render404(e,t,g,!1):t.end("This page could not be found"),null);if(q&&!A){let e=!!b.routes[k],t=b.dynamicRoutes[M];if(t&&!1===t.fallback&&!e){if(h.experimental.adapterPath)return await P();throw new f.NoFallbackError}}let Y=null;!q||w.isDev||A||(Y="/index"===(Y=k)?"/":Y);let F=!0===w.isDev||!q,H=q&&!F;T&&D&&(0,s.setManifestsSingleton)({page:v,clientReferenceManifest:D,serverActionsManifest:T});let U=e.method||"GET",I=(0,o.getTracer)(),L=I.getActiveScopeSpan(),j={params:x,prerenderManifest:b,renderOpts:{experimental:{authInterrupts:!!h.experimental.authInterrupts},cacheComponents:!!h.cacheComponents,supportsDynamicResponse:F,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:h.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>w.onRequestError(e,t,a,n,N)},sharedContext:{buildId:S}},B=new c.NodeNextRequest(e),W=new c.NodeNextResponse(t),G=u.NextRequestAdapter.fromNodeNextRequest(B,(0,u.signalFromNodeResponse)(t));try{let s=async e=>w.handle(G,j).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=I.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${U} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${U} ${v}`)}),i=!!(0,n.getRequestMeta)(e,"minimalMode"),c=async n=>{var o,c;let u=async({previousCacheEntry:r})=>{try{if(!i&&O&&C&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await s(n);e.fetchMetrics=j.renderOpts.fetchMetrics;let c=j.renderOpts.pendingWaitUntil;c&&a.waitUntil&&(a.waitUntil(c),c=void 0);let u=j.renderOpts.collectedTags;if(!q)return await (0,_.sendResponse)(B,W,o,j.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(o.headers);u&&(t[y.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==j.renderOpts.collectedRevalidate&&!(j.renderOpts.collectedRevalidate>=y.INFINITE_CACHE)&&j.renderOpts.collectedRevalidate,a=void 0===j.renderOpts.collectedExpire||j.renderOpts.collectedExpire>=y.INFINITE_CACHE?void 0:j.renderOpts.collectedExpire;return{value:{kind:E.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await w.onRequestError(e,t,{routerKind:"App Router",routePath:v,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:O})},!1,N),t}},d=await w.handleResponse({req:e,nextConfig:h,cacheKey:Y,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:b,isRoutePPREnabled:!1,isOnDemandRevalidate:O,revalidateOnlyGenerated:C,responseGenerator:u,waitUntil:a.waitUntil,isMinimalMode:i});if(!q)return null;if((null==d||null==(o=d.value)?void 0:o.kind)!==E.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(c=d.value)?void 0:c.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});i||t.setHeader("x-nextjs-cache",O?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),A&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,p.fromNodeOutgoingHttpHeaders)(d.value.headers);return i&&q||f.delete(y.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,_.sendResponse)(B,W,new Response(d.value.body,{headers:f,status:d.value.status||200})),null};L?await c(L):await I.withPropagatedContext(e.headers,()=>I.trace(d.BaseServerSpan.handleRequest,{spanName:`${U} ${v}`,kind:o.SpanKind.SERVER,attributes:{"http.method":U,"http.target":e.url}},c))}catch(t){if(t instanceof f.NoFallbackError||await w.onRequestError(e,t,{routerKind:"App Router",routePath:M,routeType:"route",revalidateReason:(0,l.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:O})},!1,N),q)throw t;return await (0,_.sendResponse)(B,W,new Response(null,{status:500})),null}}e.s(["handler",()=>k,"patchFetch",()=>C,"routeModule",()=>w,"serverHooks",()=>O,"workAsyncStorage",()=>b,"workUnitAsyncStorage",()=>N],972591)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__f8269547._.js.map