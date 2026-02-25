module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let i=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||i.has("Retry-After")||i.set("Retry-After","3"),Response.json(a,{status:r,headers:i})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function i(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>i,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let i=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&i.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(i){var a;if(!r(i))throw i;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function i(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>i,"retryOnceOnTransientDbError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function i(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function n(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),i=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(i))}return t}function s(e){return n(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,n={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},s=a(Buffer.from(JSON.stringify(n),"utf8")),o=i(e.secret,s);return`${s}.${o}`}function l(e){let r,a=e.token.trim(),n=a.indexOf(".");if(n<=0)return{ok:!1,error:"session_token_invalid"};let s=a.slice(0,n),o=a.slice(n+1);if(!s||!o)return{ok:!1,error:"session_token_invalid"};let l=i(e.secret,s),d=Buffer.from(o),u=Buffer.from(l);if(d.length!==u.length||!(0,t.timingSafeEqual)(d,u))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=s.length%4,t=(s+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let c=Math.floor((e.now??Date.now())/1e3);return r.exp<=c?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function d(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function u(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>s,"parseCookieHeader",()=>n,"serializeClearSessionCookie",()=>u,"serializeSessionCookie",()=>d,"verifySessionToken",()=>l])},977775,e=>{"use strict";var t=e.i(691180);function r(e){let r=process.env.PROOFPACK_SESSION_SECRET??"";if(r){let a=(0,t.getSessionTokenFromRequest)(e);if(a){let e=(0,t.verifySessionToken)({token:a,secret:r});if(e.ok)return e.payload.uid}}else if(1)return console.error("[FATAL] PROOFPACK_SESSION_SECRET is not set in production!"),null;let a=process.env.INTERNAL_SERVICE_SECRET;if(a){let t=e.headers.get("x-internal-service-token");if(t&&t===a){let t=e.headers.get("x-user-id");if(t)return t}}return null}function a(e){return e?null:"missing_x_user_id"}function i(e,t){return!!e&&(e===t.buyer_user_id||e===t.seller_user_id)}e.s(["getActingUserId",()=>r,"isParty",()=>i,"requireActingUserIdInProd",()=>a])},720290,e=>{"use strict";var t=e.i(254799);function r(e){return t.default.createHash("sha256").update(e).digest("hex")}function a(e=32){return t.default.randomBytes(e).toString("base64")}function i(e){return/^[0-9a-f]{64}$/i.test(String(e??"").trim())}function n(e){if(e.length<8)throw Error("buffer_too_small");let t=0n;for(let r=0;r<8;r++)t=t<<8n|BigInt(e[r]);return t}e.s(["bytesToU64BigInt",()=>n,"isSha256Hex",()=>i,"randomSeedB64",()=>a,"sha256Hex",()=>r])},796929,e=>{"use strict";function t(e){return new Date(Date.UTC(e.getUTCFullYear(),e.getUTCMonth(),e.getUTCDate())).toISOString().slice(0,10)}async function r(e,t){let r=(await e`
    SELECT
      self_excluded_until::text AS self_excluded_until,
      daily_action_limit,
      daily_shard_spend_limit
    FROM arcade_safety_limits
    WHERE user_id = ${t}::uuid
    LIMIT 1
  `)[0];return{self_excluded_until:r?.self_excluded_until??null,daily_action_limit:r?.daily_action_limit??null,daily_shard_spend_limit:r?.daily_shard_spend_limit??null}}async function a(e,a){let i=await r(e,a.userId);if(i.self_excluded_until){let e=Date.parse(i.self_excluded_until);if(Number.isFinite(e)&&e>Date.now())return{ok:!1,error:"self_excluded",details:{until:i.self_excluded_until}}}if("number"==typeof i.daily_action_limit&&Number.isFinite(i.daily_action_limit)&&i.daily_action_limit>0){let r=t(new Date),n=`${r}T00:00:00.000Z`,[s]=await e`
      SELECT count(*)::text AS c
      FROM arcade_action
      WHERE user_id = ${a.userId}::uuid
        AND requested_at >= ${n}::timestamptz
    `,o=Number(s?.c??"0");if(Number.isFinite(o)&&o>=i.daily_action_limit)return{ok:!1,error:"rate_limit_exceeded",details:{kind:"daily_action_limit",limit:i.daily_action_limit}}}let n=Math.max(0,Math.floor(Number(a.shardSpend??0)));if(n>0&&"number"==typeof i.daily_shard_spend_limit&&Number.isFinite(i.daily_shard_spend_limit)&&i.daily_shard_spend_limit>0){let r=t(new Date),s=`${r}T00:00:00.000Z`,[o]=await e`
      SELECT coalesce(sum(quantity), 0)::text AS q
      FROM arcade_consumption
      WHERE user_id = ${a.userId}::uuid
        AND kind = 'shard'
        AND code = 'arcade_shard'
        AND created_at >= ${s}::timestamptz
    `,l=Number(o?.q??"0");if(Number.isFinite(l)&&l+n>i.daily_shard_spend_limit)return{ok:!1,error:"rate_limit_exceeded",details:{kind:"daily_shard_spend_limit",limit:i.daily_shard_spend_limit,used:l,requested:n}}}return{ok:!0}}async function i(e,t){let r=t.selfExcludedUntil?.trim()?t.selfExcludedUntil.trim():null,a="number"==typeof t.dailyActionLimit&&Number.isFinite(t.dailyActionLimit)?Math.max(0,Math.floor(t.dailyActionLimit)):null,i="number"==typeof t.dailyShardSpendLimit&&Number.isFinite(t.dailyShardSpendLimit)?Math.max(0,Math.floor(t.dailyShardSpendLimit)):null,n=(await e`
    INSERT INTO arcade_safety_limits (user_id, self_excluded_until, daily_action_limit, daily_shard_spend_limit, updated_at)
    VALUES (
      ${t.userId}::uuid,
      ${r}::timestamptz,
      ${a},
      ${i},
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
  `)[0];return{self_excluded_until:n?.self_excluded_until??null,daily_action_limit:n?.daily_action_limit??null,daily_shard_spend_limit:n?.daily_shard_spend_limit??null}}e.s(["enforceArcadeSafety",()=>a,"getArcadeSafetyLimits",()=>r,"upsertArcadeSafetyLimits",()=>i])},273278,e=>{"use strict";var t=e.i(720290);let r="progression",a=[0,10,25,50,100,200,350,550,800];function i(e){let t=e+1;return t<a.length?a[t]:null}function n(e){let t=Number(e?.xp??0),r=Number(e?.tier??0),a=Number(e?.prestige??0);return{xp:Number.isFinite(t)?Math.max(0,Math.floor(t)):0,tier:Number.isFinite(r)?Math.max(0,Math.floor(r)):0,prestige:Number.isFinite(a)?Math.max(0,Math.floor(a)):0}}async function s(e,t){let a=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${t}::uuid
      AND key = ${r}
    LIMIT 1
  `;return n(a[0]?.value_json??{})}async function o(e,i){let s=Math.max(0,Math.floor(Number(i.deltaXp??0))),o=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${i.userId}::uuid
      AND key = ${r}
    LIMIT 1
    FOR UPDATE
  `,l=n(o[0]?.value_json??{}),d=l.xp+s,u=function(e){let t=Math.max(0,Math.floor(e)),r=0;for(let e=0;e<a.length;e++)t>=a[e]&&(r=e);return r}(d),c=0,_=u;if(u>l.tier){let e=parseInt((0,t.sha256Hex)(`${i.contextRandomHash}:tier_up:${l.tier}->${u}:${i.source}`).slice(0,4),16);c=Number.isFinite(e)?e%6:0,_=u}let p={xp:d+c,tier:_,prestige:l.prestige};await e`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${i.userId}::uuid,
      ${r},
      ${e.json(p)}::jsonb,
      now(),
      now()
    )
    ON CONFLICT (user_id, key)
    DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()
  `;let m=p.tier>l.tier;return m&&!1!==i.grantCosmetics&&await e`
      INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
      VALUES (
        ${i.userId}::uuid,
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
    `,{before:l,after:p,tierUp:m,bonusXp:c}}async function l(e,t){let a=await e`
    SELECT value_json
    FROM arcade_state
    WHERE user_id = ${t.userId}::uuid
      AND key = ${r}
    LIMIT 1
    FOR UPDATE
  `,i=n(a[0]?.value_json??{});if(i.tier<3)throw Object.assign(Error("prestige_not_available"),{code:"prestige_not_available"});let s={xp:0,tier:0,prestige:i.prestige+1};return await e`
    INSERT INTO arcade_state (user_id, key, value_json, created_at, updated_at)
    VALUES (
      ${t.userId}::uuid,
      ${r},
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
  `,{before:i,after:s}}e.s(["addArcadeXp",()=>o,"getProgressionState",()=>s,"nextTierXp",()=>i,"prestigeReset",()=>l])},66137,e=>{"use strict";var t=e.i(720290);let r={low:[{weight:8450,value:"common"},{weight:1150,value:"uncommon"},{weight:330,value:"rare"},{weight:60,value:"epic"},{weight:10,value:"legendary"}],medium:[{weight:7600,value:"common"},{weight:1500,value:"uncommon"},{weight:720,value:"rare"},{weight:150,value:"epic"},{weight:30,value:"legendary"}],high:[{weight:6700,value:"common"},{weight:1850,value:"uncommon"},{weight:1050,value:"rare"},{weight:290,value:"epic"},{weight:110,value:"legendary"}]},a={common:[{base_code:"forge_spark",label:"Forged Spark"},{base_code:"forge_sticker",label:"Forged Sticker"},{base_code:"forge_badge",label:"Forged Badge"}],uncommon:[{base_code:"forge_glow",label:"Forged Glow"},{base_code:"forge_frame",label:"Forged Frame"}],rare:[{base_code:"forge_aura",label:"Forged Aura"},{base_code:"forge_title",label:"Forged Title"}],epic:[{base_code:"forge_comet",label:"Forged Comet"},{base_code:"forge_sigil",label:"Forged Sigil"}],legendary:[{base_code:"forge_crown",label:"Forged Crown"},{base_code:"forge_halo",label:"Forged Halo"}]},i=["Prismatic","Cerulean","Ember","Auric","Obsidian","Verdant","Iridescent","Radiant","Silent","Stellar"],n=["Thread","Circuit","Glyph","Echo","Bloom","Vector","Chime","Vow","Rift","Crest"];function s(e,t){let r=Number(e%BigInt(Math.max(1,t.length)));return t[r]??t[0]}function o(e){return(0,t.bytesToU64BigInt)(Buffer.from(e.slice(0,16),"hex"))}function l(e){switch(e){case"common":return"uncommon";case"uncommon":return"rare";case"rare":return"epic";default:return"legendary"}}function d(e){let t=String(e??"").toLowerCase();return"common"===t||"uncommon"===t||"rare"===t||"epic"===t||"legendary"===t?t:"common"}function u(e){let l=(0,t.sha256Hex)(`${e.serverSeedB64}:${e.clientSeed}:${e.actionId}:${e.userId}:${e.module}:${e.profile}:${e.clientCommitHash}:rarity`),d=function(e,t){let r=t.reduce((e,t)=>e+t.weight,0),a=Number(e%BigInt(r)),i=0;for(let e of t)if(a<(i+=e.weight))return{picked:e.value,roll:a,total:r};return{picked:t[t.length-1].value,roll:a,total:r}}(o(l),r[e.profile]??r.low),u=d.picked,c=(0,t.sha256Hex)(`${l}:template:${u}`),_=o(c),p=a[u]??a.common,m=Number(_%BigInt(p.length)),f=p[m]??p[0],h=o((0,t.sha256Hex)(`${c}:traits`)),y=s(h,i),g=s(h>>13n,n),E=[`${y} ${g}`,`${g} of ${y}`],v=c.slice(0,10);return{outcome:{kind:"cosmetic",code:`${f.base_code}:${v}`,rarity:u,label:f.label,metadata:{base_code:f.base_code,traits:E,origin:"blind_creation"}},audit:{random_hash:c,rarity_roll:d.roll,rarity_total:d.total,template_roll:m,template_total:p.length}}}function c(e){let r=d(e.input.rarity),u=(0,t.sha256Hex)(`${e.serverSeedB64}:${e.clientSeed}:${e.actionId}:${e.userId}:${e.module}:${e.profile}:${e.clientCommitHash}:mutate:${e.input.code}:${r}`),c=Number(o(u)%10000n),_="high"===e.profile?2600:"medium"===e.profile?1800:1200,p="legendary"!==r&&c<_,m=p?l(r):r,f=(0,t.sha256Hex)(`${u}:template:${m}`),h=s(o(f),a[m]??a.common),y=o((0,t.sha256Hex)(`${f}:traits`)),g=s(y,i),E=s(y>>9n,n),v=[`${g} ${E}`,`${g} ${E} (mutated)`],b=f.slice(0,10);return{outcome:{kind:"cosmetic",code:`${h.base_code}:mut:${b}`,rarity:m,label:h.label,metadata:{base_code:h.base_code,traits:v,origin:"mutation",parent_codes:[e.input.code]}},audit:{random_hash:f,roll:c,total:1e4,upgraded:p}}}function _(e){let r=d(e.input.rarity_a),a=d(e.input.rarity_b),u=(0,t.sha256Hex)(`${e.serverSeedB64}:${e.clientSeed}:${e.actionId}:${e.userId}:${e.module}:${e.profile}:${e.clientCommitHash}:fusion:${e.input.code_a}:${r}:${e.input.code_b}:${a}`),c=Number(o(u)%10000n),_="legendary"===r||"legendary"===a?"legendary":"epic"===r||"epic"===a?"epic":"rare"===r||"rare"===a?"rare":"uncommon"===r||"uncommon"===a?"uncommon":"common",p=r===a?"high"===e.profile?3500:"medium"===e.profile?2500:1500:"high"===e.profile?1500:"medium"===e.profile?1e3:500,m="legendary"!==_&&c<p,f=m?l(_):_,h=(0,t.sha256Hex)(`${u}:template:${f}`),y=s(o(h),[{base_code:"fusion_emblem",label:"Fusion Emblem"},{base_code:"fusion_knot",label:"Fusion Knot"},{base_code:"fusion_seal",label:"Fusion Seal"}]),g=o((0,t.sha256Hex)(`${h}:traits`)),E=s(g,i),v=s(g>>11n,n),b=[`${E} ${v}`,`Bound ${v}`],x=h.slice(0,10);return{outcome:{kind:"cosmetic",code:`${y.base_code}:fus:${x}`,rarity:f,label:y.label,metadata:{base_code:y.base_code,traits:b,origin:"fusion",parent_codes:[e.input.code_a,e.input.code_b]}},audit:{random_hash:h,roll:c,total:1e4,upgraded:m}}}e.s(["resolveBlindCreation",()=>u,"resolveFusion",()=>_,"resolveMutation",()=>c])},122384,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),i=e.i(759756),n=e.i(561916),s=e.i(174677),o=e.i(869741),l=e.i(316795),d=e.i(487718),u=e.i(995169),c=e.i(47587),_=e.i(666012),p=e.i(570101),m=e.i(626937),f=e.i(10372),h=e.i(193695);e.i(52474);var y=e.i(600220),g=e.i(469719),E=e.i(300959),v=e.i(843793),b=e.i(184883),x=e.i(977775),w=e.i(720290),S=e.i(66137),$=e.i(273278),k=e.i(796929);let T=g.z.object({action_id:g.z.string().uuid(),client_seed:g.z.string().min(8).max(256)}),N="blind_creation";async function R(e){let t,r=(0,x.getActingUserId)(e),a=(0,x.requireActingUserIdInProd)(r);if(a)return(0,E.apiError)(a);if(!r)return(0,E.apiError)("missing_x_user_id");let i=await e.json().catch(()=>({}));try{t=T.parse(i)}catch(e){return(0,E.apiZodError)(e)??(0,E.apiError)("invalid_input")}let n=t.action_id,s=String(t.client_seed??"").trim(),o=(0,v.getSql)();try{let e=await (0,b.retryOnceOnTransientDbError)(async()=>await o.begin(async e=>{let t=await (0,k.enforceArcadeSafety)(e,{userId:r,module:N});if(!t.ok)return{kind:"err",err:(0,E.apiError)(t.error,{details:t.details})};let a=await e`
          SELECT
            id::text AS id,
            user_id::text AS user_id,
            module,
            profile,
            status,
            client_commit_hash,
            server_commit_hash,
            server_seed_b64,
            resolves_at,
            outcome_json
          FROM arcade_action
          WHERE id = ${n}::uuid
          LIMIT 1
          FOR UPDATE
        `;if(!a.length)return{kind:"err",err:(0,E.apiError)("not_found")};let i=a[0];if(i.user_id!==r)return{kind:"err",err:(0,E.apiError)("x_user_id_mismatch")};if(i.module!==N)return{kind:"err",err:(0,E.apiError)("invalid_input")};if("resolved"===i.status)return{kind:"ok",already:!0,outcome:i.outcome_json};let o=!!i.resolves_at&&new Date(i.resolves_at).getTime()<=Date.now();if("ready"!==i.status&&!("scheduled"===i.status&&o))return{kind:"err",err:(0,E.apiError)("trade_state_conflict",{details:{status:i.status,resolves_at:i.resolves_at}})};"scheduled"===i.status&&o&&(await e`
            UPDATE arcade_action
            SET status = 'ready'
            WHERE id = ${n}::uuid AND status = 'scheduled'
          `,i.status="ready");let l=(0,w.sha256Hex)(s);if(!(0,w.isSha256Hex)(l)||l!==String(i.client_commit_hash??"").toLowerCase())return{kind:"err",err:(0,E.apiError)("invalid_input",{details:"client_seed does not match commit"})};if((0,w.sha256Hex)(`${i.server_seed_b64}:${i.client_commit_hash}:${i.module}:${i.profile}:${r}`)!==String(i.server_commit_hash??"").toLowerCase())return{kind:"err",err:(0,E.apiError)("internal_error",{details:"server_commit_mismatch"})};let d=(0,S.resolveBlindCreation)({actionId:i.id,userId:r,module:i.module,profile:i.profile,serverSeedB64:i.server_seed_b64,clientSeed:s,clientCommitHash:i.client_commit_hash}),u={module:i.module,profile:i.profile,outcome:d.outcome,audit:{client_commit_hash:i.client_commit_hash,server_commit_hash:i.server_commit_hash,server_seed_b64:i.server_seed_b64,random_hash:d.audit.random_hash,rarity_roll:d.audit.rarity_roll,rarity_total:d.audit.rarity_total,template_roll:d.audit.template_roll,template_total:d.audit.template_total}};return await e`
          INSERT INTO arcade_inventory (user_id, kind, code, rarity, quantity, metadata_json, created_at, updated_at)
          VALUES (
            ${r}::uuid,
            ${d.outcome.kind},
            ${d.outcome.code},
            ${d.outcome.rarity},
            1,
            ${e.json({label:d.outcome.label,...d.outcome.metadata,source:N,action_id:i.id})},
            now(),
            now()
          )
          ON CONFLICT (user_id, kind, code, rarity)
          DO UPDATE SET quantity = arcade_inventory.quantity + 1, updated_at = now()
        `,await e`
          UPDATE arcade_action
          SET status = 'resolved',
              resolved_at = now(),
              reveal_json = ${e.json({client_seed_present:!0})},
              outcome_json = ${e.json(u)}
          WHERE id = ${i.id}::uuid
        `,await (0,$.addArcadeXp)(e,{userId:r,deltaXp:2,contextRandomHash:d.audit.random_hash,source:N}),{kind:"ok",already:!1,outcome:u}}));if("err"===e.kind)return e.err;return Response.json({ok:!0,action_id:n,already_resolved:e.already,result:e.outcome},{status:200})}catch(t){let e=(0,b.responseForDbError)("arcade_creation_reveal",t);if(e)return e;return(0,E.apiError)("internal_error")}}e.s(["POST",()=>R,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],182799);var C=e.i(182799);let I=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/arcade/creation/reveal/route",pathname:"/api/arcade/creation/reveal",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/arcade/creation/reveal/route.ts",nextConfigOutput:"",userland:C}),{workAsyncStorage:O,workUnitAsyncStorage:A,serverHooks:D}=I;function F(){return(0,a.patchFetch)({workAsyncStorage:O,workUnitAsyncStorage:A})}async function U(e,t,a){I.isDev&&(0,i.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/arcade/creation/reveal/route";g=g.replace(/\/index$/,"")||"/";let E=await I.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!E)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:v,params:b,nextConfig:x,parsedUrl:w,isDraftMode:S,prerenderManifest:$,routerServerContext:k,isOnDemandRevalidate:T,revalidateOnlyGenerated:N,resolvedPathname:R,clientReferenceManifest:C,serverActionsManifest:O}=E,A=(0,o.normalizeAppPath)(g),D=!!($.dynamicRoutes[A]||$.routes[R]),F=async()=>((null==k?void 0:k.render404)?await k.render404(e,t,w,!1):t.end("This page could not be found"),null);if(D&&!S){let e=!!$.routes[R],t=$.dynamicRoutes[A];if(t&&!1===t.fallback&&!e){if(x.experimental.adapterPath)return await F();throw new h.NoFallbackError}}let U=null;!D||I.isDev||S||(U="/index"===(U=R)?"/":U);let j=!0===I.isDev||!D,M=D&&!j;O&&C&&(0,s.setManifestsSingleton)({page:g,clientReferenceManifest:C,serverActionsManifest:O});let q=e.method||"GET",H=(0,n.getTracer)(),P=H.getActiveScopeSpan(),L={params:b,prerenderManifest:$,renderOpts:{experimental:{authInterrupts:!!x.experimental.authInterrupts},cacheComponents:!!x.cacheComponents,supportsDynamicResponse:j,incrementalCache:(0,i.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:x.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,i)=>I.onRequestError(e,t,a,i,k)},sharedContext:{buildId:v}},B=new l.NodeNextRequest(e),V=new l.NodeNextResponse(t),X=d.NextRequestAdapter.fromNodeNextRequest(B,(0,d.signalFromNodeResponse)(t));try{let s=async e=>I.handle(X,L).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=H.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==u.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${q} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${q} ${g}`)}),o=!!(0,i.getRequestMeta)(e,"minimalMode"),l=async i=>{var n,l;let d=async({previousCacheEntry:r})=>{try{if(!o&&T&&N&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let n=await s(i);e.fetchMetrics=L.renderOpts.fetchMetrics;let l=L.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let d=L.renderOpts.collectedTags;if(!D)return await (0,_.sendResponse)(B,V,n,L.renderOpts.pendingWaitUntil),null;{let e=await n.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(n.headers);d&&(t[f.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==L.renderOpts.collectedRevalidate&&!(L.renderOpts.collectedRevalidate>=f.INFINITE_CACHE)&&L.renderOpts.collectedRevalidate,a=void 0===L.renderOpts.collectedExpire||L.renderOpts.collectedExpire>=f.INFINITE_CACHE?void 0:L.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:n.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await I.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,k),t}},u=await I.handleResponse({req:e,nextConfig:x,cacheKey:U,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:$,isRoutePPREnabled:!1,isOnDemandRevalidate:T,revalidateOnlyGenerated:N,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:o});if(!D)return null;if((null==u||null==(n=u.value)?void 0:n.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==u||null==(l=u.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",T?"REVALIDATED":u.isMiss?"MISS":u.isStale?"STALE":"HIT"),S&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,p.fromNodeOutgoingHttpHeaders)(u.value.headers);return o&&D||h.delete(f.NEXT_CACHE_TAGS_HEADER),!u.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,m.getCacheControlHeader)(u.cacheControl)),await (0,_.sendResponse)(B,V,new Response(u.value.body,{headers:h,status:u.value.status||200})),null};P?await l(P):await H.withPropagatedContext(e.headers,()=>H.trace(u.BaseServerSpan.handleRequest,{spanName:`${q} ${g}`,kind:n.SpanKind.SERVER,attributes:{"http.method":q,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await I.onRequestError(e,t,{routerKind:"App Router",routePath:A,routeType:"route",revalidateReason:(0,c.getRevalidateReason)({isStaticGeneration:M,isOnDemandRevalidate:T})},!1,k),D)throw t;return await (0,_.sendResponse)(B,V,new Response(null,{status:500})),null}}e.s(["handler",()=>U,"patchFetch",()=>F,"routeModule",()=>I,"serverHooks",()=>D,"workAsyncStorage",()=>O,"workUnitAsyncStorage",()=>A],122384)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__a0c086aa._.js.map