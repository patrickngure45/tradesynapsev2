module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(a,{status:r,headers:i})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),i=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(i))}return t}function s(e){return n(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(n),"utf8")),o=i(e.secret,s);return`${s}.${o}`}function d(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,n),o=a.slice(n+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let d=i(e.secret,s),u=Buffer.from(o),l=Buffer.from(d);if(u.length!==l.length||!(0,t.timingSafeEqual)(u,l))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let c=Math.floor((e.now??Date.now())/1e3);return r.exp<=c?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function u(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function l(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>l,"serializeSessionCookie",()=>u,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function i(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>i,"requireActingUserIdInProd",()=>a])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===r.length?"user_not_found":"active"!==r[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},90878,e=>{"use strict";async function t(e,t){await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(r,Math.trunc(i))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var s;let o,d,u,l,c,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(i.title??"").trim()||"Notification",m=String(i.body??""),y=(s=i.type,(d=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=d),(u=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=u),(l=t(o,"tx_hash","txHash"))&&(o.tx_hash=l),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(c=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),i=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&c.startsWith("/")&&(o.href=c),o);if("system"!==i.type){let t=await a(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*a),n=60*i.getUTCHours()+i.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?n>=s&&n<o:n>=s||n<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${f}, ${m}, ${y}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let w="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${f},
        ${m},
        ${y}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];w=t.id;try{let r=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:f,body:m,metadata_json:y,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${i.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",a=t?.email_verified===!0;if(r&&r.includes("@")&&a){let t=`[Coinwaka] ${f}`,a=m?`${f}

${m}`:f,s=m?`<p><strong>${n(f)}</strong></p><p>${n(m)}</p>`:`<p><strong>${n(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${i.userId}::uuid,
            ${r},
            'notification',
            ${i.type},
            ${t},
            ${a},
            ${s},
            ${y}::jsonb
          )
        `}}catch{}return w}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}async function u(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>s,"markAllRead",()=>u,"markRead",()=>d])},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,i=t.max??60;return{consume:async function(t){let n=(await e`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${r}, ${t}, ${i-1}, ${a}, ${i}, now())
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
        window_ms   = ${a},
        max_tokens  = ${i}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `)[0],s=Number(n.window_start_ms)+a,o=Math.max(0,n.tokens);return{allowed:n.tokens>=0,remaining:o,resetMs:s,limit:i}},name:r}}e.s(["createPgRateLimiter",()=>t])},333561,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),i=e.i(759756),n=e.i(561916),s=e.i(174677),o=e.i(869741),d=e.i(316795),u=e.i(487718),l=e.i(995169),c=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),m=e.i(10372),y=e.i(193695);e.i(52474);var w=e.i(600220),h=e.i(469719),E=e.i(300959),g=e.i(364608),x=e.i(977775),R=e.i(90878),v=e.i(843793),b=e.i(194748),S=e.i(831075);let k=h.z.object({reason:h.z.string().min(5).max(2e3)}),T=null;async function A(e,t){let r=(0,v.getSql)();try{let a=(await t.params).id,i=(0,x.getActingUserId)(e),n=(0,x.requireActingUserIdInProd)(i);if(n)return(0,E.apiError)(n);if(!i)return(0,E.apiError)("unauthorized",{status:401});let s=await (0,g.requireActiveUser)(r,i);if(s)return(0,E.apiError)(s);let o=await (function(){if(T)return T;let e=(0,v.getSql)();return T=(0,S.createPgRateLimiter)(e,{name:"p2p-dispute",windowMs:6e4,max:10})})().consume(`user:${i}`);if(!o.allowed)return(0,E.apiError)("rate_limit_exceeded",{status:429,details:{limit:o.limit,remaining:o.remaining,resetMs:o.resetMs}});let d=await e.json().catch(()=>null),u=k.safeParse(d);if(!u.success)return(0,E.apiError)("invalid_input",{status:400,details:u.error.issues});let l=u.data.reason.trim();if(!l)return(0,E.apiError)("invalid_input",{status:400});let c=(0,R.auditContextFromRequest)(e);return await r.begin(async e=>{let t=await e`
        SELECT id::text, status, buyer_id::text, seller_id::text
        FROM p2p_order
        WHERE id = ${a}::uuid
          AND (buyer_id = ${i}::uuid OR seller_id = ${i}::uuid)
        FOR UPDATE
      `;if(0===t.length)return(0,E.apiError)("order_not_found",{status:404});let r=t[0];if("completed"===r.status||"cancelled"===r.status)return(0,E.apiError)("trade_not_disputable",{status:409});if("disputed"===r.status)return(0,E.apiError)("dispute_already_exists",{status:409});let n=await e`
        INSERT INTO p2p_dispute (order_id, opened_by_user_id, reason, status)
        VALUES (${a}::uuid, ${i}::uuid, ${l}, 'open')
        ON CONFLICT (order_id) DO NOTHING
        RETURNING id
      `;if(0===n.length)return(0,E.apiError)("dispute_already_exists",{status:409});await e`
        UPDATE p2p_order
        SET status = 'disputed'
        WHERE id = ${a}::uuid
      `,await e`
        INSERT INTO p2p_chat_message (order_id, sender_id, content, metadata)
        VALUES (
          ${a}::uuid,
          NULL,
          'System: Dispute opened. Support will review this order.',
          ${JSON.stringify({type:"dispute_opened"})}::jsonb
        )
      `;let s=i===r.buyer_id?r.seller_id:r.buyer_id;return await (0,b.createNotification)(e,{userId:s,type:"p2p_dispute_opened",title:"Dispute opened",body:`A dispute was opened for order ${a.slice(0,8)}.`,metadata:{order_id:a}}),await (0,R.writeAuditLog)(e,{actorId:i,actorType:"user",action:"p2p.dispute.opened",resourceType:"p2p_order",resourceId:a,detail:{order_id:a,dispute_id:n[0].id,reason:l},...c}),Response.json({ok:!0,dispute_id:n[0].id})})}catch(e){if(console.error("[POST /api/p2p/orders/:id/dispute] error",e),e instanceof Response)return e;return(0,E.apiError)("internal_error")}}e.s(["POST",()=>A,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],609083);var N=e.i(609083);let $=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/p2p/orders/[id]/dispute/route",pathname:"/api/p2p/orders/[id]/dispute",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/p2p/orders/[id]/dispute/route.ts",nextConfigOutput:"",userland:N}),{workAsyncStorage:I,workUnitAsyncStorage:C,serverHooks:O}=$;function q(){return(0,a.patchFetch)({workAsyncStorage:I,workUnitAsyncStorage:C})}async function M(e,t,a){$.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/p2p/orders/[id]/dispute/route";h=h.replace(/\/index$/,"")||"/";let E=await $.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!E)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:g,params:x,nextConfig:R,parsedUrl:v,isDraftMode:b,prerenderManifest:S,routerServerContext:k,isOnDemandRevalidate:T,revalidateOnlyGenerated:A,resolvedPathname:N,clientReferenceManifest:I,serverActionsManifest:C}=E,O=(0,o.normalizeAppPath)(h),q=!!(S.dynamicRoutes[O]||S.routes[N]),M=async()=>((null==k?void 0:k.render404)?await k.render404(e,t,v,!1):t.end("This page could not be found"),null);if(q&&!b){let e=!!S.routes[N],t=S.dynamicRoutes[O];if(t&&!1===t.fallback&&!e){if(R.experimental.adapterPath)return await M();throw new y.NoFallbackError}}let U=null;!q||$.isDev||b||(U="/index"===(U=N)?"/":U);let L=!0===$.isDev||!q,P=q&&!L;C&&I&&(0,s.setManifestsSingleton)({page:h,clientReferenceManifest:I,serverActionsManifest:C});let H=e.method||"GET",j=(0,n.getTracer)(),D=j.getActiveScopeSpan(),F={params:x,prerenderManifest:S,renderOpts:{experimental:{authInterrupts:!!R.experimental.authInterrupts},cacheComponents:!!R.cacheComponents,supportsDynamicResponse:L,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:R.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>$.onRequestError(e,t,a,i,k)},sharedContext:{buildId:g}},W=new d.NodeNextRequest(e),V=new d.NodeNextResponse(t),B=u.NextRequestAdapter.fromNodeNextRequest(W,(0,u.signalFromNodeResponse)(t));try{let s=async e=>$.handle(B,F).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=j.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==l.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${H} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${H} ${h}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),d=async i=>{var n,d;let u=async({previousCacheEntry:r})=>{try{if(!o&&T&&A&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await s(i);e.fetchMetrics=F.renderOpts.fetchMetrics;let d=F.renderOpts.pendingWaitUntil;d&&a.waitUntil&&(a.waitUntil(d),d=void 0);let u=F.renderOpts.collectedTags;if(!q)return await (0,_.sendResponse)(W,V,n,F.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);u&&(t[m.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==F.renderOpts.collectedRevalidate&&!(F.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&F.renderOpts.collectedRevalidate,a=void 0===F.renderOpts.collectedExpire||F.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:F.renderOpts.collectedExpire;return{value:{kind:w.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await $.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:T})},!1,k),t}},l=await $.handleResponse({req:e,nextConfig:R,cacheKey:U,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:A,responseGenerator:u,waitUntil:a.waitUntil,isMinimalMode:o});if(!q)return null;if((null==l||null==(n=l.value)?void 0:n.kind)!==w.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(d=l.value)?void 0:d.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",T?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),b&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let y=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return o&&q||y.delete(m.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||y.get("Cache-Control")||y.set("Cache-Control",(0,f.getCacheControlHeader)(l.cacheControl)),await (0,_.sendResponse)(W,V,new Response(l.value.body,{headers:y,status:l.value.status||200})),null};D?await d(D):await j.withPropagatedContext(e.headers,()=>j.trace(l.BaseServerSpan.handleRequest,{spanName:`${H} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":H,"http.target":e.url}},d))}catch(t){if(t instanceof y.NoFallbackError||await $.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:P,isOnDemandRevalidate:T})},!1,k),q)throw t;return await (0,_.sendResponse)(W,V,new Response(null,{status:500})),null}}e.s(["handler",()=>M,"patchFetch",()=>q,"routeModule",()=>$,"serverHooks",()=>O,"workAsyncStorage",()=>I,"workUnitAsyncStorage",()=>C],333561)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__cc3fb77c._.js.map