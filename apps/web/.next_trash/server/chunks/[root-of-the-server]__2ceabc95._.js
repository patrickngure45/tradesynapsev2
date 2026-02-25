module.exports=[918622,(e,t,i)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,i)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,i)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,i)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,i)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,i)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,i)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,i)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,i)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,i)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,i)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,i)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function i(e,t){let i=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),r={error:e};"string"==typeof t?.details?(r.message=t.details,r.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(r.details=t.details,"message"in t.details&&(r.message=t.details.message));let a=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||a.has("Retry-After")||a.set("Retry-After","3"),Response.json(r,{status:i,headers:a})}function r(e){return e instanceof t.ZodError?i("invalid_input",{status:400,details:e.issues}):null}function a(e,t){return i("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>i,"apiUpstreamUnavailable",()=>a,"apiZodError",()=>r])},184883,e=>{"use strict";var t=e.i(300959);function i(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),i=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),r=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&r.has(t))return!0;let a=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&a.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(i))}async function r(e,t){try{return await e()}catch(a){var r;if(!i(a))throw a;return await (r=t?.delayMs??50,new Promise(e=>setTimeout(e,r))),await e()}}function a(e,r){return i(r)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>i,"responseForDbError",()=>a,"retryOnceOnTransientDbError",()=>r])},666680,(e,t,i)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let i="pp_session";function r(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function a(e,i){return r((0,t.createHmac)("sha256",e).update(i,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let i of e.split(/;\s*/g)){let e=i.indexOf("=");if(e<=0)continue;let r=i.slice(0,e).trim(),a=i.slice(e+1).trim();r&&(t[r]=decodeURIComponent(a))}return t}function s(e){return n(e.headers.get("cookie"))[i]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),i="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+i,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=r(Buffer.from(JSON.stringify(n),"utf8")),o=a(e.secret,s);return`${s}.${o}`}function d(e){let i,r=e.token.trim(),n=r.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=r.slice(0,n),o=r.slice(n+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let d=a(e.secret,s),_=Buffer.from(o),l=Buffer.from(d);if(_.length!==l.length||!(0,t.timingSafeEqual)(_,l))return{ok:!1,error:"session_token_invalid"};try{let e,t;i=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!i||"object"!=typeof i||"string"!=typeof i.uid||!i.uid||"number"!=typeof i.exp||!Number.isFinite(i.exp))return{ok:!1,error:"session_token_invalid"};if(null!=i.sv){let e=Number(i.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};i.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return i.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:i}}function _(e){let t=[`${i}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function l(e){let t=[`${i}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>l,"serializeSessionCookie",()=>_,"verifySessionToken",()=>d])},977775,e=>{"use strict";var t=e.i(691180);function i(e){let i=process.env.PROOFPACK_SESSION_SECRET??"";if(i){let r=(0,t.getSessionTokenFromRequest)(e);if(r){let e=(0,t.verifySessionToken)({token:r,secret:i});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let r=process.env.INTERNAL_SERVICE_SECRET;if(r){let t=e.headers.get("x-internal-service-token");if(t&&t===r){let t=e.headers.get("x-user-id");if(t)return t}}return null}function r(e){return e?null:"missing_x_user_id"}function a(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>i,"isParty",()=>a,"requireActingUserIdInProd",()=>r])},720290,e=>{"use strict";var t=e.i(254799);function i(e){return t.default.createHash("sha256").update(e).digest("hex")}function r(e=32){return t.default.randomBytes(e).toString("base64")}function a(e){return/^[0-9a-f]{64}$/i.test(String(e??"").trim())}function n(e){if(e.length<8)throw Error("buffer_too_small");let t=0n;for(let i=0;i<8;i++)t=t<<8n|BigInt(e[i]);return t}e.s(["bytesToU64BigInt",()=>n,"isSha256Hex",()=>a,"randomSeedB64",()=>r,"sha256Hex",()=>i])},796929,e=>{"use strict";function t(e){return new Date(Date.UTC(e.getUTCFullYear(),e.getUTCMonth(),e.getUTCDate())).toISOString().slice(0,10)}async function i(e,t){let i=(await e`
    SELECT
      self_excluded_until::text AS self_excluded_until,
      daily_action_limit,
      daily_shard_spend_limit
    FROM arcade_safety_limits
    WHERE user_id = ${t}::uuid
    LIMIT 1
  `)[0];return{self_excluded_until:i?.self_excluded_until??null,daily_action_limit:i?.daily_action_limit??null,daily_shard_spend_limit:i?.daily_shard_spend_limit??null}}async function r(e,r){let a=await i(e,r.userId);if(a.self_excluded_until){let e=Date.parse(a.self_excluded_until);if(Number.isFinite(e)&&e>Date.now())return{ok:!1,error:"self_excluded",details:{until:a.self_excluded_until}}}if("number"==typeof a.daily_action_limit&&Number.isFinite(a.daily_action_limit)&&a.daily_action_limit>0){let i=t(new Date),n=`${i}T00:00:00.000Z`,[s]=await e`
      SELECT count(*)::text AS c
      FROM arcade_action
      WHERE user_id = ${r.userId}::uuid
        AND requested_at >= ${n}::timestamptz
    `,o=Number(s?.c??"0");if(Number.isFinite(o)&&o>=a.daily_action_limit)return{ok:!1,error:"rate_limit_exceeded",details:{kind:"daily_action_limit",limit:a.daily_action_limit}}}let n=Math.max(0,Math.floor(Number(r.shardSpend??0)));if(n>0&&"number"==typeof a.daily_shard_spend_limit&&Number.isFinite(a.daily_shard_spend_limit)&&a.daily_shard_spend_limit>0){let i=t(new Date),s=`${i}T00:00:00.000Z`,[o]=await e`
      SELECT coalesce(sum(quantity), 0)::text AS q
      FROM arcade_consumption
      WHERE user_id = ${r.userId}::uuid
        AND kind = 'shard'
        AND code = 'arcade_shard'
        AND created_at >= ${s}::timestamptz
    `,d=Number(o?.q??"0");if(Number.isFinite(d)&&d+n>a.daily_shard_spend_limit)return{ok:!1,error:"rate_limit_exceeded",details:{kind:"daily_shard_spend_limit",limit:a.daily_shard_spend_limit,used:d,requested:n}}}return{ok:!0}}async function a(e,t){let i=t.selfExcludedUntil?.trim()?t.selfExcludedUntil.trim():null,r="number"==typeof t.dailyActionLimit&&Number.isFinite(t.dailyActionLimit)?Math.max(0,Math.floor(t.dailyActionLimit)):null,a="number"==typeof t.dailyShardSpendLimit&&Number.isFinite(t.dailyShardSpendLimit)?Math.max(0,Math.floor(t.dailyShardSpendLimit)):null,n=(await e`
    INSERT INTO arcade_safety_limits (user_id, self_excluded_until, daily_action_limit, daily_shard_spend_limit, updated_at)
    VALUES (
      ${t.userId}::uuid,
      ${i}::timestamptz,
      ${r},
      ${a},
      now()
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      self_excluded_until = EXCLUDED.self_excluded_until,
      daily_action_limit = EXCLUDED.daily_action_limit,
      daily_shard_spend_limit = EXCLUDED.daily_shard_spend_limit,
      updated_at = now()
    RETURNING
      self_excluded_until::text AS self_excluded_until,
      daily_action_limit,
      daily_shard_spend_limit
  `)[0];return{self_excluded_until:n?.self_excluded_until??null,daily_action_limit:n?.daily_action_limit??null,daily_shard_spend_limit:n?.daily_shard_spend_limit??null}}e.s(["enforceArcadeSafety",()=>r,"getArcadeSafetyLimits",()=>i,"upsertArcadeSafetyLimits",()=>a])},60828,e=>{"use strict";async function t(e,t){await e`
    INSERT INTO arcade_consumption (
      user_id,
      kind,
      code,
      rarity,
      quantity,
      context_type,
      context_id,
      module,
      metadata_json
    ) VALUES (
      ${t.user_id}::uuid,
      ${t.kind},
      ${t.code},
      ${t.rarity??null},
      ${Math.max(1,Math.floor(Number(t.quantity??1)))},
      ${t.context_type},
      ${t.context_id??null},
      ${t.module??null},
      ${e.json(t.metadata??{})}
    )
  `}e.s(["logArcadeConsumption",()=>t])},273278,e=>{"use strict";var t=e.i(720290);let i="progression",r=[0,10,25,50,100,200,350,550,800];function a(e){let t=e+1;return t<r.length?r[t]:null}function n(e){let t=Number(e?.xp??0),i=Number(e?.tier??0),r=Number(e?.prestige??0);return{xp:Number.isFinite(t)?Math.max(0,Math.floor(t)):0,tier:Number.isFinite(i)?Math.max(0,Math.floor(i)):0,prestige:Number.isFinite(r)?Math.max(0,Math.floor(r)):0}}async function s(e,t){let r=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${t}::uuid
      AND key = ${i}
    LIMIT 1
  `;return n(r[0]?.value_json??{})}async function o(e,a){let s=Math.max(0,Math.floor(Number(a.deltaXp??0))),o=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${a.userId}::uuid
      AND key = ${i}
    LIMIT 1
    FOR UPDATE
  `,d=n(o[0]?.value_json??{}),_=d.xp+s,l=function(e){let t=Math.max(0,Math.floor(e)),i=0;for(let e=0;e<r.length;e++)t>=r[e]&&(i=e);return i}(_),u=0,c=l;if(l>d.tier){let e=parseInt((0,t.sha256Hex)(`${a.contextRandomHash}:tier_up:${d.tier}->${l}:${a.source}`).slice(0,4),16);u=Number.isFinite(e)?e%6:0,c=l}let p={xp:_+u,tier:c,prestige:d.prestige};await e`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${a.userId}::uuid,
      ${i},
      ${e.json(p)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `;let f=p.tier>d.tier;return f&&!1!==a.grantCosmetics&&await e`
      INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
      VALUES (
        ${a.userId}::uuid,
        'badge',
        ${`tier_${p.tier}`},
        'common',
        1,
        ${e.json({label:`Tier ${p.tier} Badge`,source:"tier_up",tier:p.tier})}::jsonb,
        now(),
        now()
      )
      ON CONFLICT (user_id, kind, code, rarity)
      DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
    `,{before:d,after:p,tierUp:f,bonusXp:u}}async function d(e,t){let r=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${t.userId}::uuid
      AND key = ${i}
    LIMIT 1
    FOR UPDATE
  `,a=n(r[0]?.value_json??{});if(a.tier<3)throw Object.assign(Error("prestige_not_available"),{code:"prestige_not_available"});let s={xp:0,tier:0,prestige:a.prestige+1};return await e`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${t.userId}::uuid,
      ${i},
      ${e.json(s)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `,await e`
    INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
    VALUES (
      ${t.userId}::uuid,
      'badge',
      ${`prestige_${s.prestige}`},
      'rare',
      1,
      ${e.json({label:`Prestige ${s.prestige}`,source:"prestige"})}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, kind, code, rarity)
    DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
  `,{before:a,after:s}}e.s(["addArcadeXp",()=>o,"getProgressionState",()=>s,"nextTierXp",()=>a,"prestigeReset",()=>d])}];

//# sourceMappingURL=%5Broot-of-the-server%5D__2ceabc95._.js.map