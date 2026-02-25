module.exports=[918622,(e,t,a)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,a)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,a)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,a)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,a)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,a)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,a)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,a)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,a)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,a)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,a)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function a(e,t){let a=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),r={error:e};"string"==typeof t?.details?(r.message=t.details,r.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(r.details=t.details,"message"in t.details&&(r.message=t.details.message));let s=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||s.has("Retry-After")||s.set("Retry-After","3"),Response.json(r,{status:a,headers:s})}function r(e){return e instanceof t.ZodError?a("invalid_input",{status:400,details:e.issues}):null}function s(e,t){return a("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>a,"apiUpstreamUnavailable",()=>s,"apiZodError",()=>r])},666680,(e,t,a)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},184883,e=>{"use strict";var t=e.i(300959);function a(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),a=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),r=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&r.has(t))return!0;let s=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&s.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(a))}async function r(e,t){try{return await e()}catch(s){var r;if(!a(s))throw s;return await (r=t?.delayMs??50,new Promise(e=>setTimeout(e,r))),await e()}}function s(e,r){return a(r)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>a,"responseForDbError",()=>s,"retryOnceOnTransientDbError",()=>r])},406461,(e,t,a)=>{t.exports=e.x("zlib",()=>require("zlib"))},524836,(e,t,a)=>{t.exports=e.x("https",()=>require("https"))},921517,(e,t,a)=>{t.exports=e.x("http",()=>require("http"))},792509,(e,t,a)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,a)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,a)=>{t.exports=e.x("buffer",()=>require("buffer"))},136799,e=>{"use strict";var t=e.i(29984);function a(e,t,a){return Math.min(a,Math.max(t,e))}function r(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function s(e){return e.trim().toUpperCase()}let n=["binance","bybit","okx","kucoin","gateio","bitget","mexc"],i=new Map;async function o(e,t,a){let r=0,s=Array.from({length:Math.min(Math.max(1,Math.floor(t)),e.length)},async()=>{for(;;){let t=r++;if(t>=e.length)return;await a(e[t])}});await Promise.allSettled(s)}async function l(e){var l;let u,d,c,_,p,m,f=s(e);if(!f||"USDT"===f)return null;let E=`${s(f)}USDT`,b=i.get(E);if(b&&b.validUntil.getTime()>Date.now())return b;let h=function(){let e=process.env.MARKETS_INDEX_EXCHANGES;if(!e)return n;let t=new Set(n),a=e.split(/[\n,]/g).map(e=>e.trim().toLowerCase()).filter(Boolean).filter(e=>t.has(e)),r=[],s=new Set;for(let e of a)s.has(e)||(s.add(e),r.push(e));return r.length?r:n}(),x=[],y=a(Number.isFinite(d=(u=process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS??process.env.CCXT_TICKER_TIMEOUT_MS)?Number(u):NaN)?d:3500,500,2e4);await o(h,a(Number.isFinite(_=(c=process.env.MARKETS_INDEX_CONCURRENCY)?Number(c):NaN)?_:4,1,10),async e=>{try{let a=await Promise.race([(0,t.getExchangeTicker)(e,E),new Promise((t,a)=>setTimeout(()=>a(Error(`timeout:getExchangeTicker:${e}`)),y))]),s=r(a.bid),n=r(a.ask),i=r(a.last),o=s&&n?(s+n)/2:i;x.push({exchange:e,symbol:E,bid:s,ask:n,last:i,mid:o,ts:a.ts})}catch(t){x.push({exchange:e,symbol:E,bid:null,ask:null,last:null,mid:null,ts:Date.now(),error:t instanceof Error?t.message:String(t)})}});let S=x.map(e=>e.mid).filter(e=>"number"==typeof e&&Number.isFinite(e)&&e>0),v=function(e){if(!e.length)return null;let t=[...e].sort((e,t)=>e-t),a=Math.floor(t.length/2);return t.length%2==1?t[a]:(t[a-1]+t[a])/2}(S);if(!v)return null;let N=new Date,g={base:f,quote:"USDT",symbol:E,mid:v,sources:x,sourcesUsed:S.length,dispersionBps:function(e,t){if(e.length<3)return null;let a=[...e].sort((e,t)=>e-t),r=a[Math.floor((a.length-1)*.1)],s=a[Math.floor((a.length-1)*.9)];return!Number.isFinite(t)||t<=0?null:(s-r)/t*1e4}(S,v),computedAt:N,validUntil:(l=a(Number.isFinite(m=(p=process.env.MARKETS_INDEX_TTL_MS)?Number(p):NaN)?m:15e3,2e3,12e4),new Date(Date.now()+l))};return i.set(E,g),g}e.s(["getExternalIndexUsdt",()=>l])},332935,e=>{"use strict";var t=e.i(136799);function a(e,t,a){return Math.min(a,Math.max(t,e))}function r(e){if("number"==typeof e)return Number.isFinite(e)?e:null;if("string"==typeof e){let t=Number(e);return Number.isFinite(t)?t:null}return null}function s(e){if(!e||"object"!=typeof e)return!1;if("42P01"===e.code)return!0;let t="string"==typeof e.message?e.message:"";return/relation\s+"[^"]+"\s+does\s+not\s+exist/i.test(t)}async function n(e){let t=e.toUpperCase();if(!/^[A-Z]{2,5}$/.test(t))return null;if("USD"===t||"USDT"===t)return 1;let s=process.env[`FX_USD_FIAT_OVERRIDE_${t}`]??process.env.FX_USD_FIAT_OVERRIDE;if(s){let e=Number(s);if(Number.isFinite(e)&&e>0)return e}let n=a(Number(process.env.FX_LIVE_TIMEOUT_MS??"2500"),500,1e4),i=new AbortController,o=setTimeout(()=>i.abort(),n);try{let e=`https://api.frankfurter.app/latest?from=USD&to=${encodeURIComponent(t)}`,a=await fetch(e,{method:"GET",cache:"no-store",signal:i.signal,headers:{accept:"application/json"}});if(a.ok){let e=await a.json(),s=e?.rates?.[t],n=r(s);if(n&&n>0)return n}let s=await fetch("https://open.er-api.com/v6/latest/USD",{method:"GET",cache:"no-store",signal:i.signal,headers:{accept:"application/json"}});if(!s.ok)return null;let n=await s.json(),o=n?.rates?.[t],l=r(o);return l&&l>0?l:null}catch{return null}finally{clearTimeout(o)}}async function i(e){let a=e.trim().toUpperCase();if(!a)return null;if("USDT"===a||"USD"===a)return 1;let r=await (0,t.getExternalIndexUsdt)(a),s=r?.mid;return s&&Number.isFinite(s)&&s>0?s:null}async function o(e,t){let a=await e`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${t.toUpperCase()} AND is_enabled = true
    LIMIT 1
  `;return a[0]?.id??null}async function l(e,t,a){let s=await o(e,t);if(!s)return null;let n=await e`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${s}::uuid
      AND fiat_currency = ${a.toUpperCase()}
      AND side = 'BUY'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price DESC
    LIMIT 1
  `,i=await e`
    SELECT fixed_price::text AS price
    FROM p2p_ad
    WHERE status = 'online'
      AND price_type = 'fixed'
      AND asset_id = ${s}::uuid
      AND fiat_currency = ${a.toUpperCase()}
      AND side = 'SELL'
      AND remaining_amount > 0
      AND fixed_price IS NOT NULL
    ORDER BY fixed_price ASC
    LIMIT 1
  `,l=r(n[0]?.price??null),u=r(i[0]?.price??null);if(!l&&!u)return null;let d=l&&u?(l+u)/2:l??u;return{bid:l??d,ask:u??d,mid:d,sources:{kind:"p2p_fixed_top",asset:t.toUpperCase(),fiat:a.toUpperCase(),top_bid:l,top_ask:u}}}async function u(e,t,o,u){let d=a(u?.ttlMs??Number(process.env.FX_REFERENCE_TTL_MS??"20000"),2e3,12e4),c=t.toUpperCase(),_=o.toUpperCase();try{let t=await e`
      SELECT bid::text, ask::text, mid::text, sources, computed_at::text, valid_until::text
      FROM fx_reference_rate
      WHERE base_symbol = ${c} AND quote_symbol = ${_} AND valid_until > now()
      ORDER BY computed_at DESC
      LIMIT 1
    `;if(t.length){let e=t[0],a=r(e.bid),s=r(e.ask),n=r(e.mid);if(a&&s&&n)return{base:c,quote:_,bid:a,ask:s,mid:n,sources:e.sources??{},computedAt:new Date(e.computed_at),validUntil:new Date(e.valid_until)}}}catch(e){if(!s(e))throw e}let p=null;if(_.length<2)return null;let m=await (async()=>{let t=await n(_);if(t){let e=a(Number(process.env.FX_USDT_FIAT_FALLBACK_SPREAD_BPS??"10"),0,500),r=e/2/1e4,s=t*(1-r),n=t*(1+r);return{bid:s,ask:n,mid:(s+n)/2,sources:{kind:"live_usd_fiat_fallback",base:"USDT",quote:_,usd_fiat_mid:t,spread_bps:e,note:"USDT pegged to USD for fallback conversion"}}}let r=await l(e,"USDT",_);return r||null})();if(!m)return null;if("USDT"===c)p=m;else{let e=await i(c);if(!e)return null;let t=e*m.mid;if(!Number.isFinite(t)||t<=0)return null;let r=a(Number(process.env.FX_ASSET_FIAT_SPREAD_BPS??"20"),0,500),s=r/2/1e4;p={bid:t*(1-s),ask:t*(1+s),mid:t,sources:{kind:"chained_external_index_usdt",base:c,quote:_,base_usdt_mid:e,usdt_fiat_mid:m.mid,usdt_fiat_sources:m.sources,spread_bps:r}}}let f=new Date,E=new Date(Date.now()+d);try{await e`
      INSERT INTO fx_reference_rate (base_symbol, quote_symbol, bid, ask, mid, sources, computed_at, valid_until)
      VALUES (
        ${c},
        ${_},
        (${p.bid}::numeric),
        (${p.ask}::numeric),
        (${p.mid}::numeric),
        ${JSON.stringify(p.sources)}::jsonb,
        ${f.toISOString()}::timestamptz,
        ${E.toISOString()}::timestamptz
      )
    `}catch(e){s(e)}return{base:c,quote:_,bid:p.bid,ask:p.ask,mid:p.mid,sources:p.sources,computedAt:f,validUntil:E}}e.s(["getOrComputeFxReferenceRate",()=>u])},367266,e=>{"use strict";var t=e.i(747909),a=e.i(174017),r=e.i(996250),s=e.i(759756),n=e.i(561916),i=e.i(174677),o=e.i(869741),l=e.i(316795),u=e.i(487718),d=e.i(995169),c=e.i(47587),_=e.i(666012),p=e.i(570101),m=e.i(626937),f=e.i(10372),E=e.i(193695);e.i(52474);var b=e.i(600220),h=e.i(469719),x=e.i(843793),y=e.i(300959),S=e.i(184883),v=e.i(136799),N=e.i(332935);let g=h.z.object({fiat:h.z.string().optional().transform(e=>(e??"KES").trim().toUpperCase()).refine(e=>/^[A-Z]{2,5}$/.test(e),"invalid_fiat")});function w(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function R(e){return null!=e&&Number.isFinite(e)?String(e):null}async function k(e){let t,a=new URL(e.url);try{t=g.parse({fiat:a.searchParams.get("fiat")??void 0})}catch(e){return(0,y.apiZodError)(e)??(0,y.apiError)("invalid_input")}let r=t.fiat;try{let e,t,a=(0,x.getSql)(),s=await (0,S.retryOnceOnTransientDbError)(async()=>{let e=await a`
        SELECT
          m.id::text AS id,
          m.chain,
          m.symbol,
          m.status,
          m.halt_until::text AS halt_until,
          m.tick_size::text AS tick_size,
          m.lot_size::text AS lot_size,
          m.maker_fee_bps,
          m.taker_fee_bps,
          b.symbol AS base_symbol,
          q.symbol AS quote_symbol
        FROM ex_market m
        JOIN ex_asset b ON b.id = m.base_asset_id
        JOIN ex_asset q ON q.id = m.quote_asset_id
        WHERE m.status = 'enabled'
        ORDER BY m.chain ASC, m.symbol ASC
      `,t=await a`
        WITH recent AS (
          SELECT market_id, price, quantity, created_at, id
          FROM ex_execution
          WHERE created_at >= NOW() - INTERVAL '24 hours'
        ),
        open_rows AS (
          SELECT DISTINCT ON (market_id)
            market_id,
            price AS open
          FROM recent
          ORDER BY market_id, created_at ASC, id ASC
        ),
        last_rows AS (
          SELECT DISTINCT ON (market_id)
            market_id,
            price AS last
          FROM recent
          ORDER BY market_id, created_at DESC, id DESC
        ),
        agg AS (
          SELECT
            market_id,
            MAX(price) as high,
            MIN(price) as low,
            SUM(quantity) as volume,
            SUM(price * quantity) as quote_volume,
            COUNT(*) as trade_count
          FROM recent
          GROUP BY market_id
        )
        SELECT
          m.id::text as market_id,
          o.open::text,
          l.last::text,
          a.high::text,
          a.low::text,
          COALESCE(a.volume, 0)::text as volume,
          COALESCE(a.quote_volume, 0)::text as quote_volume,
          COALESCE(a.trade_count, 0)::int as trade_count
        FROM ex_market m
        LEFT JOIN open_rows o ON o.market_id = m.id
        LEFT JOIN last_rows l ON l.market_id = m.id
        LEFT JOIN agg a ON a.market_id = m.id
        WHERE m.status = 'enabled'
      `,r=await a`
        SELECT
          m.id::text AS market_id,
          (
            SELECT o.price::text
            FROM ex_order o
            WHERE o.market_id = m.id
              AND o.side = 'buy'
              AND o.status IN ('open','partially_filled')
            ORDER BY o.price DESC, o.created_at ASC
            LIMIT 1
          ) AS bid,
          (
            SELECT o.price::text
            FROM ex_order o
            WHERE o.market_id = m.id
              AND o.side = 'sell'
              AND o.status IN ('open','partially_filled')
            ORDER BY o.price ASC, o.created_at ASC
            LIMIT 1
          ) AS ask
        FROM ex_market m
        WHERE m.status = 'enabled'
      `,s=await a`
        WITH mkt AS (
          SELECT base_asset_id AS asset_id FROM ex_market WHERE status = 'enabled'
          UNION
          SELECT quote_asset_id AS asset_id FROM ex_market WHERE status = 'enabled'
        )
        SELECT
          a.id::text AS id,
          a.chain,
          a.symbol,
          a.name,
          a.decimals,
          a.contract_address,
          (m.asset_id IS NOT NULL) AS has_market
        FROM ex_asset a
        LEFT JOIN mkt m ON m.asset_id = a.id
        WHERE a.is_enabled = true
          AND m.asset_id IS NOT NULL
        ORDER BY a.chain ASC, a.symbol ASC
      `;return{markets:e,tickers:t,top:r,enabledAssets:s}}),n=await (0,N.getOrComputeFxReferenceRate)(a,"USDT",r),i=new Map(s.tickers.map(e=>[e.market_id,e])),o=new Map(s.top.map(e=>[e.market_id,e])),l=(t=(e=process.env.MARKETS_INDEX_MAX_ASSETS)?Number(e):NaN,Number.isFinite(t)?Math.max(1,Math.min(200,Math.floor(t))):25),u=Array.from(new Set(s.markets.map(e=>e.base_symbol.toUpperCase()).filter(e=>e&&"USDT"!==e))),d=new Map;await Promise.all(u.slice(0,l).map(async e=>{let t=await (0,v.getExternalIndexUsdt)(e);d.set(e,t)}));let c=s.markets.map(e=>{let t=i.get(e.id)??null,a=o.get(e.id)??{bid:null,ask:null},s=w(a.bid),l=w(a.ask),u=null!=s&&null!=l?(s+l)/2:null,c=w(t?.last??null),_=u??c,p=null,m=null,f=null,E=null;if("USDT"===e.quote_symbol.toUpperCase()){let t=d.get(e.base_symbol.toUpperCase())??null;t?.mid&&(p=t.mid,m=t.sourcesUsed,f=t.dispersionBps,E=Date.now()-t.computedAt.getTime())}let b=null!=_&&null!=p&&p>0?(_-p)/p*100:null,h=e.halt_until?Date.parse(e.halt_until):NaN,x=Number.isFinite(h)&&h>Date.now(),y=e.quote_symbol.toUpperCase(),S="USDT"===y?n?.mid??null:null,v=d.get(e.base_symbol.toUpperCase())??null,N=v?.mid!=null&&n?.mid?v.mid*n.mid:null;return{id:e.id,chain:e.chain,symbol:e.symbol,status:e.status,halt_until:e.halt_until,is_halted:x,tick_size:e.tick_size,lot_size:e.lot_size,maker_fee_bps:e.maker_fee_bps,taker_fee_bps:e.taker_fee_bps,base_symbol:e.base_symbol,quote_symbol:e.quote_symbol,stats:t?{open:t.open??"0",last:t.last??"0",high:t.high??"0",low:t.low??"0",volume:t.volume??"0",quote_volume:t.quote_volume??"0",trade_count:t.trade_count??0}:null,book:{bid:a.bid,ask:a.ask,mid:R(u)},index:{price_usdt:R(p),sources_used:m,dispersion_bps:f,age_ms:E,deviation_pct:b,fiat:r,price_fiat:R(N)},last_fiat:{fiat:r,value:R(null!=c&&S?c*S:null)}}}),_=new Set(s.enabledAssets.filter(e=>e.has_market).map(e=>e.symbol.toUpperCase()).filter(e=>e&&"USDT"!==e)),p=s.enabledAssets.map(e=>{let t=e.symbol.toUpperCase(),a=null;"USDT"===t?a=1:_.has(t)&&(a=d.get(t)?.mid??null);let r=null!=a&&n?.mid?a*n.mid:null;return{id:e.id,chain:e.chain,symbol:e.symbol,name:e.name,decimals:e.decimals,contract_address:e.contract_address,has_market:e.has_market,index_usdt:R(a),index_fiat:R(r)}});return Response.json({fiat:r,fx:{usdt_fiat:n?{mid:n.mid,computed_at:n.computedAt}:null},markets:c,assets:p},{status:200})}catch(t){let e=(0,S.responseForDbError)("exchange.markets.overview",t);if(e)return e;return console.error("[exchange.markets.overview] internal error",t),t instanceof Error?t.message:String(t),(0,y.apiError)("internal_error",{status:500,details:void 0})}}e.s(["GET",()=>k,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],416019);var T=e.i(416019);let A=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/exchange/markets/overview/route",pathname:"/api/exchange/markets/overview",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/markets/overview/route.ts",nextConfigOutput:"",userland:T}),{workAsyncStorage:C,workUnitAsyncStorage:D,serverHooks:O}=A;function U(){return(0,r.patchFetch)({workAsyncStorage:C,workUnitAsyncStorage:D})}async function I(e,t,r){A.isDev&&(0,s.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let h="/api/exchange/markets/overview/route";h=h.replace(/\/index$/,"")||"/";let x=await A.prepare(e,t,{srcPage:h,multiZoneDraftMode:!1});if(!x)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:y,params:S,nextConfig:v,parsedUrl:N,isDraftMode:g,prerenderManifest:w,routerServerContext:R,isOnDemandRevalidate:k,revalidateOnlyGenerated:T,resolvedPathname:C,clientReferenceManifest:D,serverActionsManifest:O}=x,U=(0,o.normalizeAppPath)(h),I=!!(w.dynamicRoutes[U]||w.routes[C]),M=async()=>((null==R?void 0:R.render404)?await R.render404(e,t,N,!1):t.end("This page could not be found"),null);if(I&&!g){let e=!!w.routes[C],t=w.dynamicRoutes[U];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await M();throw new E.NoFallbackError}}let q=null;!I||A.isDev||g||(q="/index"===(q=C)?"/":q);let F=!0===A.isDev||!I,L=I&&!F;O&&D&&(0,i.setManifestsSingleton)({page:h,clientReferenceManifest:D,serverActionsManifest:O});let P=e.method||"GET",j=(0,n.getTracer)(),H=j.getActiveScopeSpan(),$={params:S,prerenderManifest:w,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:F,incrementalCache:(0,s.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,s)=>A.onRequestError(e,t,r,s,R)},sharedContext:{buildId:y}},B=new l.NodeNextRequest(e),W=new l.NodeNextResponse(t),X=u.NextRequestAdapter.fromNodeNextRequest(B,(0,u.signalFromNodeResponse)(t));try{let i=async e=>A.handle(X,$).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=j.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route");if(r){let t=`${P} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":t}),e.updateName(t)}else e.updateName(`${P} ${h}`)}),o=!!(0,s.getRequestMeta)(e,"minimalMode"),l=async s=>{var n,l;let u=async({previousCacheEntry:a})=>{try{if(!o&&k&&T&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await i(s);e.fetchMetrics=$.renderOpts.fetchMetrics;let l=$.renderOpts.pendingWaitUntil;l&&r.waitUntil&&(r.waitUntil(l),l=void 0);let u=$.renderOpts.collectedTags;if(!I)return await (0,_.sendResponse)(B,W,n,$.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);u&&(t[f.NEXT_CACHE_TAGS_HEADER]=u),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==$.renderOpts.collectedRevalidate&&!($.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&$.renderOpts.collectedRevalidate,r=void 0===$.renderOpts.collectedExpire||$.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:$.renderOpts.collectedExpire;return{value:{kind:b.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await A.onRequestError(e,t,{routerKind:"App Router",routePath:h,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:k})},!1,R),t}},d=await A.handleResponse({req:e,nextConfig:v,cacheKey:q,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:w,isRoutePPREnabled:!1,isOnDemandRevalidate:k,revalidateOnlyGenerated:T,responseGenerator:u,waitUntil:r.waitUntil,isMinimalMode:o});if(!I)return null;if((null==d||null==(n=d.value)?void 0:n.kind)!==b.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(l=d.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",k?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),g&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let E=(0,p.fromNodeOutgoingHttpHeaders)(d.value.headers);return o&&I||E.delete(f.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||E.get("Cache-Control")||E.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,_.sendResponse)(B,W,new Response(d.value.body,{headers:E,status:d.value.status||200})),null};H?await l(H):await j.withPropagatedContext(e.headers,()=>j.trace(d.BaseServerSpan.handleRequest,{spanName:`${P} ${h}`,kind:n.SpanKind.SERVER,attributes:{"http.method":P,"http.target":e.url}},l))}catch(t){if(t instanceof E.NoFallbackError||await A.onRequestError(e,t,{routerKind:"App Router",routePath:U,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:k})},!1,R),I)throw t;return await (0,_.sendResponse)(B,W,new Response(null,{status:500})),null}}e.s(["handler",()=>I,"patchFetch",()=>U,"routeModule",()=>A,"serverHooks",()=>O,"workAsyncStorage",()=>C,"workUnitAsyncStorage",()=>D],367266)},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__e4a66b1e._.js.map