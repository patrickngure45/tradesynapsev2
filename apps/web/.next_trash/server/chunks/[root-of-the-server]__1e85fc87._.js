module.exports=[324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(a,{status:r,headers:i})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),i=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(i))}return t}function s(e){return n(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(n),"utf8")),o=i(e.secret,s);return`${s}.${o}`}function u(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,n),o=a.slice(n+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let u=i(e.secret,s),l=Buffer.from(o),c=Buffer.from(u);if(l.length!==c.length||!(0,t.timingSafeEqual)(l,c))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let d=Math.floor((e.now??Date.now())/1e3);return r.exp<=d?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function l(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function c(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>c,"serializeSessionCookie",()=>l,"verifySessionToken",()=>u])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function i(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>i,"requireActingUserIdInProd",()=>a])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
    SELECT status
    FROM app_user
    WHERE id = ${t}
    LIMIT 1
  `;return 0===r.length?"user_not_found":"active"!==r[0].status?"user_not_active":null}e.s(["requireActiveUser",()=>t])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(r,Math.trunc(i))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var s;let o,u,l,c,d,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(i.title??"").trim()||"Notification",m=String(i.body??""),b=(s=i.type,(u=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=u),(l=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=l),(c=t(o,"tx_hash","txHash"))&&(o.tx_hash=c),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(d=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),i=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&d.startsWith("/")&&(o.href=d),o);if("system"!==i.type){let t=await a(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*a),n=60*i.getUTCHours()+i.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?n>=s&&n<o:n>=s||n<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${f}, ${m}, ${b}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let h="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${f},
        ${m},
        ${b}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];h=t.id;try{let r=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:f,body:m,metadata_json:b,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
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
            ${b}::jsonb
          )
        `}}catch{}return h}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `;return Number(r[0]?.count??"0")}async function u(e,t){return 0===t.ids.length?0:(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t.userId}::uuid
      AND id = ANY(${t.ids}::uuid[])
      AND read = false
  `).count}async function l(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>s,"markAllRead",()=>l,"markRead",()=>u])},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,i=t.max??60;return{consume:async function(t){let n=(await e`
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
    `)[0],s=Number(n.window_start_ms)+a,o=Math.max(0,n.tokens);return{allowed:n.tokens>=0,remaining:o,resetMs:s,limit:i}},name:r}}e.s(["createPgRateLimiter",()=>t])},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,r)=>{t.exports=e.x("buffer",()=>require("buffer"))},136799,e=>{"use strict";var t=e.i(29984);function r(e,t,r){return Math.min(r,Math.max(t,e))}function a(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function i(e){return e.trim().toUpperCase()}let n=["binance","bybit","okx","kucoin","gateio","bitget","mexc"],s=new Map;async function o(e,t,r){let a=0,i=Array.from({length:Math.min(Math.max(1,Math.floor(t)),e.length)},async()=>{for(;;){let t=a++;if(t>=e.length)return;await r(e[t])}});await Promise.allSettled(i)}async function u(e){var u;let l,c,d,_,p,f,m=i(e);if(!m||"USDT"===m)return null;let b=`${i(m)}USDT`,h=s.get(b);if(h&&h.validUntil.getTime()>Date.now())return h;let y=function(){let e=process.env.MARKETS_INDEX_EXCHANGES;if(!e)return n;let t=new Set(n),r=e.split(/[\n,]/g).map(e=>e.trim().toLowerCase()).filter(Boolean).filter(e=>t.has(e)),a=[],i=new Set;for(let e of r)i.has(e)||(i.add(e),a.push(e));return a.length?a:n}(),g=[],x=r(Number.isFinite(c=(l=process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS??process.env.CCXT_TICKER_TIMEOUT_MS)?Number(l):NaN)?c:3500,500,2e4);await o(y,r(Number.isFinite(_=(d=process.env.MARKETS_INDEX_CONCURRENCY)?Number(d):NaN)?_:4,1,10),async e=>{try{let r=await Promise.race([(0,t.getExchangeTicker)(e,b),new Promise((t,r)=>setTimeout(()=>r(Error(`timeout:getExchangeTicker:${e}`)),x))]),i=a(r.bid),n=a(r.ask),s=a(r.last),o=i&&n?(i+n)/2:s;g.push({exchange:e,symbol:b,bid:i,ask:n,last:s,mid:o,ts:r.ts})}catch(t){g.push({exchange:e,symbol:b,bid:null,ask:null,last:null,mid:null,ts:Date.now(),error:t instanceof Error?t.message:String(t)})}});let w=g.map(e=>e.mid).filter(e=>"number"==typeof e&&Number.isFinite(e)&&e>0),E=function(e){if(!e.length)return null;let t=[...e].sort((e,t)=>e-t),r=Math.floor(t.length/2);return t.length%2==1?t[r]:(t[r-1]+t[r])/2}(w);if(!E)return null;let S=new Date,k={base:m,quote:"USDT",symbol:b,mid:E,sources:g,sourcesUsed:w.length,dispersionBps:function(e,t){if(e.length<3)return null;let r=[...e].sort((e,t)=>e-t),a=r[Math.floor((r.length-1)*.1)],i=r[Math.floor((r.length-1)*.9)];return!Number.isFinite(t)||t<=0?null:(i-a)/t*1e4}(w,E),computedAt:S,validUntil:(u=r(Number.isFinite(f=(p=process.env.MARKETS_INDEX_TTL_MS)?Number(p):NaN)?f:15e3,2e3,12e4),new Date(Date.now()+u))};return s.set(b,k),k}e.s(["getExternalIndexUsdt",()=>u])},332935,e=>{"use strict";var t=e.i(136799);function r(e,t,r){return Math.min(r,Math.max(t,e))}function a(e){if("number"==typeof e)return Number.isFinite(e)?e:null;if("string"==typeof e){let t=Number(e);return Number.isFinite(t)?t:null}return null}function i(e){if(!e||"object"!=typeof e)return!1;if("42P01"===e.code)return!0;let t="string"==typeof e.message?e.message:"";return/relation\s+"[^"]+"\s+does\s+not\s+exist/i.test(t)}async function n(e){let t=e.toUpperCase();if(!/^[A-Z]{2,5}$/.test(t))return null;if("USD"===t||"USDT"===t)return 1;let i=process.env[`FX_USD_FIAT_OVERRIDE_${t}`]??process.env.FX_USD_FIAT_OVERRIDE;if(i){let e=Number(i);if(Number.isFinite(e)&&e>0)return e}let n=r(Number(process.env.FX_LIVE_TIMEOUT_MS??"2500"),500,1e4),s=new AbortController,o=setTimeout(()=>s.abort(),n);try{let e=`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(t)}`,r=await fetch(e,{method:"GET",cache:"no-store",signal:s.signal,headers:{accept:"application/json"}});if(r.ok){let e=await r.json(),i=e?.rates?.[t],n=a(i);if(n&&n>0)return n}let i=await fetch("https://open.er-api.com/v6/latest/USD",{method:"GET",cache:"no-store",signal:s.signal,headers:{accept:"application/json"}});if(!i.ok)return null;let n=await i.json(),o=n?.rates?.[t],u=a(o);return u&&u>0?u:null}catch{return null}finally{clearTimeout(o)}}async function s(e){let r=e.trim().toUpperCase();if(!r)return null;if("USDT"===r||"USD"===r)return 1;let a=await (0,t.getExternalIndexUsdt)(r),i=a?.mid;return i&&Number.isFinite(i)&&i>0?i:null}async function o(e,t){let r=await e`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${t.toUpperCase()} AND is_enabled = true
    LIMIT 1
  `;return r[0]?.id??null}async function u(e,t,r){let i=await o(e,t);if(!i)return null;let n=await e`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${i}::uuid
      AND fiat_currency = ${r.toUpperCase()}
      AND side = 'BUY'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price DESC
    LIMIT 1
  `,s=await e`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${i}::uuid
      AND fiat_currency = ${r.toUpperCase()}
      AND side = 'SELL'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price ASC
    LIMIT 1
  `,u=a(n[0]?.price??null),l=a(s[0]?.price??null);if(!u&&!l)return null;let c=u&&l?(u+l)/2:u??l;return{bid:u??c,ask:l??c,mid:c,sources:{kind:"p2p_fixed_top",asset:t.toUpperCase(),fiat:r.toUpperCase(),top_bid:u,top_ask:l}}}async function l(e,t,o,l){let c=r(l?.ttlMs??Number(process.env.FX_REFERENCE_TTL_MS??"20000"),2e3,12e4),d=t.toUpperCase(),_=o.toUpperCase();try{let t=await e`
      SELECT bid::text, ask::text, mid::text, sources, computed_at::text, valid_until::text
      FROM fx_reference_rate
      WHERE base_symbol = ${d} AND quote_symbol = ${_} AND valid_until > now()
      ORDER BY computed_at DESC
      LIMIT 1
    `;if(t.length){let e=t[0],r=a(e.bid),i=a(e.ask),n=a(e.mid);if(r&&i&&n)return{base:d,quote:_,bid:r,ask:i,mid:n,sources:e.sources??{},computedAt:new Date(e.computed_at),validUntil:new Date(e.valid_until)}}}catch(e){if(!i(e))throw e}let p=null;if(_.length<2)return null;let f=await (async()=>{let t=await n(_);if(t){let e=r(Number(process.env.FX_USDT_FIAT_FALLBACK_SPREAD_BPS??"10"),0,500),a=e/2/1e4,i=t*(1-a),n=t*(1+a);return{bid:i,ask:n,mid:(i+n)/2,sources:{kind:"live_usd_fiat_fallback",base:"USDT",quote:_,usd_fiat_mid:t,spread_bps:e,note:"USDT pegged to USD for fallback conversion"}}}let a=await u(e,"USDT",_);return a||null})();if(!f)return null;if("USDT"===d)p=f;else{let e=await s(d);if(!e)return null;let t=e*f.mid;if(!Number.isFinite(t)||t<=0)return null;let a=r(Number(process.env.FX_ASSET_FIAT_SPREAD_BPS??"20"),0,500),i=a/2/1e4;p={bid:t*(1-i),ask:t*(1+i),mid:t,sources:{kind:"chained_external_index_usdt",base:d,quote:_,base_usdt_mid:e,usdt_fiat_mid:f.mid,usdt_fiat_sources:f.sources,spread_bps:a}}}let m=new Date,b=new Date(Date.now()+c);try{await e`
      INSERT INTO fx_reference_rate (base_symbol, quote_symbol, bid, ask, mid, sources, computed_at, valid_until)
      VALUES (
        ${d},
        ${_},
        (${p.bid}::numeric),
        (${p.ask}::numeric),
        (${p.mid}::numeric),
        ${JSON.stringify(p.sources)}::jsonb,
        ${m.toISOString()}::timestamptz,
        ${b.toISOString()}::timestamptz
      )
    `}catch(e){i(e)}return{base:d,quote:_,bid:p.bid,ask:p.ask,mid:p.mid,sources:p.sources,computedAt:m,validUntil:b}}e.s(["getOrComputeFxReferenceRate",()=>l])},794383,e=>{"use strict";function t(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function r(e){return"string"==typeof e?e.trim().length>0:"number"==typeof e?Number.isFinite(e):"boolean"==typeof e}function a(e){if(!Array.isArray(e))return[];let r=[];for(let a of e){if(!t(a))continue;let e="string"==typeof a.identifier?a.identifier.trim():"",i="string"==typeof a.name?a.name.trim():e,n="string"==typeof a.id?a.id:void 0,s=t(a.details)?a.details:null;(e||i)&&r.push({id:n,identifier:e||i,name:i||e,details:s})}return r}function i(e){return!!e.length&&e.some(e=>!!e.details&&!!t(e.details)&&Object.values(e.details).some(r))}e.s(["hasUsablePaymentDetails",()=>i,"normalizePaymentMethodSnapshot",()=>a])},842026,e=>{"use strict";let t={Africa:["Kenya","Tanzania","Uganda","Rwanda","Burundi","Democratic Republic of the Congo","South Africa","Nigeria","Ghana","Ethiopia","Somalia","Sudan","Egypt"],"Middle East":["United Arab Emirates","Saudi Arabia","Qatar","Kuwait","Oman","Bahrain","Israel","Jordan"],Europe:["United Kingdom","Germany","France","Italy","Netherlands","Sweden","Norway","Spain","Switzerland","Ireland","Belgium","Austria","Denmark"],"North America":["United States","Canada"],Asia:["India","China","Pakistan","Bangladesh","Philippines","Malaysia","Singapore","Japan","South Korea"],Oceania:["Australia","New Zealand"]};function r(e){return e.trim().toLowerCase().replace(/[^a-z0-9]+/g,"")}let a={ke:"kenya",tz:"tanzania",ug:"uganda",rw:"rwanda",bi:"burundi",cd:"democraticrepublicofthecongo",za:"southafrica",ng:"nigeria",gh:"ghana",et:"ethiopia",so:"somalia",sd:"sudan",eg:"egypt",uk:"unitedkingdom",uae:"unitedarabemirates",usa:"unitedstates",us:"unitedstates",drc:"democraticrepublicofthecongo",drcongo:"democraticrepublicofthecongo","drcongo(drc)":"democraticrepublicofthecongo",democraticrepublicofcongo:"democraticrepublicofthecongo",congodrc:"democraticrepublicofthecongo",republicofkorea:"southkorea",korea:"southkorea",unitedrepublicoftanzania:"tanzania"},i=(()=>{let e=new Set(Object.values(t).flat().map(e=>r(e)));for(let[t,i]of Object.entries(a))e.add(r(t)),e.add(r(i));return e})();function n(e){let t=(e??"").trim();if(!t)return!0;let n=r(t),s=a[n]?r(a[n]):n;return i.has(s)||i.has(n)}e.s(["isSupportedP2PCountry",()=>n])},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__1e85fc87._.js.map