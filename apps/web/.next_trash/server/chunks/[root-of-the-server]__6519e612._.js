module.exports=[406461,(e,t,i)=>{t.exports=e.x("zlib",()=>require("zlib"))},921517,(e,t,i)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,i)=>{t.exports=e.x("https",()=>require("https"))},792509,(e,t,i)=>{t.exports=e.x("url",()=>require("url"))},427699,(e,t,i)=>{t.exports=e.x("events",()=>require("events"))},500874,(e,t,i)=>{t.exports=e.x("buffer",()=>require("buffer"))},136799,e=>{"use strict";var t=e.i(29984);function i(e,t,i){return Math.min(i,Math.max(t,e))}function n(e){let t="number"==typeof e?e:"string"==typeof e?Number(e):NaN;return Number.isFinite(t)?t:null}function r(e){return e.trim().toUpperCase()}let a=["binance","bybit","okx","kucoin","gateio","bitget","mexc"],u=new Map;async function s(e,t,i){let n=0,r=Array.from({length:Math.min(Math.max(1,Math.floor(t)),e.length)},async()=>{for(;;){let t=n++;if(t>=e.length)return;await i(e[t])}});await Promise.allSettled(r)}async function o(e){var o;let l,c,d,m,_,f,N=r(e);if(!N||"USDT"===N)return null;let S=`${r(N)}USDT`,b=u.get(S);if(b&&b.validUntil.getTime()>Date.now())return b;let g=function(){let e=process.env.MARKETS_INDEX_EXCHANGES;if(!e)return a;let t=new Set(a),i=e.split(/[\n,]/g).map(e=>e.trim().toLowerCase()).filter(Boolean).filter(e=>t.has(e)),n=[],r=new Set;for(let e of i)r.has(e)||(r.add(e),n.push(e));return n.length?n:a}(),E=[],h=i(Number.isFinite(c=(l=process.env.MARKETS_INDEX_TICKER_TIMEOUT_MS??process.env.CCXT_TICKER_TIMEOUT_MS)?Number(l):NaN)?c:3500,500,2e4);await s(g,i(Number.isFinite(m=(d=process.env.MARKETS_INDEX_CONCURRENCY)?Number(d):NaN)?m:4,1,10),async e=>{try{let i=await Promise.race([(0,t.getExchangeTicker)(e,S),new Promise((t,i)=>setTimeout(()=>i(Error(`timeout:getExchangeTicker:${e}`)),h))]),r=n(i.bid),a=n(i.ask),u=n(i.last),s=r&&a?(r+a)/2:u;E.push({exchange:e,symbol:S,bid:r,ask:a,last:u,mid:s,ts:i.ts})}catch(t){E.push({exchange:e,symbol:S,bid:null,ask:null,last:null,mid:null,ts:Date.now(),error:t instanceof Error?t.message:String(t)})}});let I=E.map(e=>e.mid).filter(e=>"number"==typeof e&&Number.isFinite(e)&&e>0),$=function(e){if(!e.length)return null;let t=[...e].sort((e,t)=>e-t),i=Math.floor(t.length/2);return t.length%2==1?t[i]:(t[i-1]+t[i])/2}(I);if(!$)return null;let y=new Date,p={base:N,quote:"USDT",symbol:S,mid:$,sources:E,sourcesUsed:I.length,dispersionBps:function(e,t){if(e.length<3)return null;let i=[...e].sort((e,t)=>e-t),n=i[Math.floor((i.length-1)*.1)],r=i[Math.floor((i.length-1)*.9)];return!Number.isFinite(t)||t<=0?null:(r-n)/t*1e4}(I,$),computedAt:y,validUntil:(o=i(Number.isFinite(f=(_=process.env.MARKETS_INDEX_TTL_MS)?Number(_):NaN)?f:15e3,2e3,12e4),new Date(Date.now()+o))};return u.set(S,p),p}e.s(["getExternalIndexUsdt",()=>o])},630862,e=>{"use strict";let t=10n**18n;function i(e){let i=e.trim();if(0===i.length)throw Error("empty amount");if(i.startsWith("-"))throw Error("negative amount");let[n,r=""]=i.split(".");if(!/^(?:0|[1-9]\d*)$/.test(n))throw Error("invalid integer part");if(r.length>18)throw Error("too many decimals");if(r.length>0&&!/^\d+$/.test(r))throw Error("invalid fractional part");let a=BigInt(n),u=(r+"0".repeat(18)).slice(0,18);return a*t+(u.length?BigInt(u):0n)}function n(e){let t=e.trim();if(0===t.length)throw Error("empty amount");let n=t.startsWith("-"),r=i(n?t.slice(1):t);return n?-r:r}function r(e){if(e<0n)throw Error("negative amount");let i=e/t,n=e%t;if(0n===n)return i.toString();let r=n.toString().padStart(18,"0").replace(/0+$/,"");return`${i.toString()}.${r}`}function a(e,t){let n=i(e),r=i(t);return n<r?-1:+(n>r)}function u(e,t){return 0>=a(e,t)?e:t}function s(e){return 0n>=i(e)}function o(e,n){let a=i(e)*i(n),u=a/t;return r(a%t*2n>=t?u+1n:u)}function l(e,n){let a=i(e)*i(n),u=a/t;return r(0n===a%t?u:u+1n)}function c(e,t){if(!Number.isInteger(t)||t<0)throw Error("invalid bps");if(0===t)return"0";let n=i(e)*BigInt(t),a=n/10000n;return r(0n===n%10000n?a:a+1n)}function d(e,t){return r(i(e)+i(t))}function m(e,t){let n=i(e),a=i(t);if(a>n)throw Error("negative result");return r(n-a)}e.s(["add3818",()=>d,"bpsFeeCeil3818",()=>c,"cmp3818",()=>a,"fromBigInt3818",()=>r,"isZeroOrLess3818",()=>s,"min3818",()=>u,"mul3818Ceil",()=>l,"mul3818Round",()=>o,"sub3818NonNegative",()=>m,"toBigInt3818",()=>i,"toBigInt3818Signed",()=>n])},430848,e=>{"use strict";var t=e.i(630862),i=e.i(901323),n=e.i(56778),r=e.i(136799);let a="00000000-0000-0000-0000-000000000001",u="00000000-0000-0000-0000-000000000003",s=new Map;function o(e){let t=s.get(e);return t?Date.now()>t.expiresAtMs?(s.delete(e),null):t.value:null}function l(e,t,i){s.set(e,{expiresAtMs:Date.now()+Math.max(0,i),value:t})}async function c(e,t,i){let n=Math.max(0,Math.trunc(t));return 0===n?await e:await Promise.race([e,new Promise((e,t)=>{let r=setTimeout(()=>t(Error(`timeout:${i}`)),n);r.unref?.()})])}function d(e,t){let i=process.env[e];if(null==i)return t;let n=i.trim().toLowerCase();return"1"===n||"true"===n||"yes"===n||"on"===n||"0"!==n&&"false"!==n&&"no"!==n&&"off"!==n&&t}function m(e,t){let i=process.env[e],n=i?Number(i):NaN;return Number.isFinite(n)?Math.trunc(n):t}function _(e,t){let i=process.env[e],n=i?Number(i):NaN;return Number.isFinite(n)?n:t}function f(e,i){let n=(process.env[e]??"").trim();return 0===n.length?i:((0,t.toBigInt3818)(n),n)}function N(e){return"user_transfer"===e.trim().toLowerCase()&&d("GAS_SPONSOR_USER_TRANSFER",!1)}async function S(e,t){let i=await e`
    SELECT id::text AS id
    FROM ex_asset
    WHERE chain = 'bsc' AND symbol = ${t} AND is_enabled = true
    LIMIT 1
  `;return i[0]?.id??null}async function b(e,t,i){return(await e`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${t}::uuid, ${i}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `)[0].id}async function g(e,t){await e`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${t}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `}async function E(e,t){let i=await e`
    WITH posted AS (
      SELECT coalesce(sum(amount), 0)::numeric AS posted
      FROM ex_journal_line
      WHERE account_id = ${t}::uuid
    ),
    held AS (
      SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
      FROM ex_hold
      WHERE account_id = ${t}::uuid
        AND status = 'active'
    )
    SELECT (posted.posted - held.held)::text AS available
    FROM posted, held
  `;return i[0]?.available??"0"}async function h(e,t,i){let n=(await e`
    SELECT
      e.price::text AS price,
      b.symbol AS base_symbol,
      q.symbol AS quote_symbol
    FROM ex_execution e
    JOIN ex_market m ON m.id = e.market_id
    JOIN ex_asset b ON b.id = m.base_asset_id
    JOIN ex_asset q ON q.id = m.quote_asset_id
    WHERE m.chain = 'bsc'
      AND m.status = 'enabled'
      AND (
        (b.symbol = ${t} AND q.symbol = ${i})
        OR
        (b.symbol = ${i} AND q.symbol = ${t})
      )
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 1
  `)[0];if(!n)return null;let r=Number(n.price);return!Number.isFinite(r)||r<=0?null:n.base_symbol===t&&n.quote_symbol===i?r:n.base_symbol===i&&n.quote_symbol===t?1/r:null}async function I(e,t){let i=t.trim().toUpperCase();if(!i)return null;if("USDT"===i)return{usdtPerUnit:1,source:"fixed:USDT"};let n=o(`usdtPerUnit:${i}`);if(n)return n;let a=await h(e,i,"USDT");if(Number.isFinite(a)&&a>0){let e={usdtPerUnit:a,source:`market:${i}/USDT`};return l(`usdtPerUnit:${i}`,e,3e4),e}try{let e=m("GAS_INDEX_TIMEOUT_MS",1500),t=await c((0,r.getExternalIndexUsdt)(i),e,`index:${i}`);if(t?.mid&&Number.isFinite(t.mid)&&t.mid>0){let e={usdtPerUnit:t.mid,source:`index:${i}USDT`};return l(`usdtPerUnit:${i}`,e,3e4),e}}catch{}return null}function $(e){if(!Number.isFinite(e)||e<=0)return"0";let t=e.toFixed(18).replace(/\.0+$/,"").replace(/(\.\d*?)0+$/,"$1");return 0===t.length?"0":t}async function y(e,r){if((r.chain??"bsc")!=="bsc"||"withdrawal_request"!==r.action&&"user_transfer"!==r.action)return null;let a="bsc:feeData",u=o(a),s=u?.gasPrice;if(!s){let e=(0,i.getBscProvider)();try{let t=m("GAS_PROVIDER_TIMEOUT_MS",1500);s=(await c(e.getFeeData(),t,"bsc.getFeeData")).gasPrice??void 0,l(a,{gasPrice:s},1e4)}catch{s=void 0}}let d=Math.max(.1,_("GAS_BSC_FALLBACK_GWEI",3)),f=s??n.ethers.parseUnits(String(d),"gwei"),N="BNB"===(r.assetSymbol??"").trim().toUpperCase(),S="user_transfer"===r.action?Math.max(21e3,m("GAS_BSC_TRANSFER_UNITS",45e3)):Math.max(21e3,m(N?"GAS_BSC_NATIVE_UNITS":"GAS_BSC_TOKEN_UNITS",N?21e3:65e3)),b=Math.max(1,_("GAS_BSC_MULTIPLIER",1.15)),g=Number(n.ethers.formatEther(f*BigInt(S)))*b,E=Math.max(0,_("GAS_MIN_BNB",0)),h=$(Math.min(Math.max(E,_("GAS_MAX_BNB",1/0)),Math.max(E,g)));return 0n===(0,t.toBigInt3818)(h)?null:{bnbAmount:h,details:{gasPriceGwei:Number(n.ethers.formatUnits(f,"gwei")),gasUnits:S,multiplier:b,action:r.action}}}async function p(e,i,n){let r=n.trim().toUpperCase();if(!r)return null;let a=await I(e,"BNB");if(!a)return null;let u="BNB"===r?a:await I(e,r);if(!u)return null;let s=Number(i);if(!Number.isFinite(s)||s<=0)return null;let o=s*a.usdtPerUnit,l=$(o/u.usdtPerUnit);return 0n===(0,t.toBigInt3818)(l)?null:{chargeSymbol:r,chargeAmount:l,details:{bnbUsdt:a.usdtPerUnit,bnbUsdtSource:a.source,assetUsdt:u.usdtPerUnit,assetUsdtSource:u.source,feeUsdt:o,conversion:`${r} via USDT`}}}async function T(e,i){let n,r=i.purpose??"charge",a=d("GAS_ENABLED",!1),u=(process.env.GAS_TOKEN_SYMBOL??"BNB").trim()||"BNB",s=Math.max(0,Math.min(1e4,m("GAS_BURN_BPS",25)));if(!a){let e="withdrawal_request"===i.action||"user_transfer"===i.action,t="0";if(e){let e="user_transfer"===i.action?"GAS_USER_TRANSFER_FEE_BNB":"GAS_ACTION_FEE_BNB";try{t=f(e,f("GAS_ACTION_FEE_BNB","0"))}catch{t="0"}}return{enabled:!1,gasSymbol:e?"BNB":u,amount:t,mode:"static",burnBps:s}}let o="static"===(process.env.GAS_FEE_MODE??"realtime").trim().toLowerCase()?"static":"realtime",l=N(i.action);if("withdrawal_request"===i.action||"user_transfer"===i.action){let n=null,a={sponsoredIfInsufficient:l},u="static";if("realtime"===o)try{let t=await y(e,i);t&&(n=t.bnbAmount,a={...a,...t.details},u="realtime")}catch{}if(!n){let e="user_transfer"===i.action?"GAS_USER_TRANSFER_FEE_BNB":"GAS_ACTION_FEE_BNB",t="GAS_ACTION_FEE_BNB";try{n=f(e,f(t,"0")),a={...a,staticEnv:e===t?e:`${e} (fallback: ${t})`}}catch{return{code:"gas_fee_invalid",details:{env:e}}}}if(0n===(0,t.toBigInt3818)(n))return{enabled:!0,gasSymbol:"BNB",amount:"0",mode:u,burnBps:s,details:a};if("display"===r)return{enabled:!0,gasSymbol:"BNB",amount:n,mode:u,burnBps:s,details:{...a,conversion:"skipped_for_display"}};let c=(i.assetSymbol??"").trim();if(c){let t=await p(e,n,c);if(t)return{enabled:!0,gasSymbol:"BNB",amount:n,chargeSymbol:t.chargeSymbol,chargeAmount:t.chargeAmount,mode:u,burnBps:s,details:{...a,...t.details}}}return{enabled:!0,gasSymbol:"BNB",amount:n,mode:u,burnBps:s,details:{...a,conversion:"unavailable"}}}try{n=f("GAS_ACTION_FEE_BNB","0")}catch{return{code:"gas_fee_invalid",details:{env:"GAS_ACTION_FEE_BNB"}}}return{enabled:!0,gasSymbol:u,amount:n,mode:"static",burnBps:s,details:{sponsoredIfInsufficient:l}}}async function B(e,t){let i=await T(e,{action:t.action,chain:t.chain,assetSymbol:t.assetSymbol});return"code"in i?i:i.enabled?await A(e,t,i):null}async function A(e,i,n){if(!n.enabled)return null;if("withdrawal_request"===i.action){let r=(n.chargeSymbol??i.assetSymbol??"").trim().toUpperCase(),s=(n.chargeAmount??"").trim();if(!r||!s)return{code:"gas_fee_invalid",details:{message:"missing_charge_amount",action:i.action,gasSymbol:n.gasSymbol,amount:n.amount}};let o=(0,t.toBigInt3818)(s);if(0n===o)return null;let l=n.burnBps,c=o*BigInt(l)/10000n,d=o-c,m=await S(e,r);if(!m)return{code:"gas_asset_not_found",details:{symbol:r}};await g(e,a),await g(e,u);let[_,f,N]=await Promise.all([b(e,i.userId,m),b(e,a,m),b(e,u,m)]),h=await E(e,_);if((0,t.toBigInt3818)(h)<o)return{code:"insufficient_gas",details:{symbol:r,required:s,available:h,action:i.action,display:{symbol:n.gasSymbol,amount:n.amount}}};let I=i.reference??i.action,$=(await e`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'gas_fee',
        ${I},
        ${e.json({action:i.action,displaySymbol:n.gasSymbol,displayAmount:n.amount,chargeSymbol:r,chargeAmount:s,burnBps:l,quoteMode:n.mode,quoteDetails:n.details??null})}::jsonb
      )
      RETURNING id::text AS id
    `)[0].id,y=(0,t.fromBigInt3818)(o),p=(0,t.fromBigInt3818)(d),T=(0,t.fromBigInt3818)(c);return(d>0n&&c>0n?await e`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${$}::uuid, ${_}::uuid, ${m}::uuid, ((${y}::numeric) * -1)),
          (${$}::uuid, ${f}::uuid, ${m}::uuid, (${p}::numeric)),
          (${$}::uuid, ${N}::uuid, ${m}::uuid, (${T}::numeric))
      `:d>0n?await e`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${$}::uuid, ${_}::uuid, ${m}::uuid, ((${y}::numeric) * -1)),
          (${$}::uuid, ${f}::uuid, ${m}::uuid, (${p}::numeric))
      `:await e`
        INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
        VALUES
          (${$}::uuid, ${_}::uuid, ${m}::uuid, ((${y}::numeric) * -1)),
          (${$}::uuid, ${N}::uuid, ${m}::uuid, (${T}::numeric))
      `,c>o)?{code:"gas_fee_invalid",details:{message:"burn exceeds fee"}}:((0,t.sub3818NonNegative)((0,t.fromBigInt3818)(o),(0,t.fromBigInt3818)(d+c)),null)}let r=n.gasSymbol,s=n.amount,o=(0,t.toBigInt3818)(s);if(0n===o)return null;let l=n.burnBps,c=o*BigInt(l)/10000n,d=o-c,m=await S(e,r);if(!m)return{code:"gas_asset_not_found",details:{symbol:r}};await g(e,a),await g(e,u);let[_,f,h]=await Promise.all([b(e,i.userId,m),b(e,a,m),b(e,u,m)]),I=await E(e,_);if((0,t.toBigInt3818)(I)<o)return N(i.action)?null:{code:"insufficient_gas",details:{symbol:r,required:s,available:I,action:i.action}};let $=i.reference??i.action,y=(await e`
    INSERT INTO ex_journal_entry (type, reference, metadata_json)
    VALUES (
      'gas_fee',
      ${$},
      ${e.json({action:i.action,symbol:r,feeAmount:s,burnBps:l})}::jsonb
    )
    RETURNING id::text AS id
  `)[0].id,p=(0,t.fromBigInt3818)(o),T=(0,t.fromBigInt3818)(d),B=(0,t.fromBigInt3818)(c);return(d>0n&&c>0n?await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${y}::uuid, ${_}::uuid, ${m}::uuid, ((${p}::numeric) * -1)),
        (${y}::uuid, ${f}::uuid, ${m}::uuid, (${T}::numeric)),
        (${y}::uuid, ${h}::uuid, ${m}::uuid, (${B}::numeric))
    `:d>0n?await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${y}::uuid, ${_}::uuid, ${m}::uuid, ((${p}::numeric) * -1)),
        (${y}::uuid, ${f}::uuid, ${m}::uuid, (${T}::numeric))
    `:await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${y}::uuid, ${_}::uuid, ${m}::uuid, ((${p}::numeric) * -1)),
        (${y}::uuid, ${h}::uuid, ${m}::uuid, (${B}::numeric))
    `,c>o)?{code:"gas_fee_invalid",details:{message:"burn exceeds fee"}}:((0,t.sub3818NonNegative)((0,t.fromBigInt3818)(o),(0,t.fromBigInt3818)(d+c)),null)}e.s(["chargeGasFee",()=>B,"chargeGasFeeFromQuote",()=>A,"quoteGasFee",()=>T])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__6519e612._.js.map