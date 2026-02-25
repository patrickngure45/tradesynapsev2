module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(a,{status:r,headers:i})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let i=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&i.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(i){var a;if(!r(i))throw i;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function i(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>i,"retryOnceOnTransientDbError",()=>a])},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,a){let i="number"==typeof e?e:Number(String(e??""));return Number.isFinite(i)?Math.max(t,Math.min(r,Math.trunc(i))):a}async function a(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function i(e,i){var s;let o,l,c,u,d,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${i.userId}::uuid
        AND type = ${i.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(i.title??"").trim()||"Notification",m=String(i.body??""),h=(s=i.type,(l=t(o={...i.metadata??{}},"order_id","orderId"))&&(o.order_id=l),(c=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=c),(u=t(o,"tx_hash","txHash"))&&(o.tx_hash=u),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(d=t(o,"href")??function(e,r){let a=t(r,"order_id","orderId"),i=t(r,"withdrawal_id","withdrawalId"),n=t(r,"asset_symbol","assetSymbol","symbol");if(a&&e.startsWith("p2p_"))return`/p2p/orders/${a}`;if(i&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return n?`/p2p?side=SELL&asset=${encodeURIComponent(n)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&d.startsWith("/")&&(o.href=d),o);if("system"!==i.type){let t=await a(e,i.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let a=r(e.tz_offset_min,-840,840,0),i=new Date(t.getTime()+6e4*a),n=60*i.getUTCHours()+i.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?n>=s&&n<o:n>=s||n<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${i.userId}::uuid, ${i.type}, ${f}, ${m}, ${h}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let E="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${i.userId}::uuid,
        ${i.type},
        ${f},
        ${m},
        ${h}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];E=t.id;try{let r=JSON.stringify({id:t.id,user_id:i.userId,type:i.type,title:f,body:m,metadata_json:h,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
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
            ${h}::jsonb
          )
        `}}catch{}return E}function n(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}async function c(e,t){return(await e`
    UPDATE ex_notification
    SET read = true
    WHERE user_id = ${t}::uuid AND read = false
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>i,"listNotifications",()=>s,"markAllRead",()=>c,"markRead",()=>l])},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,r)=>{t.exports=e.x("buffer",()=>require("buffer"))},136799,e=>{"use strict";var t=e.i(29984);function r(e,t,r){return Math.min(r,Math.max(t,e))}function a(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function i(e){return e.trim().toUpperCase()}let n=["binance","bybit","okx","kucoin","gateio","bitget","mexc"],s=new Map;async function o(e,t,r){let a=0,i=Array.from({length:Math.min(Math.max(1,Math.floor(t)),e.length)},async()=>{for(;;){let t=a++;if(t>=e.length)return;await r(e[t])}});await Promise.allSettled(i)}async function l(e){var l;let c,u,d,_,p,f,m=i(e);if(!m||"USDT"===m)return null;let h=`${i(m)}USDT`,E=s.get(h);if(E&&E.validUntil.getTime()>Date.now())return E;let b=function(){let e=process.env.MARKETS_INDEX_EXCHANGES;if(!e)return n;let t=new Set(n),r=e.split(/[\n,]/g).map(e=>e.trim().toLowerCase()).filter(Boolean).filter(e=>t.has(e)),a=[],i=new Set;for(let e of r)i.has(e)||(i.add(e),a.push(e));return a.length?a:n}(),w=[],y=r(Number.isFinite(u=(c=process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS??process.env.CCXT_TICKER_TIMEOUT_MS)?Number(c):NaN)?u:3500,500,2e4);await o(b,r(Number.isFinite(_=(d=process.env.MARKETS_INDEX_CONCURRENCY)?Number(d):NaN)?_:4,1,10),async e=>{try{let r=await Promise.race([(0,t.getExchangeTicker)(e,h),new Promise((t,r)=>setTimeout(()=>r(Error(`timeout:getExchangeTicker:${e}`)),y))]),i=a(r.bid),n=a(r.ask),s=a(r.last),o=i&&n?(i+n)/2:s;w.push({exchange:e,symbol:h,bid:i,ask:n,last:s,mid:o,ts:r.ts})}catch(t){w.push({exchange:e,symbol:h,bid:null,ask:null,last:null,mid:null,ts:Date.now(),error:t instanceof Error?t.message:String(t)})}});let g=w.map(e=>e.mid).filter(e=>"number"==typeof e&&Number.isFinite(e)&&e>0),v=function(e){if(!e.length)return null;let t=[...e].sort((e,t)=>e-t),r=Math.floor(t.length/2);return t.length%2==1?t[r]:(t[r-1]+t[r])/2}(g);if(!v)return null;let x=new Date,N={base:m,quote:"USDT",symbol:h,mid:v,sources:w,sourcesUsed:g.length,dispersionBps:function(e,t){if(e.length<3)return null;let r=[...e].sort((e,t)=>e-t),a=r[Math.floor((r.length-1)*.1)],i=r[Math.floor((r.length-1)*.9)];return!Number.isFinite(t)||t<=0?null:(i-a)/t*1e4}(g,v),computedAt:x,validUntil:(l=r(Number.isFinite(f=(p=process.env.MARKETS_INDEX_TTL_MS)?Number(p):NaN)?f:15e3,2e3,12e4),new Date(Date.now()+l))};return s.set(h,N),N}e.s(["getExternalIndexUsdt",()=>l])},24672,e=>{"use strict";async function t(e,t){let r=String(t.service??"").trim();if(!r)return;let a=t.status??"ok",i=t.details??{};await e`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${r},
      ${a},
      ${e.json(i)}::jsonb,
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
  `}e.s(["listServiceHeartbeats",()=>r,"upsertServiceHeartbeat",()=>t])},332935,e=>{"use strict";var t=e.i(136799);function r(e,t,r){return Math.min(r,Math.max(t,e))}function a(e){if("number"==typeof e)return Number.isFinite(e)?e:null;if("string"==typeof e){let t=Number(e);return Number.isFinite(t)?t:null}return null}function i(e){if(!e||"object"!=typeof e)return!1;if("42P01"===e.code)return!0;let t="string"==typeof e.message?e.message:"";return/relation\s+"[^"]+"\s+does\s+not\s+exist/i.test(t)}async function n(e){let t=e.toUpperCase();if(!/^[A-Z]{2,5}$/.test(t))return null;if("USD"===t||"USDT"===t)return 1;let i=process.env[`FX_USD_FIAT_OVERRIDE_${t}`]??process.env.FX_USD_FIAT_OVERRIDE;if(i){let e=Number(i);if(Number.isFinite(e)&&e>0)return e}let n=r(Number(process.env.FX_LIVE_TIMEOUT_MS??"2500"),500,1e4),s=new AbortController,o=setTimeout(()=>s.abort(),n);try{let e=`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(t)}`,r=await fetch(e,{method:"GET",cache:"no-store",signal:s.signal,headers:{accept:"application/json"}});if(r.ok){let e=await r.json(),i=e?.rates?.[t],n=a(i);if(n&&n>0)return n}let i=await fetch("https://open.er-api.com/v6/latest/USD",{method:"GET",cache:"no-store",signal:s.signal,headers:{accept:"application/json"}});if(!i.ok)return null;let n=await i.json(),o=n?.rates?.[t],l=a(o);return l&&l>0?l:null}catch{return null}finally{clearTimeout(o)}}async function s(e){let r=e.trim().toUpperCase();if(!r)return null;if("USDT"===r||"USD"===r)return 1;let a=await (0,t.getExternalIndexUsdt)(r),i=a?.mid;return i&&Number.isFinite(i)&&i>0?i:null}async function o(e,t){let r=await e`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${t.toUpperCase()} AND is_enabled = true
    LIMIT 1
  `;return r[0]?.id??null}async function l(e,t,r){let i=await o(e,t);if(!i)return null;let n=await e`
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
  `,l=a(n[0]?.price??null),c=a(s[0]?.price??null);if(!l&&!c)return null;let u=l&&c?(l+c)/2:l??c;return{bid:l??u,ask:c??u,mid:u,sources:{kind:"p2p_fixed_top",asset:t.toUpperCase(),fiat:r.toUpperCase(),top_bid:l,top_ask:c}}}async function c(e,t,o,c){let u=r(c?.ttlMs??Number(process.env.FX_REFERENCE_TTL_MS??"20000"),2e3,12e4),d=t.toUpperCase(),_=o.toUpperCase();try{let t=await e`
      SELECT bid::text, ask::text, mid::text, sources, computed_at::text, valid_until::text
      FROM fx_reference_rate
      WHERE base_symbol = ${d} AND quote_symbol = ${_} AND valid_until > now()
      ORDER BY computed_at DESC
      LIMIT 1
    `;if(t.length){let e=t[0],r=a(e.bid),i=a(e.ask),n=a(e.mid);if(r&&i&&n)return{base:d,quote:_,bid:r,ask:i,mid:n,sources:e.sources??{},computedAt:new Date(e.computed_at),validUntil:new Date(e.valid_until)}}}catch(e){if(!i(e))throw e}let p=null;if(_.length<2)return null;let f=await (async()=>{let t=await n(_);if(t){let e=r(Number(process.env.FX_USDT_FIAT_FALLBACK_SPREAD_BPS??"10"),0,500),a=e/2/1e4,i=t*(1-a),n=t*(1+a);return{bid:i,ask:n,mid:(i+n)/2,sources:{kind:"live_usd_fiat_fallback",base:"USDT",quote:_,usd_fiat_mid:t,spread_bps:e,note:"USDT pegged to USD for fallback conversion"}}}let a=await l(e,"USDT",_);return a||null})();if(!f)return null;if("USDT"===d)p=f;else{let e=await s(d);if(!e)return null;let t=e*f.mid;if(!Number.isFinite(t)||t<=0)return null;let a=r(Number(process.env.FX_ASSET_FIAT_SPREAD_BPS??"20"),0,500),i=a/2/1e4;p={bid:t*(1-i),ask:t*(1+i),mid:t,sources:{kind:"chained_external_index_usdt",base:d,quote:_,base_usdt_mid:e,usdt_fiat_mid:f.mid,usdt_fiat_sources:f.sources,spread_bps:a}}}let m=new Date,h=new Date(Date.now()+u);try{await e`
      INSERT INTO fx_reference_rate (base_symbol, quote_symbol, bid, ask, mid, sources, computed_at, valid_until)
      VALUES (
        ${d},
        ${_},
        (${p.bid}::numeric),
        (${p.ask}::numeric),
        (${p.mid}::numeric),
        ${JSON.stringify(p.sources)}::jsonb,
        ${m.toISOString()}::timestamptz,
        ${h.toISOString()}::timestamptz
      )
    `}catch(e){i(e)}return{base:d,quote:_,bid:p.bid,ask:p.ask,mid:p.mid,sources:p.sources,computedAt:m,validUntil:h}}e.s(["getOrComputeFxReferenceRate",()=>c])},429568,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),i=e.i(759756),n=e.i(561916),s=e.i(174677),o=e.i(869741),l=e.i(316795),c=e.i(487718),u=e.i(995169),d=e.i(47587),_=e.i(666012),p=e.i(570101),f=e.i(626937),m=e.i(10372),h=e.i(193695);e.i(52474);var E=e.i(600220),b=e.i(469719),w=e.i(300959),y=e.i(843793),g=e.i(184883),v=e.i(136799),x=e.i(332935),N=e.i(194748),S=e.i(24672);function R(e){if(!e)return null;let t=[];for(let r of e.sources??[]){let e=r.bid,a=r.ask,i=r.mid??("number"==typeof e&&"number"==typeof a?(e+a)/2:null);if("number"!=typeof e||"number"!=typeof a||!Number.isFinite(e)||!Number.isFinite(a)||!Number.isFinite(i)||i<=0)continue;let n=(a-e)/i*1e4;Number.isFinite(n)&&n>=0&&t.push(n)}let r=t.filter(e=>Number.isFinite(e)).sort((e,t)=>e-t);if(0===r.length)return null;let a=Math.floor(r.length/2);return r.length%2?r[a]:(r[a-1]+r[a])/2}let T=b.z.object({max:b.z.string().optional().transform(e=>null==e?200:Math.max(1,Math.min(2e3,Number(e)||200)))});async function D(e){let t,r;if("production"===String("production").toLowerCase()&&"1"!==String(process.env.EXCHANGE_ENABLE_PRICE_ALERTS??"").trim()||!(r=String(process.env.EXCHANGE_CRON_SECRET??process.env.CRON_SECRET??"").trim())||(e.headers.get("x-cron-secret")??new URL(e.url).searchParams.get("secret")??"")!==r)return(0,w.apiError)("forbidden");let a=new URL(e.url),i=Date.now();try{t=T.parse({max:a.searchParams.get("max")??void 0})}catch(e){return(0,w.apiZodError)(e)??(0,w.apiError)("invalid_input")}let n=(0,y.getSql)();try{let e=await (0,g.retryOnceOnTransientDbError)(async()=>await n`
        SELECT
          id::text,
          user_id::text,
          base_symbol,
          fiat,
          template,
          direction,
          threshold::text,
          window_sec,
          pct_change::text,
          spread_bps::text,
          volatility_pct::text,
          cooldown_sec,
          last_triggered_at
          ,last_value::text,
          last_value_at::text
        FROM app_price_alert
        WHERE status = 'active'
        ORDER BY created_at ASC
        LIMIT ${t.max}
      `),r=Date.now(),a=new Map,s=new Map,o=0;for(let t of e){let e=t.last_triggered_at?new Date(t.last_triggered_at).getTime():0,i=Math.max(6e4,Math.floor((t.cooldown_sec??3600)*1e3));if(e&&r-e<i)continue;let l=t.base_symbol.toUpperCase(),c=t.fiat.toUpperCase();if(!a.has(l)){let e=await (0,v.getExternalIndexUsdt)(l);a.set(l,e)}let u=a.get(l)??null,d=u?.mid??null;if(null==d||!Number.isFinite(d)||d<=0)continue;if(!s.has(c)){let e=await (0,x.getOrComputeFxReferenceRate)(n,"USDT",c),t=e?Number(e.mid):0;s.set(c,Number.isFinite(t)?t:0)}let _=s.get(c)??0;if(!Number.isFinite(_)||_<=0)continue;let p=d*_,f=String(t.template??"threshold").trim().toLowerCase(),m=Number(t.threshold),h=null!=t.window_sec?Number(t.window_sec):null,E=null!=t.pct_change?Number(t.pct_change):null,b=null!=t.spread_bps?Number(t.spread_bps):null,w=null!=t.volatility_pct?Number(t.volatility_pct):null,y=null!=t.last_value?Number(t.last_value):null,S=t.last_value_at?new Date(t.last_value_at).getTime():0,T=!1,D=`${l} alert`,C="",A={base_symbol:l,fiat:c,template:f};if("threshold"===f){if(!Number.isFinite(m)||m<=0)continue;T="above"===t.direction?p>=m:p<=m,D=`${l} alert`,C=`${l} is ${t.direction} ${m.toLocaleString(void 0,{maximumFractionDigits:2})} ${c}`,A.direction=t.direction,A.threshold=String(m),A.price=String(p)}else if("pct_change"===f){if(!h||!E||!Number.isFinite(E)||E<=0)continue;if(!y||!S){await n`
            UPDATE app_price_alert
            SET last_value = (${String(p)}::numeric), last_value_at = now()
            WHERE id = ${t.id}::uuid
          `;continue}if(r-S<1e3*h)continue;let e=(p-y)/y*100,a="above"===t.direction?e>=E:e<=-E;T=Number.isFinite(e)&&a,D=`${l} % change`,C=`${l} moved ${e.toFixed(2)}% in ~${Math.round(h/60)}m (${c})`,A.direction=t.direction,A.window_sec=h,A.pct_change=String(E),A.pct_observed=String(e),A.price=String(p)}else if("volatility_spike"===f){if(!h||!w||!Number.isFinite(w)||w<=0)continue;if(!y||!S){await n`
            UPDATE app_price_alert
            SET last_value = (${String(p)}::numeric), last_value_at = now()
            WHERE id = ${t.id}::uuid
          `;continue}if(r-S<1e3*h)continue;let e=(p-y)/y*100;T=Number.isFinite(e)&&Math.abs(e)>=w,D=`${l} volatility spike`,C=`${l} moved ${e.toFixed(2)}% in ~${Math.round(h/60)}m (${c})`,A.window_sec=h,A.volatility_pct=String(w),A.pct_observed=String(e),A.price=String(p)}else{if("spread_widening"!==f||!b||!Number.isFinite(b)||b<=0)continue;let e=R(u);if(null==e||!Number.isFinite(e))continue;T=e>=b&&(null==y||y<b),D=`${l} spread widened`,C=`${l} spread is ~${e.toFixed(0)} bps (threshold ${b.toFixed(0)} bps)`,A.spread_bps=String(b),A.spread_observed_bps=String(e)}if(("pct_change"===f||"volatility_spike"===f)&&await n`
          UPDATE app_price_alert
          SET last_value = (${String(p)}::numeric), last_value_at = now()
          WHERE id = ${t.id}::uuid
        `,"spread_widening"===f){let e=R(u);null!=e&&Number.isFinite(e)&&await n`
            UPDATE app_price_alert
            SET last_value = (${String(e)}::numeric), last_value_at = now()
            WHERE id = ${t.id}::uuid
          `}T&&(o++,await (0,g.retryOnceOnTransientDbError)(async()=>{await n`
          UPDATE app_price_alert
          SET last_triggered_at = now()
          WHERE id = ${t.id}::uuid
        `,await (0,N.createNotification)(n,{userId:t.user_id,type:"price_alert",title:D,body:C,metadata:A})}))}let l=Date.now()-i;try{await (0,S.upsertServiceHeartbeat)(n,{service:"cron:price-alerts",status:"ok",details:{scanned:e.length,triggered:o,took_ms:l}})}catch{}return Response.json({ok:!0,scanned:e.length,triggered:o,took_ms:l})}catch(r){let e=Date.now()-i;try{await (0,S.upsertServiceHeartbeat)(n,{service:"cron:price-alerts",status:"error",details:{took_ms:e}})}catch{}let t=(0,g.responseForDbError)("cron.price-alerts",r);if(t)return t;throw r}}async function C(e){return D(e)}e.s(["GET",()=>C,"POST",()=>D,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],183208);var A=e.i(183208);let $=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/cron/price-alerts/route",pathname:"/api/cron/price-alerts",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/cron/price-alerts/route.ts",nextConfigOutput:"",userland:A}),{workAsyncStorage:I,workUnitAsyncStorage:U,serverHooks:k}=$;function O(){return(0,a.patchFetch)({workAsyncStorage:I,workUnitAsyncStorage:U})}async function M(e,t,a){$.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let b="/api/cron/price-alerts/route";b=b.replace(/\/index$/,"")||"/";let w=await $.prepare(e,t,{srcPage:b,multiZoneDraftMode:!1});if(!w)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:y,params:g,nextConfig:v,parsedUrl:x,isDraftMode:N,prerenderManifest:S,routerServerContext:R,isOnDemandRevalidate:T,revalidateOnlyGenerated:D,resolvedPathname:C,clientReferenceManifest:A,serverActionsManifest:I}=w,U=(0,o.normalizeAppPath)(b),k=!!(S.dynamicRoutes[U]||S.routes[C]),O=async()=>((null==R?void 0:R.render404)?await R.render404(e,t,x,!1):t.end("This page could not be found"),null);if(k&&!N){let e=!!S.routes[C],t=S.dynamicRoutes[U];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await O();throw new h.NoFallbackError}}let M=null;!k||$.isDev||N||(M="/index"===(M=C)?"/":M);let F=!0===$.isDev||!k,j=k&&!F;I&&A&&(0,s.setManifestsSingleton)({page:b,clientReferenceManifest:A,serverActionsManifest:I});let L=e.method||"GET",q=(0,n.getTracer)(),P=q.getActiveScopeSpan(),H={params:g,prerenderManifest:S,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:F,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>$.onRequestError(e,t,a,i,R)},sharedContext:{buildId:y}},W=new l.NodeNextRequest(e),X=new l.NodeNextResponse(t),B=c.NextRequestAdapter.fromNodeNextRequest(W,(0,c.signalFromNodeResponse)(t));try{let s=async e=>$.handle(B,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=q.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${L} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${L} ${b}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),l=async i=>{var n,l;let c=async({previousCacheEntry:r})=>{try{if(!o&&T&&D&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await s(i);e.fetchMetrics=H.renderOpts.fetchMetrics;let l=H.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let c=H.renderOpts.collectedTags;if(!k)return await (0,_.sendResponse)(W,X,n,H.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);c&&(t[m.NEXT_CACHE_TAGS_HEADER]=c),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,a=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:E.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await $.onRequestError(e,t,{routerKind:"App Router",routePath:b,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:T})},!1,R),t}},u=await $.handleResponse({req:e,nextConfig:v,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:D,responseGenerator:c,waitUntil:a.waitUntil,isMinimalMode:o});if(!k)return null;if((null==u||null==(n=u.value)?void 0:n.kind)!==E.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(l=u.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",T?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),N&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,p.fromNodeOutgoingHttpHeaders)(u.value.headers);return o&&k||h.delete(m.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,f.getCacheControlHeader)(u.cacheControl)),await (0,_.sendResponse)(W,X,new Response(u.value.body,{headers:h,status:u.value.status||200})),null};P?await l(P):await q.withPropagatedContext(e.headers,()=>q.trace(u.BaseServerSpan.handleRequest,{spanName:`${L} ${b}`,kind:n.SpanKind.SERVER,attributes:{"http.method":L,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await $.onRequestError(e,t,{routerKind:"App Router",routePath:U,routeType:"route",revalidateReason:(0,d.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:T})},!1,R),k)throw t;return await (0,_.sendResponse)(W,X,new Response(null,{status:500})),null}}e.s(["handler",()=>M,"patchFetch",()=>O,"routeModule",()=>$,"serverHooks",()=>k,"workAsyncStorage",()=>I,"workUnitAsyncStorage",()=>U],429568)},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__426584a8._.js.map