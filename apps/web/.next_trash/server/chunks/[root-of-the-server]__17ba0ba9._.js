module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(n){var a;if(!r(n))throw n;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function n(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function n(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function i(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),n=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(n))}return t}function s(e){return i(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,i={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(i),"utf8")),o=n(e.secret,s);return`${s}.${o}`}function d(e){let r,a=e.token.trim(),i=a.indexOf(".");if(i<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,i),o=a.slice(i+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let d=n(e.secret,s),u=Buffer.from(o),l=Buffer.from(d);if(u.length!==l.length||!(0,t.timingSafeEqual)(u,l))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let c=Math.floor((e.now??Date.now())/1e3);return r.exp<=c?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function u(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function l(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>i,"serializeClearSessionCookie",()=>l,"serializeSessionCookie",()=>u,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function n(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>n,"requireActingUserIdInProd",()=>a])},583627,e=>{"use strict";var t=e.i(977775),r=e.i(300959),a=e.i(691180);async function n(e,r){let a=(0,t.getActingUserId)(r);if(!a)return{ok:!1,error:"auth_required"};let n=await e`
    SELECT role FROM app_user WHERE id = ${a}::uuid LIMIT 1
  `;return 0===n.length?{ok:!1,error:"user_not_found"}:"admin"!==n[0].role?{ok:!1,error:"admin_required"}:{ok:!0,userId:a}}async function i(e,t){let i=(0,a.getSessionTokenFromRequest)(t),s=await n(e,t);if(s.ok)return s;if("user_not_found"===s.error||"auth_required"===s.error){let e=i?{"set-cookie":(0,a.serializeClearSessionCookie)({secure:!0})}:void 0;return{ok:!1,response:(0,r.apiError)("auth_required",{headers:e})}}return{ok:!1,response:(0,r.apiError)(s.error)}}e.s(["requireAdminForApi",()=>i])},487557,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),i=e.i(561916),s=e.i(174677),o=e.i(869741),d=e.i(316795),u=e.i(487718),l=e.i(995169),c=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),m=e.i(10372),E=e.i(193695);e.i(52474);var y=e.i(600220),h=e.i(469719),x=e.i(300959),g=e.i(583627),R=e.i(843793),w=e.i(184883);let v=h.z.object({user_id:h.z.string().uuid().optional(),email:h.z.string().email().optional(),limit:h.z.coerce.number().int().min(1).max(500).optional()}).refine(e=>!!(e.user_id||e.email),{message:"user_id_or_email_required"});async function O(e){let t,r=(0,R.getSql)(),a=await (0,g.requireAdminForApi)(r,e);if(!a.ok)return a.response;let n=new URL(e.url),i={user_id:n.searchParams.get("user_id")??void 0,email:n.searchParams.get("email")??void 0,limit:n.searchParams.get("limit")??void 0};try{t=v.parse(i)}catch(e){return(0,x.apiZodError)(e)??(0,x.apiError)("invalid_input")}let s=t.limit??200;try{let e=await (0,w.retryOnceOnTransientDbError)(async()=>(await r`
        SELECT id, email, display_name
        FROM app_user
        WHERE 1 = 1
          ${t.user_id?r`AND id = ${t.user_id}::uuid`:r``}
          ${t.email?r`AND lower(email) = lower(${t.email})`:r``}
        LIMIT 1
      `)[0]??null);if(!e)return(0,x.apiError)("not_found",{status:404,details:"user_not_found"});let a=e.id,[n,i,o,d,u,l]=await Promise.all([(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            o.id,
            m.symbol AS market,
            o.side,
            o.type,
            o.status,
            o.price::text AS price,
            o.quantity::text AS quantity,
            o.remaining_quantity::text AS remaining_quantity,
            o.hold_id,
            o.created_at,
            o.updated_at
          FROM ex_order o
          JOIN ex_market m ON m.id = o.market_id
          WHERE o.user_id = ${a}::uuid
          ORDER BY o.created_at DESC
          LIMIT ${s}
        `),(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            e.id,
            m.symbol AS market,
            e.price::text AS price,
            e.quantity::text AS quantity,
            e.maker_order_id,
            e.taker_order_id,
            e.created_at
          FROM ex_execution e
          JOIN ex_market m ON m.id = e.market_id
          WHERE
            EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.maker_order_id AND o.user_id = ${a}::uuid)
            OR EXISTS (SELECT 1 FROM ex_order o WHERE o.id = e.taker_order_id AND o.user_id = ${a}::uuid)
          ORDER BY e.created_at DESC
          LIMIT ${s}
        `),(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            w.id,
            a.symbol AS asset,
            w.amount::text AS amount,
            w.destination_address,
            w.status,
            w.reference,
            w.tx_hash,
            w.failure_reason,
            w.created_at,
            w.updated_at,
            w.approved_by,
            w.approved_at
          FROM ex_withdrawal_request w
          JOIN ex_asset a ON a.id = w.asset_id
          WHERE w.user_id = ${a}::uuid
          ORDER BY w.created_at DESC
          LIMIT ${s}
        `),(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            n.id,
            n.type,
            n.title,
            n.body,
            n.read,
            n.metadata_json,
            n.created_at
          FROM ex_notification n
          WHERE n.user_id = ${a}::uuid
          ORDER BY n.created_at DESC
          LIMIT ${s}
        `),(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            je.id,
            je.type,
            je.reference,
            je.metadata_json,
            je.created_at,
            COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'line_id', jl.id,
                  'asset', a.symbol,
                  'amount', jl.amount::text,
                  'account_id', jl.account_id
                )
                ORDER BY jl.created_at ASC
              ) FILTER (WHERE jl.id IS NOT NULL),
              '[]'::jsonb
            ) AS lines
          FROM ex_journal_entry je
          JOIN ex_journal_line jl ON jl.entry_id = je.id
          JOIN ex_ledger_account la ON la.id = jl.account_id
          JOIN ex_asset a ON a.id = jl.asset_id
          WHERE la.user_id = ${a}::uuid
          GROUP BY je.id
          ORDER BY je.created_at DESC
          LIMIT ${s}
        `),(0,w.retryOnceOnTransientDbError)(async()=>await r`
          SELECT
            id,
            actor_id,
            actor_type,
            action,
            resource_type,
            resource_id,
            ip,
            user_agent,
            request_id,
            detail,
            created_at
          FROM audit_log
          WHERE actor_id = ${a}::uuid
          ORDER BY created_at DESC
          LIMIT ${s}
        `)]);return Response.json({user:e,limit:s,orders:n,executions:i,withdrawals:o,notifications:d,ledger_entries:u,audit:l})}catch(t){let e=(0,w.responseForDbError)("admin.account-timeline",t);if(e)return e;throw t}}e.s(["GET",()=>O,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],505875);var S=e.i(505875);let k=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/exchange/admin/account-timeline/route",pathname:"/api/exchange/admin/account-timeline",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/admin/account-timeline/route.ts",nextConfigOutput:"",userland:S}),{workAsyncStorage:b,workUnitAsyncStorage:C,serverHooks:T}=k;function N(){return(0,a.patchFetch)({workAsyncStorage:b,workUnitAsyncStorage:C})}async function A(e,t,a){k.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/exchange/admin/account-timeline/route";h=h.replace(/\/index$/,"")||"/";let x=await k.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:g,params:R,nextConfig:w,parsedUrl:v,isDraftMode:O,prerenderManifest:S,routerServerContext:b,isOnDemandRevalidate:C,revalidateOnlyGenerated:T,resolvedPathname:N,clientReferenceManifest:A,serverActionsManifest:I}=x,q=(0,o.normalizeAppPath)(h),j=!!(S.dynamicRoutes[q]||S.routes[N]),D=async()=>((null==b?void 0:b.render404)?await b.render404(e,t,v,!1):t.end("This page could not be found"),null);if(j&&!O){let e=!!S.routes[N],t=S.dynamicRoutes[q];if(t&&!1===t.fallback&&!e){if(w.experimental.adapterPath)return await D();throw new E.NoFallbackError}}let M=null;!j||k.isDev||O||(M="/index"===(M=N)?"/":M);let P=!0===k.isDev||!j,H=j&&!P;I&&A&&(0,s.setManifestsSingleton)({page:h,clientReferenceManifest:A,serverActionsManifest:I});let L=e.method||"GET",$=(0,i.getTracer)(),F=$.getActiveScopeSpan(),U={params:R,prerenderManifest:S,renderOpts:{experimental:{authInterrupts:!!w.experimental.authInterrupts},cacheComponents:!!w.cacheComponents,supportsDynamicResponse:P,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:w.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>k.onRequestError(e,t,a,n,b)},sharedContext:{buildId:g}},B=new d.NodeNextRequest(e),W=new d.NodeNextResponse(t),K=u.NextRequestAdapter.fromNodeNextRequest(B,(0,u.signalFromNodeResponse)(t));try{let s=async e=>k.handle(K,U).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=$.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==l.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${L} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${L} ${h}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),d=async n=>{var i,d;let u=async({previousCacheEntry:r})=>{try{if(!o&&C&&T&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(n);e.fetchMetrics=U.renderOpts.fetchMetrics;let d=U.renderOpts.pendingWaitUntil;d&&a.waitUntil&&(a.waitUntil(d),d=void 0);let u=U.renderOpts.collectedTags;if(!j)return await (0,_.sendResponse)(B,W,i,U.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(i.headers);u&&(t[m.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==U.renderOpts.collectedRevalidate&&!(U.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&U.renderOpts.collectedRevalidate,a=void 0===U.renderOpts.collectedExpire||U.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:U.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await k.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:C})},!1,b),t}},l=await k.handleResponse({req:e,nextConfig:w,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:C,revalidateOnlyGenerated:T,responseGenerator:u,waitUntil:a.waitUntil,isMinimalMode:o});if(!j)return null;if((null==l||null==(i=l.value)?void 0:i.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(d=l.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",C?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),O&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let E=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return o&&j||E.delete(m.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||E.get("Cache-Control")||E.set("Cache-Control",(0,f.getCacheControlHeader)(l.cacheControl)),await (0,_.sendResponse)(B,W,new Response(l.value.body,{headers:E,status:l.value.status||200})),null};F?await d(F):await $.withPropagatedContext(e.headers,()=>$.trace(l.BaseServerSpan.handleRequest,{spanName:`${L} ${h}`,kind:i.SpanKind.SERVER,attributes:{"http.method":L,"http.target":e.url}},d))}catch(t){if(t instanceof E.NoFallbackError||await k.onRequestError(e,t,{routerKind:"App Router",routePath:q,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:C})},!1,b),j)throw t;return await (0,_.sendResponse)(B,W,new Response(null,{status:500})),null}}e.s(["handler",()=>A,"patchFetch",()=>N,"routeModule",()=>k,"serverHooks",()=>T,"workAsyncStorage",()=>b,"workUnitAsyncStorage",()=>C],487557)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__17ba0ba9._.js.map