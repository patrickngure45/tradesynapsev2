module.exports=[666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function a(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function n(e,r){return a((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function s(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let a=r.slice(0,e).trim(),n=r.slice(e+1).trim();a&&(t[a]=decodeURIComponent(n))}return t}function i(e){return s(e.headers.get("cookie"))[r]??null}function o(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,s={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},i=a(Buffer.from(JSON.stringify(s),"utf8")),o=n(e.secret,i);return`${i}.${o}`}function u(e){let r,a=e.token.trim(),s=a.indexOf(".");if(s<=0)return{ok:!1,error:"session_token_invalid"};let i=a.slice(0,s),o=a.slice(s+1);if(!i||!o)return{ok:!1,error:"session_token_invalid"};let u=n(e.secret,i),d=Buffer.from(o),l=Buffer.from(u);if(d.length!==l.length||!(0,t.timingSafeEqual)(d,l))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=i.length%4,t=(i+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let _=Math.floor((e.now??Date.now())/1e3);return r.exp<=_?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function d(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function l(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>o,"getSessionTokenFromRequest",()=>i,"parseCookieHeader",()=>s,"serializeClearSessionCookie",()=>l,"serializeSessionCookie",()=>d,"verifySessionToken",()=>u])},918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},184883,e=>{"use strict";var t=e.i(300959);function r(e){let t=((function(e){if(e&&"object"==typeof e)return"string"==typeof e.code?e.code:void 0})(e)??"").toUpperCase(),r=e&&"object"==typeof e&&"string"==typeof e.message?e.message:String(e),a=new Set(["CONNECTION_CLOSED","CONNECTION_ENDED","CONNECTION_DESTROYED","ECONNRESET","ETIMEDOUT","EPIPE","ENOTFOUND"]);if(t&&a.has(t))return!0;let n=new Set(["08000","08003","08006","08001","08004","57P01","57P02","57P03","53300"]);return!!(t&&n.has(t)||/CONNECTION_CLOSED|connection\s+terminated|terminating\s+connection|socket\s+hang\s+up|ECONNRESET|EPIPE/i.test(r))}async function a(e,t){try{return await e()}catch(n){var a;if(!r(n))throw n;return await (a=t?.delayMs??50,new Promise(e=>setTimeout(e,a))),await e()}}function n(e,a){return r(a)?(0,t.apiUpstreamUnavailable)({dependency:"db",op:e},{retryAfterSeconds:3}):null}e.s(["isTransientDbError",()=>r,"responseForDbError",()=>n,"retryOnceOnTransientDbError",()=>a])},364608,e=>{"use strict";async function t(e,t){if(!t)return null;let r=await e`
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
  `}function r(e){return{ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),requestId:e.headers.get("x-request-id")}}e.s(["auditContextFromRequest",()=>r,"writeAuditLog",()=>t])},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let r=String(process.env[t]??"").trim();r&&r.length>=8&&e.push(r)}return e}();function r(e){let r=e;for(let e of t)e&&r.includes(e)&&(r=r.split(e).join("[REDACTED]"));return r}function a(e,t,a){var n;let s,i=e.headers.get("x-request-id")??"unknown",o=new URL(e.url,"http://localhost");s={...n={requestId:i,method:e.method,path:o.pathname,status:t.status,durationMs:Date.now()-a.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:a.userId??null,meta:a.meta,ts:new Date().toISOString()},userAgent:n.userAgent?r(n.userAgent):n.userAgent,meta:n.meta?function e(t,a){if(a>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return r(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,a+1));if("object"==typeof t){let r={},n=0;for(let[s,i]of Object.entries(t)){if((n+=1)>80){r.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(s)?r[s]=e(i,a+1):r[s]="[REDACTED]"}return r}return String(t)}(n.meta,0):n.meta},process.stdout.write(JSON.stringify(s)+"\n")}e.s(["logRouteResponse",()=>a],371276)},60828,e=>{"use strict";async function t(e,t){await e`
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
  `}e.s(["logArcadeConsumption",()=>t])},891454,e=>{"use strict";var t=e.i(300959),r=e.i(691180);async function a(e,a){let n=String(process.env.PROOFPACK_SESSION_SECRET??"").trim();if(n){let s=(0,r.getSessionTokenFromRequest)(a);if(s){let a=(0,r.verifySessionToken)({token:s,secret:n});if(!a.ok)return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};let i=a.payload.uid,o=Math.max(0,Math.trunc(Number(a.payload.sv??0)||0));try{let r=await e`
          SELECT session_version
          FROM app_user
          WHERE id = ${i}::uuid
          LIMIT 1
        `;if(!r[0])return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})};if(Math.max(0,Math.trunc(Number(r[0].session_version??0)||0))!==o)return{ok:!1,response:(0,t.apiError)("session_revoked",{status:401})}}catch{return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}return{ok:!0,userId:i}}}else if(1)return{ok:!1,response:(0,t.apiError)("session_secret_not_configured")};let s=String(process.env.INTERNAL_SERVICE_SECRET??"").trim();if(s){let e=String(a.headers.get("x-internal-service-token")??"").trim();if(e&&e===s){let e=String(a.headers.get("x-user-id")??"").trim();if(e&&/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(e))return{ok:!0,userId:e}}}return{ok:!1,response:(0,t.apiError)("unauthorized",{status:401})}}e.s(["requireSessionUserId",()=>a])},677702,e=>{"use strict";var t=e.i(469719);let r=t.z.union([t.z.string(),t.z.number()]).transform(function(e){return"number"==typeof e?String(e):e.trim()}).refine(e=>e.length>0&&e.length<=80,"Invalid amount").refine(function(e){return/^(?:0|[1-9]\d{0,19})(?:\.\d{1,18})?$/.test(e)},"Invalid amount").refine(function(e){return""!==e.replace(".","").replace(/^0+/,"")},"Amount must be > 0");e.s(["amount3818PositiveSchema",0,r])},279174,e=>{"use strict";var t=e.i(666680);let r="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";function a(e,a,n){let s=function(e){let t=e.replace(/[=\s]/g,"").toUpperCase(),a=0,n=0,s=[];for(let e of t){let t=r.indexOf(e);if(-1===t)throw Error(`Invalid base32 character: ${e}`);n=n<<5|t,(a+=5)>=8&&(s.push(n>>>a-8&255),a-=8)}return Buffer.from(s)}(e),i=Math.floor(Math.floor((n??Date.now())/1e3)/30);for(let e=-1;e<=1;e++)if(function(e,r){let a=Buffer.alloc(8);a.writeBigUInt64BE(r);let n=(0,t.createHmac)("sha1",e).update(a).digest(),s=15&n[n.length-1];return String(((127&n[s])<<24|(255&n[s+1])<<16|(255&n[s+2])<<8|255&n[s+3])%1e6).padStart(6,"0")}(s,BigInt(i+e))===a.trim())return!0;return!1}function n(){return function(e){let t=0,a=0,n="";for(let s of e)for(a=a<<8|s,t+=8;t>=5;)n+=r[a>>>t-5&31],t-=5;return t>0&&(n+=r[a<<5-t&31]),n}((0,t.randomBytes)(20))}function s(e){let t=e.issuer??"TradeSynapse",r=`${t}:${e.email}`,a=new URLSearchParams({secret:e.secret,issuer:t,algorithm:"SHA1",digits:String(6),period:String(30)});return`otpauth://totp/${encodeURIComponent(r)}?${a.toString()}`}function i(e=8){let r="ABCDEFGHJKLMNPQRSTUVWXYZ23456789",a=[];for(let n=0;n<e;n++){let e=(0,t.randomBytes)(8),n="";for(let t of e)n+=r[t%r.length];a.push(`${n.slice(0,4)}-${n.slice(4)}`)}return a}e.s(["buildTOTPUri",()=>s,"generateBackupCodes",()=>i,"generateTOTPSecret",()=>n,"verifyTOTP",()=>a])},795374,e=>{"use strict";var t=e.i(279174);async function r(e,r,a){let n=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===n.length||!n[0].totp_enabled||!n[0].totp_secret)return null;let s=String(a??"").trim();return s&&6===s.length&&/^\d{6}$/.test(s)?(0,t.verifyTOTP)(n[0].totp_secret,s)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}async function a(e,r,a){let n=await e`
    SELECT totp_enabled, totp_secret FROM app_user WHERE id = ${r} LIMIT 1
  `;if(0===n.length)return null;if(!n[0].totp_enabled||!n[0].totp_secret)return Response.json({error:"totp_setup_required",message:"2FA must be enabled for this operation."},{status:403});let s=String(a??"").trim();return s&&6===s.length&&/^\d{6}$/.test(s)?(0,t.verifyTOTP)(n[0].totp_secret,s)?null:Response.json({error:"invalid_totp_code",message:"The 2FA code is incorrect or expired."},{status:403}):Response.json({error:"totp_required",message:"A valid 6-digit 2FA code is required for this operation."},{status:403})}e.s(["enforceTotpIfEnabled",()=>r,"enforceTotpRequired",()=>a])},991654,e=>{"use strict";async function t(e,t){let r=t.metadata??{},a=(await e`
    INSERT INTO ex_chain_block DEFAULT VALUES
    RETURNING id::text AS id, height
  `)[0],n=t.userId&&t.userId.trim().length?t.userId.trim():null;return{txHash:(await e`
    INSERT INTO ex_chain_tx (tx_hash, entry_id, type, user_id, block_id, metadata_json)
    VALUES (
      encode(gen_random_bytes(32), 'hex'),
      ${t.entryId}::uuid,
      ${t.type},
      CASE WHEN ${n}::text IS NULL THEN NULL ELSE ${n}::uuid END,
      ${a.id}::uuid,
      ${e.json(r)}::jsonb
    )
    RETURNING tx_hash
  `)[0].tx_hash,blockHeight:a.height,blockId:a.id}}e.s(["recordInternalChainTx",()=>t])},425686,e=>{"use strict";var t=e.i(430848),r=e.i(991654),a=e.i(60828),n=e.i(630862);let s="00000000-0000-0000-0000-000000000001",i="00000000-0000-0000-0000-000000000003";function o(e,t){let r=process.env[e],a=r?Number(r):NaN;return Number.isFinite(a)?Math.trunc(a):t}function u(e,t){let r=(process.env[e]??"").trim();return r?((0,n.toBigInt3818)(r),r):t}async function d(e,t){await e`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${t}::uuid, 'active', 'none', NULL)
    ON CONFLICT (id) DO NOTHING
  `}async function l(e,t,r){return(await e`
    INSERT INTO ex_ledger_account (user_id, asset_id)
    VALUES (${t}::uuid, ${r}::uuid)
    ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
    RETURNING id::text AS id
  `)[0].id}async function _(e,_){return await e.begin(async e=>{let c=await e`
      SELECT id, chain, symbol
      FROM ex_asset
      WHERE id = ${_.assetId}::uuid AND is_enabled = true
      LIMIT 1
    `;if(0===c.length)return{status:404,body:{error:"not_found"}};let p=c[0],f=await e`
      SELECT id::text AS id, email, status
      FROM app_user
      WHERE lower(email) = lower(${_.recipientEmail.trim()})
      LIMIT 1
    `;if(0===f.length)return{status:404,body:{error:"recipient_not_found"}};let m=f[0];if(m.id===_.actingUserId)return{status:409,body:{error:"recipient_same_as_sender"}};if("active"!==m.status)return{status:409,body:{error:"recipient_inactive"}};let[E,h]=await Promise.all([l(e,_.actingUserId,p.id),l(e,m.id,p.id)]),g=Math.max(0,Math.min(1e4,o("TRANSFER_USER_FEE_BPS",10))),y=g,b=null;if(g>0&&_.useFeeBoost){let t=await e`
        SELECT id::text AS id, quantity, code
        FROM arcade_inventory
        WHERE user_id = ${_.actingUserId}::uuid
          AND kind = 'boost'
          AND code = ANY(ARRAY['fee_25bps_7d','fee_15bps_72h','fee_10bps_48h','fee_5bps_24h']::text[])
        ORDER BY
          CASE code
            WHEN 'fee_25bps_7d' THEN 1
            WHEN 'fee_15bps_72h' THEN 2
            WHEN 'fee_10bps_48h' THEN 3
            WHEN 'fee_5bps_24h' THEN 4
            ELSE 99
          END,
          updated_at DESC
        LIMIT 1
        FOR UPDATE
      `;if(!t.length||0>=Number(t[0].quantity??0))return{status:409,body:{error:"insufficient_balance",details:{message:"No fee discount boost available."}}};let r=t[0],a=String(r.code??"").match(/fee_(\d+)bps/i),n=a?Number(a[1]):0;if(!Number.isFinite(n)||n<=0||n>2500)return{status:409,body:{error:"internal_error",details:{message:"invalid_fee_boost"}}};b={inventory_id:r.id,code:r.code,quantity:Number(r.quantity??0),bps:n},y=Math.max(0,g-n)}let S=u("TRANSFER_USER_FEE_MIN","0"),x=u("TRANSFER_USER_FEE_MAX","0"),R=y>0?(0,n.bpsFeeCeil3818)(_.amount,y):"0";(0,n.toBigInt3818)(R)>0n&&(0,n.toBigInt3818)(R)<(0,n.toBigInt3818)(S)&&(R=S),(0,n.toBigInt3818)(x)>0n&&(0,n.toBigInt3818)(R)>(0,n.toBigInt3818)(x)&&(R=x);let v=Math.max(0,Math.min(1e4,o("TRANSFER_FEE_BURN_BPS",0))),T="0",N=null,I=null,A=null,w=null,$=(await e`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${E}::uuid
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${E}::uuid AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${_.amount}::numeric)) AS ok
      FROM posted, held
    `)[0],C=await (0,t.quoteGasFee)(e,{action:"user_transfer",chain:p.chain,assetSymbol:p.symbol});if("code"in C)return{status:409,body:{error:C.code,details:C.details}};I=(C.gasSymbol??"").trim()||null,A=(C.amount??"").trim()||null,w=C.mode,C.enabled&&(0,n.toBigInt3818)(C.amount)>0n&&((C.chargeSymbol??"").trim().toUpperCase()===p.symbol.toUpperCase()&&C.chargeAmount?(T=C.chargeAmount,N="quote_charge_in_asset"):(T="0",N="sponsored_unavailable"));let O=(0,n.add3818)((0,n.add3818)(_.amount,R),T);if(!$||(0,n.toBigInt3818Signed)($.available)<(0,n.toBigInt3818)(O))return{status:409,body:{error:"insufficient_balance",details:{posted:$?.posted??"0",held:$?.held??"0",available:$?.available??"0",requested:_.amount,transfer_fee:R,gas_fallback_fee:T,total_debit:O,gas_display:I&&A?{symbol:I,amount:A,mode:w}:null}}};let k=await e`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'user_transfer',
        ${_.reference??`transfer:${p.symbol}:${Date.now()}`},
        ${e.json({sender_user_id:_.actingUserId,recipient_user_id:m.id,recipient_email:m.email,asset_symbol:p.symbol,amount:_.amount,transfer_fee_amount:R,transfer_fee_bps:y,transfer_fee_bps_base:g,fee_boost:b?{code:b.code,bps:b.bps}:null,gas_fallback_in_asset:T,gas_display_symbol:I,gas_display_amount:A,gas_quote_mode:w,total_debit:O})}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `,U=k[0].id,j=await (0,r.recordInternalChainTx)(e,{entryId:U,type:"user_transfer",userId:_.actingUserId,metadata:{asset_symbol:p.symbol,amount:_.amount,recipient_user_id:m.id,recipient_email:m.email,transfer_fee_bps:y,transfer_fee_bps_base:g,fee_boost:b?{code:b.code,bps:b.bps}:null,discount_pct:0,gas_display_symbol:I,gas_display_amount:A,gas_quote_mode:w}});await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${U}::uuid, ${E}::uuid, ${p.id}::uuid, ((${_.amount}::numeric) * -1)),
        (${U}::uuid, ${h}::uuid, ${p.id}::uuid, (${_.amount}::numeric))
    `;let q=(0,n.add3818)(R,T);if((0,n.toBigInt3818)(q)>0n){await d(e,s),await d(e,i);let[t,r]=await Promise.all([l(e,s,p.id),l(e,i,p.id)]),a=v>0?(0,n.bpsFeeCeil3818)(q,v):"0",o=(0,n.toBigInt3818)(a)>(0,n.toBigInt3818)(q)?q:a,u=(0,n.sub3818NonNegative)(q,o),c=(await e`
        INSERT INTO ex_journal_entry (type, reference, metadata_json)
        VALUES (
          'user_transfer_fee',
          ${`fee:${U}`},
          ${e.json({transfer_entry_id:U,user_id:_.actingUserId,asset_symbol:p.symbol,transfer_fee_amount:R,gas_fallback_in_asset:T,total_fee_in_asset:q,transfer_fee_bps:y,transfer_fee_bps_base:g,fee_boost:b?{code:b.code,bps:b.bps}:null,burn_bps:v,gas_fallback_source:N,gas_display_symbol:I,gas_display_amount:A,gas_quote_mode:w})}::jsonb
        )
        RETURNING id::text AS id
      `)[0].id;(0,n.toBigInt3818)(u)>0n&&(0,n.toBigInt3818)(o)>0n?await e`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${c}::uuid, ${E}::uuid, ${p.id}::uuid, ((${q}::numeric) * -1)),
            (${c}::uuid, ${t}::uuid, ${p.id}::uuid, (${u}::numeric)),
            (${c}::uuid, ${r}::uuid, ${p.id}::uuid, (${o}::numeric))
        `:(0,n.toBigInt3818)(u)>0n?await e`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${c}::uuid, ${E}::uuid, ${p.id}::uuid, ((${q}::numeric) * -1)),
            (${c}::uuid, ${t}::uuid, ${p.id}::uuid, (${u}::numeric))
        `:(0,n.toBigInt3818)(o)>0n&&await e`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            (${c}::uuid, ${E}::uuid, ${p.id}::uuid, ((${q}::numeric) * -1)),
            (${c}::uuid, ${r}::uuid, ${p.id}::uuid, (${o}::numeric))
        `}if(b){let t=Number(b.quantity??0);if(t<=0)return{status:409,body:{error:"insufficient_balance",details:{message:"No fee discount boost available."}}};1===t?await e`
          DELETE FROM arcade_inventory
          WHERE id = ${b.inventory_id}::uuid
        `:await e`
          UPDATE arcade_inventory
          SET quantity = ${t-1}, updated_at = now()
          WHERE id = ${b.inventory_id}::uuid
        `,await (0,a.logArcadeConsumption)(e,{user_id:_.actingUserId,kind:"boost",code:b.code,rarity:null,quantity:1,context_type:"user_transfer",context_id:U,module:"transfer_fee",metadata:{fee_bps_base:g,fee_bps:y,discount_bps:b.bps,transfer_fee_amount:R}})}return{status:201,body:{transfer:{id:U,asset_id:p.id,symbol:p.symbol,chain:p.chain,amount:_.amount,recipient_email:m.email,created_at:k[0].created_at,tx_hash:j.txHash,block_height:j.blockHeight,fees:{transfer_fee_asset_amount:R,gas_fallback_asset_amount:T,gas_charged_in_asset_amount:T,gas_sponsored:"sponsored_unavailable"===N,network_fee_display:{amount:C.enabled?A??"0":"0",symbol:(I??"BNB").trim()||"BNB"},total_debit_asset_amount:O}}}}})}async function c(e,t){let a=t.originalTransferEntryId.trim(),s=`reverse:${a}`;return await e.begin(async e=>{let i=await e`
      SELECT
        e.id::text AS id,
        e.created_at::text AS created_at,
        a.id::text AS asset_id,
        a.symbol AS symbol,
        a.chain AS chain
      FROM ex_journal_entry e
      JOIN ex_journal_line l ON l.entry_id = e.id
      JOIN ex_asset a ON a.id = l.asset_id
      WHERE e.type = 'user_transfer_reversal'
        AND e.reference = ${s}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 1
    `;if(i.length>0){let n=i[0],s=await (0,r.recordInternalChainTx)(e,{entryId:n.id,type:"user_transfer_reversal",userId:t.adminUserId,metadata:{original_transfer_entry_id:a,idempotent:!0}});return{status:200,body:{reversal:{id:n.id,original_transfer_id:a,asset_id:n.asset_id,symbol:n.symbol,chain:n.chain,amount:"0",created_at:n.created_at,tx_hash:s.txHash,block_height:s.blockHeight}}}}let o=await e`
      SELECT
        e.id::text AS id,
        e.type AS type,
        e.created_at::text AS created_at,
        (e.metadata_json->>'amount') AS amount,
        (e.metadata_json->>'sender_user_id') AS sender_user_id,
        (e.metadata_json->>'recipient_user_id') AS recipient_user_id,
        a.id::text AS asset_id,
        a.symbol AS symbol,
        a.chain AS chain,
        max(CASE WHEN l.amount < 0 THEN l.account_id::text END) AS sender_account_id,
        max(CASE WHEN l.amount > 0 THEN l.account_id::text END) AS recipient_account_id
      FROM ex_journal_entry e
      JOIN ex_journal_line l ON l.entry_id = e.id
      JOIN ex_asset a ON a.id = l.asset_id
      WHERE e.id = ${a}::uuid
        AND e.type = 'user_transfer'
      GROUP BY e.id, e.type, e.created_at, e.metadata_json, a.id, a.symbol, a.chain
    `;if(0===o.length)return{status:404,body:{error:"transfer_not_found"}};if(1!==o.length)return{status:409,body:{error:"transfer_not_reversible",details:{reason:"transfer_multi_asset"}}};let u=o[0];if(!u.amount||0n>=(0,n.toBigInt3818)(u.amount))return{status:409,body:{error:"transfer_not_reversible",details:{reason:"missing_amount"}}};if(!u.sender_account_id||!u.recipient_account_id)return{status:409,body:{error:"transfer_not_reversible",details:{reason:"missing_accounts"}}};if((await e`
      SELECT id::text AS id
      FROM ex_journal_entry
      WHERE type = 'user_transfer_reversal'
        AND reference = ${s}
      LIMIT 1
    `).length>0)return{status:409,body:{error:"transfer_already_reversed"}};let d=(await e`
      WITH posted AS (
        SELECT coalesce(sum(amount), 0)::numeric AS posted
        FROM ex_journal_line
        WHERE account_id = ${u.recipient_account_id}::uuid
      ),
      held AS (
        SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
        FROM ex_hold
        WHERE account_id = ${u.recipient_account_id}::uuid AND status = 'active'
      )
      SELECT
        posted.posted::text AS posted,
        held.held::text AS held,
        (posted.posted - held.held)::text AS available,
        ((posted.posted - held.held) >= (${u.amount}::numeric)) AS ok
      FROM posted, held
    `)[0];if(!d||(0,n.toBigInt3818Signed)(d.available)<(0,n.toBigInt3818)(u.amount))return{status:409,body:{error:"recipient_insufficient_balance_for_reversal",details:{available:d?.available??"0",requested:u.amount,posted:d?.posted??"0",held:d?.held??"0"}}};let l=await e`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'user_transfer_reversal',
        ${s},
        ${e.json({original_transfer_entry_id:a,reversed_by_admin_user_id:t.adminUserId,reason:(t.reason??"").trim()||null,amount:u.amount,asset_id:u.asset_id,asset_symbol:u.symbol,chain:u.chain,sender_user_id:u.sender_user_id,recipient_user_id:u.recipient_user_id})}::jsonb
      )
      RETURNING id::text AS id, created_at::text AS created_at
    `,_=l[0].id,c=await (0,r.recordInternalChainTx)(e,{entryId:_,type:"user_transfer_reversal",userId:t.adminUserId,metadata:{original_transfer_entry_id:a,amount:u.amount,symbol:u.symbol,reason:(t.reason??"").trim()||null}});return await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${_}::uuid, ${u.recipient_account_id}::uuid, ${u.asset_id}::uuid, ((${u.amount}::numeric) * -1)),
        (${_}::uuid, ${u.sender_account_id}::uuid, ${u.asset_id}::uuid, (${u.amount}::numeric))
    `,{status:200,body:{reversal:{id:_,original_transfer_id:a,asset_id:u.asset_id,symbol:u.symbol,chain:u.chain,amount:u.amount,created_at:l[0].created_at,tx_hash:c.txHash,block_height:c.blockHeight}}}})}e.s(["requestUserTransfer",()=>_,"reverseUserTransfer",()=>c])},365685,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),s=e.i(561916),i=e.i(174677),o=e.i(869741),u=e.i(316795),d=e.i(487718),l=e.i(995169),_=e.i(47587),c=e.i(666012),p=e.i(570101),f=e.i(626937),m=e.i(10372),E=e.i(193695);e.i(52474);var h=e.i(600220),g=e.i(469719),y=e.i(843793),b=e.i(891454),S=e.i(364608),x=e.i(300959),R=e.i(677702),v=e.i(184883),T=e.i(371276),N=e.i(90878),I=e.i(795374),A=e.i(425686);let w=g.z.object({asset_id:g.z.string().uuid(),amount:R.amount3818PositiveSchema,recipient_email:g.z.string().email(),reference:g.z.string().min(1).max(200).optional(),totp_code:g.z.string().length(6).regex(/^\d{6}$/).optional(),use_fee_boost:g.z.boolean().optional().default(!1)});async function $(e){let t=Date.now(),r=(0,y.getSql)(),a=await (0,b.requireSessionUserId)(r,e);if(!a.ok)return a.response;let n=a.userId;try{let a,s=await (0,S.requireActiveUser)(r,n);if(s)return(0,x.apiError)(s);let i=await e.json().catch(()=>({}));try{a=w.parse(i)}catch(e){return(0,x.apiZodError)(e)??(0,x.apiError)("invalid_input")}let o=await (0,I.enforceTotpIfEnabled)(r,n,a.totp_code);if(o)return o;let u=await (0,A.requestUserTransfer)(r,{actingUserId:n,assetId:a.asset_id,amount:a.amount,recipientEmail:a.recipient_email,reference:a.reference,useFeeBoost:a.use_fee_boost}),d=u.body;if("string"==typeof d.error)return(0,x.apiError)(d.error,{status:u.status,details:d.details});let l=Response.json(u.body,{status:u.status});(0,T.logRouteResponse)(e,l,{startMs:t,userId:n,meta:{transferId:u.body?.transfer?.id}});try{let t=u.body.transfer;t?.id&&await (0,N.writeAuditLog)(r,{actorId:n,actorType:"user",action:"transfer.requested",resourceType:"transfer",resourceId:t.id,...(0,N.auditContextFromRequest)(e),detail:{amount:t.amount,asset_id:t.asset_id,recipient_email:t.recipient_email}})}catch{}return l}catch(t){let e=(0,v.responseForDbError)("exchange.transfers.request",t);if(e)return e;return console.error("exchange.transfers.request failed:",t),(0,x.apiError)("internal_error",{details:{message:t instanceof Error?t.message:String(t)}})}}e.s(["POST",()=>$,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],613456);var C=e.i(613456);let O=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/exchange/transfers/request/route",pathname:"/api/exchange/transfers/request",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/exchange/transfers/request/route.ts",nextConfigOutput:"",userland:C}),{workAsyncStorage:k,workUnitAsyncStorage:U,serverHooks:j}=O;function q(){return(0,a.patchFetch)({workAsyncStorage:k,workUnitAsyncStorage:U})}async function M(e,t,a){O.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/exchange/transfers/request/route";g=g.replace(/\/index$/,"")||"/";let y=await O.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:b,params:S,nextConfig:x,parsedUrl:R,isDraftMode:v,prerenderManifest:T,routerServerContext:N,isOnDemandRevalidate:I,revalidateOnlyGenerated:A,resolvedPathname:w,clientReferenceManifest:$,serverActionsManifest:C}=y,k=(0,o.normalizeAppPath)(g),U=!!(T.dynamicRoutes[k]||T.routes[w]),j=async()=>((null==N?void 0:N.render404)?await N.render404(e,t,R,!1):t.end("This page could not be found"),null);if(U&&!v){let e=!!T.routes[w],t=T.dynamicRoutes[k];if(t&&!1===t.fallback&&!e){if(x.experimental.adapterPath)return await j();throw new E.NoFallbackError}}let q=null;!U||O.isDev||v||(q="/index"===(q=w)?"/":q);let M=!0===O.isDev||!U,L=U&&!M;C&&$&&(0,i.setManifestsSingleton)({page:g,clientReferenceManifest:$,serverActionsManifest:C});let P=e.method||"GET",D=(0,s.getTracer)(),F=D.getActiveScopeSpan(),H={params:S,prerenderManifest:T,renderOpts:{experimental:{authInterrupts:!!x.experimental.authInterrupts},cacheComponents:!!x.cacheComponents,supportsDynamicResponse:M,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:x.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>O.onRequestError(e,t,a,n,N)},sharedContext:{buildId:b}},B=new u.NodeNextRequest(e),W=new u.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(B,(0,d.signalFromNodeResponse)(t));try{let i=async e=>O.handle(V,H).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=D.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==l.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${P} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${P} ${g}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),u=async n=>{var s,u;let d=async({previousCacheEntry:r})=>{try{if(!o&&I&&A&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let s=await i(n);e.fetchMetrics=H.renderOpts.fetchMetrics;let u=H.renderOpts.pendingWaitUntil;u&&a.waitUntil&&(a.waitUntil(u),u=void 0);let d=H.renderOpts.collectedTags;if(!U)return await (0,c.sendResponse)(B,W,s,H.renderOpts.pendingWaitUntil),null;{let e=await s.blob(),t=(0,p.toNodeOutgoingHttpHeaders)(s.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==H.renderOpts.collectedRevalidate&&!(H.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&H.renderOpts.collectedRevalidate,a=void 0===H.renderOpts.collectedExpire||H.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:H.renderOpts.collectedExpire;return{value:{kind:h.CachedRouteKind.APP_ROUTE,status:s.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await O.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:I})},!1,N),t}},l=await O.handleResponse({req:e,nextConfig:x,cacheKey:q,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:T,isRoutePPREnabled:!1,isOnDemandRevalidate:I,revalidateOnlyGenerated:A,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:o});if(!U)return null;if((null==l||null==(s=l.value)?void 0:s.kind)!==h.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==l||null==(u=l.value)?void 0:u.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",I?"REVALIDATED":l.isMiss?"MISS":l.isStale?"STALE":"HIT"),v&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let E=(0,p.fromNodeOutgoingHttpHeaders)(l.value.headers);return o&&U||E.delete(m.NEXT_CACHE_TAGS_HEADER),!l.cacheControl||t.getHeader("Cache-Control")||E.get("Cache-Control")||E.set("Cache-Control",(0,f.getCacheControlHeader)(l.cacheControl)),await (0,c.sendResponse)(B,W,new Response(l.value.body,{headers:E,status:l.value.status||200})),null};F?await u(F):await D.withPropagatedContext(e.headers,()=>D.trace(l.BaseServerSpan.handleRequest,{spanName:`${P} ${g}`,kind:s.SpanKind.SERVER,attributes:{"http.method":P,"http.target":e.url}},u))}catch(t){if(t instanceof E.NoFallbackError||await O.onRequestError(e,t,{routerKind:"App Router",routePath:k,routeType:"route",revalidateReason:(0,_.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:I})},!1,N),U)throw t;return await (0,c.sendResponse)(B,W,new Response(null,{status:500})),null}}e.s(["handler",()=>M,"patchFetch",()=>q,"routeModule",()=>O,"serverHooks",()=>j,"workAsyncStorage",()=>k,"workUnitAsyncStorage",()=>U],365685)},813311,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(429194)))},850875,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_b5e82bad._.js","server/chunks/node_modules_ccxt_js_src_protobuf_mexc_compiled_cjs_a75143f3._.js"].map(t=>e.l(t))).then(()=>t(433054)))},607967,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_91e8f96f._.js","server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_registry_4a78b30a.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(533718)))},552032,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_5a3bd954._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(989929)))},348464,e=>{e.v(t=>Promise.all(["server/chunks/node_modules_ccxt_js_src_static_dependencies_dydx-v4-client_8cedd7e0._.js","server/chunks/node_modules_b5e82bad._.js"].map(t=>e.l(t))).then(()=>t(662700)))}];

//# sourceMappingURL=%5Broot-of-the-server%5D__e0c6bd16._.js.map