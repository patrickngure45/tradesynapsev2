module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),n={error:e};"string"==typeof t?.details?(n.message=t.details,n.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(n.details=t.details,"message"in t.details&&(n.message=t.details.message));let a=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||a.has("Retry-After")||a.set("Retry-After","3"),Response.json(n,{status:r,headers:a})}function n(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function a(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>a,"apiZodError",()=>n])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),n=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&n.has(t))return!0;let a=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&a.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function n(e,t){try{return await e()}catch(a){var n;if(!r(a))throw a;return await (n=t?.delayMs??50,new Promise(e=>setTimeout(e,n))),await e()}}function a(e,n){return r(n)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>a,"retryOnceOnTransientDbError",()=>n])},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},194748,e=>{"use strict";function t(e,...r){for(let t of r){let r=e[t];if("string"==typeof r&&r.trim())return r}return null}function r(e,t,r,n){let a="number"==typeof e?e:Number(String(e??""));return Number.isFinite(a)?Math.max(t,Math.min(r,Math.trunc(a))):n}async function n(e,t){try{return(await e`
      SELECT quiet_enabled, quiet_start_min, quiet_end_min, tz_offset_min, digest_enabled
      FROM app_notification_schedule
      WHERE user_id = ${t}::uuid
      LIMIT 1
    `)[0]??null}catch{return null}}async function a(e,a){var s;let o,l,d,u,c,_=!0,p=!1;try{let t=await e`
      SELECT
        coalesce(in_app_enabled, enabled) AS in_app_enabled,
        coalesce(email_enabled, false) AS email_enabled
      FROM app_notification_preference
      WHERE user_id = ${a.userId}::uuid
        AND type = ${a.type}
      LIMIT 1
    `;t.length>0&&(_=!1!==t[0].in_app_enabled,p=!0===t[0].email_enabled)}catch{}if(!_&&!p)return"";let f=String(a.title??"").trim()||"Notification",m=String(a.body??""),h=(s=a.type,(l=t(o={...a.metadata??{}},"order_id","orderId"))&&(o.order_id=l),(d=t(o,"withdrawal_id","withdrawalId"))&&(o.withdrawal_id=d),(u=t(o,"tx_hash","txHash"))&&(o.tx_hash=u),t(o,"severity")||(o.severity=function(e){switch(e){case"order_placed":case"arcade_ready":case"arcade_hint_ready":case"p2p_dispute_resolved":case"p2p_order_created":case"trade_won":case"trade_lost":case"system":default:return"info";case"deposit_credited":case"withdrawal_completed":case"order_filled":case"p2p_order_completed":case"p2p_feedback_received":return"success";case"p2p_order_expiring":case"p2p_payment_confirmed":case"withdrawal_approved":case"order_partially_filled":case"price_alert":return"warning";case"withdrawal_rejected":case"order_canceled":case"order_rejected":case"p2p_order_cancelled":case"p2p_dispute_opened":return"danger"}}(s)),(c=t(o,"href")??function(e,r){let n=t(r,"order_id","orderId"),a=t(r,"withdrawal_id","withdrawalId"),i=t(r,"asset_symbol","assetSymbol","symbol");if(n&&e.startsWith("p2p_"))return`/p2p/orders/${n}`;if(a&&e.startsWith("withdrawal_"))return"/wallet";switch(e){case"arcade_ready":case"arcade_hint_ready":return"/arcade";case"price_alert":return"/home";case"deposit_credited":return i?`/p2p?side=SELL&asset=${encodeURIComponent(i)}&src=deposit`:"/wallet";case"order_filled":case"order_partially_filled":case"order_canceled":case"order_placed":case"order_rejected":return"/order-history";default:return null}}(s,o))&&c.startsWith("/")&&(o.href=c),o);if("system"!==a.type){let t=await n(e,a.userId);if(t?.digest_enabled&&function(e,t=new Date){if(!e?.quiet_enabled)return!1;let n=r(e.tz_offset_min,-840,840,0),a=new Date(t.getTime()+6e4*n),i=60*a.getUTCHours()+a.getUTCMinutes(),s=r(e.quiet_start_min,0,1439,1320),o=r(e.quiet_end_min,0,1439,480);return s===o||(s<o?i>=s&&i<o:i>=s||i<o)}(t))try{let t=await e`
          INSERT INTO ex_notification_deferred (user_id, type, title, body, metadata_json)
          VALUES (${a.userId}::uuid, ${a.type}, ${f}, ${m}, ${h}::jsonb)
          RETURNING id::text AS id
        `;return t[0]?.id??""}catch{}}let E="";if(_){let t=(await e`
      INSERT INTO ex_notification (user_id, type, title, body, metadata_json)
      VALUES (
        ${a.userId}::uuid,
        ${a.type},
        ${f},
        ${m},
        ${h}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `)[0];E=t.id;try{let r=JSON.stringify({id:t.id,user_id:a.userId,type:a.type,title:f,body:m,metadata_json:h,created_at:t.created_at});await e`SELECT pg_notify('ex_notification', ${r})`}catch{}}if(p)try{let t=(await e`
        SELECT email, email_verified
        FROM app_user
        WHERE id = ${a.userId}::uuid
        LIMIT 1
      `)[0],r=t?.email?String(t.email).trim().toLowerCase():"",n=t?.email_verified===!0;if(r&&r.includes("@")&&n){let t=`[Coinwaka] ${f}`,n=m?`${f}

${m}`:f,s=m?`<p><strong>${i(f)}</strong></p><p>${i(m)}</p>`:`<p><strong>${i(f)}</strong></p>`;await e`
          INSERT INTO ex_email_outbox (user_id, to_email, kind, type, subject, text_body, html_body, metadata_json)
          VALUES (
            ${a.userId}::uuid,
            ${r},
            'notification',
            ${a.type},
            ${t},
            ${n},
            ${s},
            ${h}::jsonb
          )
        `}}catch{}return E}function i(e){return String(e??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;")}async function s(e,t){let r=Math.max(1,Math.min(200,t.limit??50));return await e`
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
  `).count}e.s(["countUnread",()=>o,"createNotification",()=>a,"listNotifications",()=>s,"markAllRead",()=>d,"markRead",()=>l])},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,r)=>{t.exports=e.x("buffer",()=>require("buffer"))},136799,e=>{"use strict";var t=e.i(29984);function r(e,t,r){return Math.min(r,Math.max(t,e))}function n(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function a(e){return e.trim().toUpperCase()}let i=["binance","bybit","okx","kucoin","gateio","bitget","mexc"],s=new Map;async function o(e,t,r){let n=0,a=Array.from({length:Math.min(Math.max(1,Math.floor(t)),e.length)},async()=>{for(;;){let t=n++;if(t>=e.length)return;await r(e[t])}});await Promise.allSettled(a)}async function l(e){var l;let d,u,c,_,p,f,m=a(e);if(!m||"USDT"===m)return null;let h=`${a(m)}USDT`,E=s.get(h);if(E&&E.validUntil.getTime()>Date.now())return E;let y=function(){let e=process.env.MARKETS_INDEX_EXCHANGES;if(!e)return i;let t=new Set(i),r=e.split(/[\n,]/g).map(e=>e.trim().toLowerCase()).filter(Boolean).filter(e=>t.has(e)),n=[],a=new Set;for(let e of r)a.has(e)||(a.add(e),n.push(e));return n.length?n:i}(),x=[],b=r(Number.isFinite(u=(d=process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS??process.env.CCXT_TICKER_TIMEOUT_MS)?Number(d):NaN)?u:3500,500,2e4);await o(y,r(Number.isFinite(_=(c=process.env.MARKETS_INDEX_CONCURRENCY)?Number(c):NaN)?_:4,1,10),async e=>{try{let r=await Promise.race([(0,t.getExchangeTicker)(e,h),new Promise((t,r)=>setTimeout(()=>r(Error(`timeout:getExchangeTicker:${e}`)),b))]),a=n(r.bid),i=n(r.ask),s=n(r.last),o=a&&i?(a+i)/2:s;x.push({exchange:e,symbol:h,bid:a,ask:i,last:s,mid:o,ts:r.ts})}catch(t){x.push({exchange:e,symbol:h,bid:null,ask:null,last:null,mid:null,ts:Date.now(),error:t instanceof Error?t.message:String(t)})}});let g=x.map(e=>e.mid).filter(e=>"number"==typeof e&&Number.isFinite(e)&&e>0),w=function(e){if(!e.length)return null;let t=[...e].sort((e,t)=>e-t),r=Math.floor(t.length/2);return t.length%2==1?t[r]:(t[r-1]+t[r])/2}(g);if(!w)return null;let N=new Date,I={base:m,quote:"USDT",symbol:h,mid:w,sources:x,sourcesUsed:g.length,dispersionBps:function(e,t){if(e.length<3)return null;let r=[...e].sort((e,t)=>e-t),n=r[Math.floor((r.length-1)*.1)],a=r[Math.floor((r.length-1)*.9)];return!Number.isFinite(t)||t<=0?null:(a-n)/t*1e4}(g,w),computedAt:N,validUntil:(l=r(Number.isFinite(f=(p=process.env.MARKETS_INDEX_TTL_MS)?Number(p):NaN)?f:15e3,2e3,12e4),new Date(Date.now()+l))};return s.set(h,I),I}e.s(["getExternalIndexUsdt",()=>l])},630862,e=>{"use strict";let t=10n**18n;function r(e){let r=e.trim();if(0===r.length)throw Error("empty amount");if(r.startsWith("-"))throw Error("negative amount");let[n,a=""]=r.split(".");if(!/^(?:0|[1-9]\d*)$/.test(n))throw Error("invalid integer part");if(a.length>18)throw Error("too many decimals");if(a.length>0&&!/^\d+$/.test(a))throw Error("invalid fractional part");let i=BigInt(n),s=(a+"0".repeat(18)).slice(0,18);return i*t+(s.length?BigInt(s):0n)}function n(e){let t=e.trim();if(0===t.length)throw Error("empty amount");let n=t.startsWith("-"),a=r(n?t.slice(1):t);return n?-a:a}function a(e){if(e<0n)throw Error("negative amount");let r=e/t,n=e%t;if(0n===n)return r.toString();let a=n.toString().padStart(18,"0").replace(/0+$/,"");return`${r.toString()}.${a}`}function i(e,t){let n=r(e),a=r(t);return n<a?-1:+(n>a)}function s(e,t){return 0>=i(e,t)?e:t}function o(e){return 0n>=r(e)}function l(e,n){let i=r(e)*r(n),s=i/t;return a(i%t*2n>=t?s+1n:s)}function d(e,n){let i=r(e)*r(n),s=i/t;return a(0n===i%t?s:s+1n)}function u(e,t){if(!Number.isInteger(t)||t<0)throw Error("invalid bps");if(0===t)return"0";let n=r(e)*BigInt(t),i=n/10000n;return a(0n===n%10000n?i:i+1n)}function c(e,t){return a(r(e)+r(t))}function _(e,t){let n=r(e),i=r(t);if(i>n)throw Error("negative result");return a(n-i)}e.s(["add3818",()=>c,"bpsFeeCeil3818",()=>u,"cmp3818",()=>i,"fromBigInt3818",()=>a,"isZeroOrLess3818",()=>o,"min3818",()=>s,"mul3818Ceil",()=>d,"mul3818Round",()=>l,"sub3818NonNegative",()=>_,"toBigInt3818",()=>r,"toBigInt3818Signed",()=>n])},24672,e=>{"use strict";async function t(e,t){let r=String(t.service??"").trim();if(!r)return;let n=t.status??"ok",a=t.details??{};await e`
    INSERT INTO app_service_heartbeat (service, status, details_json, last_seen_at, updated_at)
    VALUES (
      ${r},
      ${n},
      ${e.json(a)}::jsonb,
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
  `}e.s(["listServiceHeartbeats",()=>r,"upsertServiceHeartbeat",()=>t])},358217,e=>{"use strict";async function t(e,t){let r=String(t.key).trim(),n=String(t.holderId).trim(),a=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    INSERT INTO ex_job_lock (key, holder_id, held_until, updated_at)
    VALUES (${r}, ${n}, now() + make_interval(secs => ${a}), now())
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
  `;return{acquired:!1,held_until:s?.held_until??null,holder_id:s?.holder_id??null}}async function r(e,t){let r=String(t.key).trim(),n=String(t.holderId).trim();await e`
    UPDATE ex_job_lock
    SET held_until = now(), updated_at = now()
    WHERE key = ${r}
      AND holder_id = ${n}
  `}async function n(e,t){let r=String(t.key).trim(),n=String(t.holderId).trim(),a=Math.max(1,Math.trunc(Math.max(1e3,Math.min(36e5,Math.trunc(t.ttlMs)))/1e3)),i=await e`
    UPDATE ex_job_lock
    SET held_until = now() + make_interval(secs => ${a}), updated_at = now()
    WHERE key = ${r}
      AND holder_id = ${n}
    RETURNING held_until::text AS held_until
  `;if(i.length>0)return{renewed:!0,held_until:i[0].held_until};let[s]=await e`
    SELECT held_until::text AS held_until
    FROM ex_job_lock
    WHERE key = ${r}
    LIMIT 1
  `;return{renewed:!1,held_until:s?.held_until??null}}e.s(["releaseJobLock",()=>r,"renewJobLock",()=>n,"tryAcquireJobLock",()=>t])},991654,e=>{"use strict";async function t(e,t){let r=t.metadata??{},n=(await e`
    INSERT INTO ex_chain_block DEFAULT VALUES
    RETURNING id::text AS id, height
  `)[0],a=t.userId&&t.userId.trim().length?t.userId.trim():null;return{txHash:(await e`
    INSERT INTO ex_chain_tx (tx_hash, entry_id, type, user_id, block_id, metadata_json)
    VALUES (
      encode(gen_random_bytes(32), 'hex'),
      ${t.entryId}::uuid,
      ${t.type},
      CASE WHEN ${a}::text IS NULL THEN NULL ELSE ${a}::uuid END,
      ${n.id}::uuid,
      ${e.json(r)}::jsonb
    )
    RETURNING tx_hash
  `)[0].tx_hash,blockHeight:n.height,blockId:n.id}}e.s(["recordInternalChainTx",()=>t])},344263,e=>{"use strict";var t=e.i(136799),r=e.i(29984),n=e.i(630862);let a=new Map;function i(e,t){let r=e.trim().toUpperCase();if(r&&(a.set(r,{value:t,expiresAt:Date.now()+5e3}),a.size>200)){let e=a.keys().next().value;e&&a.delete(e)}}function s(){let e,t;return Math.max(0,Math.min(1e4,Number.isFinite(t=(e=process.env.CONVERT_FEE_BPS)?Number(e):NaN)?Math.trunc(t):10))}async function o(e,n){let s,o,l=n.trim().toUpperCase();if(!l)return null;let d=(s=l.trim().toUpperCase(),(o=a.get(s))?Date.now()>o.expiresAt?(a.delete(s),null):o.value:null);if(d)return d;if("USDT"===l){let e={usdt:1,kind:"anchor"};return i(l,e),e}try{let e=await (0,r.getExchangeTicker)("binance",`${l}USDT`),t=Number(e.bid),n=Number(e.ask),a=Number(e.last),s=Number.isFinite(t)&&t>0&&Number.isFinite(n)&&n>0?(t+n)/2:a;if(Number.isFinite(s)&&s>0){let e={usdt:s,kind:"external_index_usdt"};return i(l,e),e}}catch{}let u=await (0,t.getExternalIndexUsdt)(l);if(!u?.mid||!Number.isFinite(u.mid)||u.mid<=0)return null;let c={usdt:u.mid,kind:"external_index_usdt"};return i(l,c),c}async function l(e,t){let r=t.fromSymbol.trim().toUpperCase(),a=t.toSymbol.trim().toUpperCase(),i=t.amountIn.trim();if((0,n.toBigInt3818)(i),0n>=(0,n.toBigInt3818)(i)||!r||!a||r===a)return null;let l="number"==typeof t.feeBps&&Number.isFinite(t.feeBps)?Math.max(0,Math.min(1e4,Math.trunc(t.feeBps))):s(),d=l>0?(0,n.bpsFeeCeil3818)(i,l):"0",u=(0,n.sub3818NonNegative)(i,d);if(0n>=(0,n.toBigInt3818)(u))return null;let[c,_]=await Promise.all([o(e,r),o(e,a)]);if(!c||!_)return null;let p=function(e){if(!Number.isFinite(e)||e<=0)return"0";let t=e.toFixed(18).replace(/\.0+$/,"").replace(/(\.\d*?)0+$/,"$1");return 0===t.length?"0":t}(c.usdt/_.usdt);if(0n>=(0,n.toBigInt3818)(p))return null;let f=(0,n.mul3818Round)(u,p);return 0n>=(0,n.toBigInt3818)(f)?null:{fromSymbol:r,toSymbol:a,amountIn:i,feeIn:d,netIn:u,rateToPerFrom:p,amountOut:f,priceSource:{kind:"anchor"===c.kind&&"anchor"===_.kind?"anchor":"internal_fx"===c.kind||"internal_fx"===_.kind?"internal_fx":"external_index_usdt",fromUsdt:c.usdt,toUsdt:_.usdt}}}function d(e){let t=e.quote,r=[];return r.push({accountId:e.userFromAcct,assetId:e.fromAssetId,amount:`-${t.amountIn}`}),(0,n.toBigInt3818)(t.netIn)>0n&&r.push({accountId:e.systemFromAcct,assetId:e.fromAssetId,amount:t.netIn}),(0,n.toBigInt3818)(t.feeIn)>0n&&r.push({accountId:e.treasuryFromAcct,assetId:e.fromAssetId,amount:t.feeIn}),r.push({accountId:e.systemToAcct,assetId:e.toAssetId,amount:`-${t.amountOut}`}),r.push({accountId:e.userToAcct,assetId:e.toAssetId,amount:t.amountOut}),r}e.s(["buildConvertJournalLines",()=>d,"convertFeeBps",()=>s,"quoteConvert",()=>l])},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__220fb8d7._.js.map