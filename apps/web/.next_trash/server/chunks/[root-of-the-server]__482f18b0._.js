module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},300959,e=>{"use strict";var t=e.i(915874);function r(e,t){let r=t?.status??function(e){switch(e){case"missing_x_user_id":case"missing_user_id":case"reviewer_key_invalid":case"session_bootstrap_key_invalid":case"admin_key_invalid":case"session_token_expired":return 401;case"not_party":case"opened_by_not_party":case"x_user_id_mismatch":case"actor_not_allowed":case"withdrawal_address_not_allowlisted":case"email_not_verified":case"kyc_required_for_asset":case"withdrawal_requires_kyc":case"withdrawal_allowlist_cooldown":case"totp_setup_required":case"stepup_required":case"user_not_active":case"buyer_not_active":case"seller_not_active":case"p2p_country_not_supported":case"arcade_key_required":case"gas_disabled":case"cannot_trade_own_ad":return 403;case"not_found":case"recipient_not_found":case"trade_not_found":case"dispute_not_found":case"user_not_found":case"market_not_found":case"order_not_found":case"ad_not_found":case"transfer_not_found":return 404;case"trade_not_disputable":case"trade_not_disputed":case"trade_not_resolvable":case"dispute_not_open":case"dispute_already_exists":case"dispute_transition_not_allowed":case"trade_transition_not_allowed":case"trade_not_cancelable":case"trade_state_conflict":case"insufficient_balance":case"recipient_inactive":case"recipient_same_as_sender":case"transfer_not_reversible":case"transfer_already_reversed":case"recipient_insufficient_balance_for_reversal":case"seller_insufficient_funds":case"insufficient_liquidity_on_ad":case"seller_payment_details_missing":case"order_state_conflict":case"market_disabled":case"withdrawal_risk_blocked":case"ad_is_not_online":case"p2p_open_orders_limit":case"post_only_would_take":case"fok_insufficient_liquidity":case"idempotency_key_conflict":case"open_orders_limit":case"order_notional_too_large":case"exchange_price_out_of_band":case"market_halted":case"stp_cancel_newest":case"stp_cancel_both":case"passkey_not_configured":case"insufficient_gas":return 409;case"gas_asset_not_found":case"gas_fee_invalid":case"reviewer_key_not_configured":case"session_secret_not_configured":case"session_bootstrap_not_configured":case"admin_key_not_configured":case"internal_error":return 500;case"rate_limit_exceeded":case"p2p_order_create_cooldown":return 429;case"invalid_input":case"price_not_multiple_of_tick":case"quantity_not_multiple_of_lot":case"unsupported_version":case"missing_file":case"invalid_metadata_json":case"buyer_not_found":case"seller_not_found":case"seller_payment_method_required":case"invalid_seller_payment_method":case"webauthn_verification_failed":default:return 400;case"upstream_unavailable":return 503}}(e),a={error:e};"string"==typeof t?.details?(a.message=t.details,a.details=t.details):"object"==typeof t?.details&&t?.details!==null&&(a.details=t.details,"message"in t.details&&(a.message=t.details.message));let n=t?.headers?new Headers(t.headers):new Headers;return"upstream_unavailable"!==e||n.has("Retry-After")||n.set("Retry-After","3"),Response.json(a,{status:r,headers:n})}function a(e){return e instanceof t.ZodError?r("invalid_input",{status:400,details:e.issues}):null}function n(e,t){return r("upstream_unavailable",{status:503,details:e,headers:"number"==typeof t?.retryAfterSeconds?{"Retry-After":String(Math.max(0,Math.floor(t.retryAfterSeconds)))}:void 0})}e.s(["apiError",()=>r,"apiUpstreamUnavailable",()=>n,"apiZodError",()=>a])},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let r=String(process.env[t]??"").trim();r&&r.length>=8&&e.push(r)}return e}();function r(e){let r=e;for(let e of t)e&&r.includes(e)&&(r=r.split(e).join("[REDACTED]"));return r}function a(e,t,a){var n;let i,s=e.headers.get("x-request-id")??"unknown",o=new URL(e.url,"http://localhost");i={...n={requestId:s,method:e.method,path:o.pathname,status:t.status,durationMs:Date.now()-a.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:a.userId??null,meta:a.meta,ts:new Date().toISOString()},userAgent:n.userAgent?r(n.userAgent):n.userAgent,meta:n.meta?function e(t,a){if(a>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return r(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,a+1));if("object"==typeof t){let r={},n=0;for(let[i,s]of Object.entries(t)){if((n+=1)>80){r.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(i)?r[i]=e(s,a+1):r[i]="[REDACTED]"}return r}return String(t)}(n.meta,0):n.meta},process.stdout.write(JSON.stringify(i)+"\n")}e.s(["logRouteResponse",()=>a],371276)},831075,e=>{"use strict";function t(e,t){let{name:r}=t,a=t.windowMs??6e4,n=t.max??60;return{consume:async function(t){let i=(await e`
      INSERT INTO rate_limit_bucket (name, key, tokens, window_ms, max_tokens, window_start)
      VALUES (${r}, ${t}, ${n-1}, ${a}, ${n}, now())
      ON CONFLICT (name, key)
      DO UPDATE SET
        tokens = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN ${n-1}
          ELSE GREATEST(rate_limit_bucket.tokens - 1, -1)
        END,
        window_start = CASE
          WHEN rate_limit_bucket.window_start
               + make_interval(secs => rate_limit_bucket.window_ms / 1000.0) < now()
          THEN now()
          ELSE rate_limit_bucket.window_start
        END,
        window_ms   = ${a},
        max_tokens  = ${n}
      RETURNING
        tokens,
        (extract(epoch FROM window_start) * 1000)::bigint AS window_start_ms
    `)[0],s=Number(i.window_start_ms)+a,o=Math.max(0,i.tokens);return{allowed:i.tokens>=0,remaining:o,resetMs:s,limit:n}},name:r}}e.s(["createPgRateLimiter",()=>t])},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",a="http://localhost:3000".trim(),n=(()=>{try{if(!a)return"";return new URL(a).origin}catch{return""}})(),i=(process.env.EMAIL_LOGO_URL??"").trim(),s=(process.env.EMAIL_LOGO_ALT??t).trim()||t,o=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function d(e){let a=new Date().getFullYear(),d=l(e.preheader),c=i?`
      <div style="line-height:0;">
        <img src="${l(i)}" width="${o}" alt="${l(s)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
      </div>
      <div style="margin-top:10px;font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${l(t)}</div>
    `:`${l(t)}`;return`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
  <title>${l(t)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <!-- Preheader (hidden) -->
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    ${d}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:18px 24px;background-color:#4f46e5;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">
              ${c}
            </td>
          </tr>

          <tr>
            <td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
              ${e.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;" align="center">
              <div>&copy; ${a} ${l(t)}.</div>
              ${n?`<div style="margin-top:6px;">Website: <a href="${l(n)}" style="color:#4f46e5;text-decoration:none;">${l(n)}</a></div>`:""}
              <div style="margin-top:6px;">Support: <a href="mailto:${l(r)}" style="color:#4f46e5;text-decoration:none;">${l(r)}</a></div>
              <div style="margin-top:10px;color:#9ca3af;font-size:11px;">You’re receiving this email because an account action was requested for your email address.</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`}function c(e){let t=e.url,r=l(e.label);return`
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
    <tr>
      <td bgcolor="#4f46e5" style="border-radius:10px;">
        <a href="${t}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${r}</a>
      </td>
    </tr>
  </table>`}function p(e){let r=`Verify your email — ${t}`;return{subject:r,text:`Verify your email address to finish setting up your ${t} account:

${e}

This link expires in 24 hours.

If you didn't create an account, you can ignore this email.`,html:d({preheader:`Verify your email to finish setting up your ${t} account.`,bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Verify your email</h2>
      <p style="margin:0 0 12px;">Thanks for signing up. Click the button below to verify your email address.</p>
      ${c({url:e,label:"Verify email"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 24 hours.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t create an account, you can ignore this email.</p>
    `})}}function u(){return{subject:`KYC Verified — ${t}`,text:"Your identity has been verified. You now have Verified KYC status with increased withdrawal limits ($50,000/day).",html:d({preheader:"Your identity verification is approved.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Identity verified</h2>
      <p style="margin:0 0 8px;">Your identity documents have been reviewed and approved.</p>
      <p style="margin:0;">You now have <strong>Verified</strong> KYC status with a daily withdrawal limit of <strong>$50,000</strong>.</p>
    `})}}function _(e){return{subject:`KYC Review Update — ${t}`,text:`Your identity document submission was not approved.

Reason: ${e}

Please re-submit clearer documents from your account page.`,html:d({preheader:"Your document submission needs an update.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Document review update</h2>
      <p style="margin:0 0 8px;">Your identity document submission was not approved.</p>
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:12px 12px;margin:16px 0;border-radius:8px;">
        <div style="font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${l(e)}</div>
      </div>
      <p style="margin:0;color:#374151;">Please re-submit clearer documents from your account page.</p>
    `})}}function f(e,r,a){return{subject:`Security Alert — ${t}`,text:`Security event on your account:

Action: ${e}
IP: ${r}
Time: ${a}

If this wasn't you, change your password immediately.`,html:d({preheader:"Security activity detected on your account.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Security alert</h2>
      <p style="margin:0 0 12px;">A security event was detected on your account:</p>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Action</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(e)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">IP</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;">${l(r)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;width:110px;">Time</td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(a)}</td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#b91c1c;font-size:13px;"><strong>If this wasn’t you</strong>, change your password immediately and enable 2FA.</p>
    `})}}function m(e){let r=`Reset your password — ${t}`;return{subject:r,text:`A password reset was requested for your ${t} account.

Reset your password using this link (expires in 1 hour):
${e}

If you didn't request this, you can ignore this email.`,html:d({preheader:"Reset your password (link expires in 1 hour).",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Reset your password</h2>
      <p style="margin:0 0 12px;">A password reset was requested for your account.</p>
      ${c({url:e,label:"Reset password"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 1 hour.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t request this, you can ignore this email.</p>
    `})}}function h(e){let r=`[Ops] ${e.title} — ${t}`,a=(e.statusUrl??"").trim(),n=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...n.length?["Signals:",...n.map(e=>`- ${e}`)]:[],...a?["",`Status: ${a}`]:[]].join("\n"),html:d({preheader:e.summary,bodyHtml:`
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.3;color:#111827;">${l(e.title)}</h2>
      <p style="margin:0 0 12px;color:#374151;">${l(e.summary)}</p>
      ${n.length?`
        <div style="background-color:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #f97316;padding:12px 12px;margin:14px 0;border-radius:8px;">
          <div style="font-size:12px;color:#7c2d12;font-weight:700;margin-bottom:6px;">Signals</div>
          <ul style="margin:0;padding-left:18px;color:#7c2d12;font-size:12px;line-height:1.5;">
            ${n.map(e=>`<li>${l(e)}</li>`).join("\n")}
          </ul>
        </div>
      `:""}
      ${a?`
        <p style="margin:10px 0 0;color:#374151;">Open the status page for details:</p>
        ${c({url:a,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(a)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>u,"kycRejectedEmail",()=>_,"opsAlertEmail",()=>h,"passwordResetEmail",()=>m,"securityAlertEmail",()=>f,"verificationEmail",()=>p])},864946,e=>{"use strict";var t=e.i(666680);function r(e){var r;return r=`${e}.${String(process.env.PROOFPACK_SESSION_SECRET??process.env.SECRET_KEY??"")}`,(0,t.createHash)("sha256").update(r,"utf8").digest("hex")}async function a(e,a){let n=(0,t.randomBytes)(32).toString("hex"),i=r(n),s=new Date(Date.now()+36e5),o=a.requestIp?String(a.requestIp).slice(0,200):null;return await e`
    INSERT INTO app_password_reset_token (user_id, token_hash, expires_at, request_ip)
    VALUES (${a.userId}::uuid, ${i}, ${s.toISOString()}::timestamptz, ${o})
  `,n}async function n(e,a){let n=r(a),i=(await e`
    SELECT id, user_id::text AS user_id, token_hash, expires_at, used_at
    FROM app_password_reset_token
    WHERE token_hash = ${n}
    LIMIT 1
  `)[0];if(!i||i.used_at||new Date(i.expires_at).getTime()<Date.now())return null;try{let e=Buffer.from(String(i.token_hash),"utf8"),r=Buffer.from(String(n),"utf8");if(e.length!==r.length||!(0,t.timingSafeEqual)(e,r))return null}catch{return null}return await e`
    UPDATE app_password_reset_token
    SET used_at = now()
    WHERE id = ${i.id}::uuid
  `,{userId:i.user_id}}e.s(["consumePasswordResetToken",()=>n,"createPasswordResetToken",()=>a])},923248,e=>{"use strict";var t=e.i(747909),r=e.i(174017),a=e.i(996250),n=e.i(759756),i=e.i(561916),s=e.i(174677),o=e.i(869741),l=e.i(316795),d=e.i(487718),c=e.i(995169),p=e.i(47587),u=e.i(666012),_=e.i(570101),f=e.i(626937),m=e.i(10372),h=e.i(193695);e.i(52474);var x=e.i(600220),g=e.i(469719),y=e.i(89171),w=e.i(300959),b=e.i(843793),E=e.i(831075),v=e.i(864946),R=e.i(909815),k=e.i(303395),A=e.i(371276);let S=g.z.object({email:g.z.string().email().max(255)});async function $(e){let t,r=Date.now(),a=(0,b.getSql)(),n=await e.json().catch(()=>({})),i=S.safeParse(n);if(!i.success)return(0,w.apiZodError)(i.error)??(0,w.apiError)("invalid_input");let s=i.data.email.trim().toLowerCase(),o=(t=e.headers.get("x-forwarded-for")??"",(t.split(",")[0]?.trim()||e.headers.get("x-real-ip")?.trim()||"unknown").slice(0,120));try{let t=(0,E.createPgRateLimiter)(a,{name:"auth.pwreset.ip",windowMs:6e5,max:20}),n=(0,E.createPgRateLimiter)(a,{name:"auth.pwreset.email",windowMs:36e5,max:8}),i=await t.consume(o),l=await n.consume(s);if(!i.allowed||!l.allowed){let t=y.NextResponse.json({ok:!0});return(0,A.logRouteResponse)(e,t,{startMs:r}),t}}catch{}let l=null,d=null;try{let e=await a`
      SELECT id::text AS id, email_verified
      FROM app_user
      WHERE email = ${s}
      LIMIT 1
    `;e.length>0&&(d=e[0].id,l=await (0,v.createPasswordResetToken)(a,{userId:d,requestIp:o}))}catch{}let c=null;try{if(l){let t=e.headers.get("origin")??"http://localhost:3000"??"http://localhost:3000";c=`${t}/reset-password?token=${l}`;let r=(0,k.passwordResetEmail)(c);(await (0,R.sendMail)({to:s,subject:r.subject,text:r.text,html:r.html})).demo}}catch(e){console.error("[password-reset] send failed:",e instanceof Error?e.message:e)}let p=y.NextResponse.json({ok:!0,resetUrl:null});return(0,A.logRouteResponse)(e,p,{startMs:r,userId:d??void 0}),p}e.s(["POST",()=>$,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],885292);var C=e.i(885292);let T=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/auth/password-reset/request/route",pathname:"/api/auth/password-reset/request",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/auth/password-reset/request/route.ts",nextConfigOutput:"",userland:C}),{workAsyncStorage:I,workUnitAsyncStorage:N,serverHooks:O}=T;function q(){return(0,a.patchFetch)({workAsyncStorage:I,workUnitAsyncStorage:N})}async function P(e,t,a){T.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let g="/api/auth/password-reset/request/route";g=g.replace(/\/index$/,"")||"/";let y=await T.prepare(e,t,{srcPage:g,multiZoneDraftMode:!1});if(!y)return t.statusCode=400,t.end("Bad Request"),null==a.waitUntil||a.waitUntil.call(a,Promise.resolve()),null;let{buildId:w,params:b,nextConfig:E,parsedUrl:v,isDraftMode:R,prerenderManifest:k,routerServerContext:A,isOnDemandRevalidate:S,revalidateOnlyGenerated:$,resolvedPathname:C,clientReferenceManifest:I,serverActionsManifest:N}=y,O=(0,o.normalizeAppPath)(g),q=!!(k.dynamicRoutes[O]||k.routes[C]),P=async()=>((null==A?void 0:A.render404)?await A.render404(e,t,v,!1):t.end("This page could not be found"),null);if(q&&!R){let e=!!k.routes[C],t=k.dynamicRoutes[O];if(t&&!1===t.fallback&&!e){if(E.experimental.adapterPath)return await P();throw new h.NoFallbackError}}let M=null;!q||T.isDev||R||(M="/index"===(M=C)?"/":M);let D=!0===T.isDev||!q,L=q&&!D;N&&I&&(0,s.setManifestsSingleton)({page:g,clientReferenceManifest:I,serverActionsManifest:N});let j=e.method||"GET",z=(0,i.getTracer)(),H=z.getActiveScopeSpan(),U={params:b,prerenderManifest:k,renderOpts:{experimental:{authInterrupts:!!E.experimental.authInterrupts},cacheComponents:!!E.cacheComponents,supportsDynamicResponse:D,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:E.cacheLife,waitUntil:a.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,a,n)=>T.onRequestError(e,t,a,n,A)},sharedContext:{buildId:w}},K=new l.NodeNextRequest(e),Y=new l.NodeNextResponse(t),F=d.NextRequestAdapter.fromNodeNextRequest(K,(0,d.signalFromNodeResponse)(t));try{let s=async e=>T.handle(F,U).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=z.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let a=r.get("next.route");if(a){let t=`${j} ${a}`;e.setAttributes({"next.route":a,"http.route":a,"next.span_name":t}),e.updateName(t)}else e.updateName(`${j} ${g}`)}),o=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var i,l;let d=async({previousCacheEntry:r})=>{try{if(!o&&S&&$&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await s(n);e.fetchMetrics=U.renderOpts.fetchMetrics;let l=U.renderOpts.pendingWaitUntil;l&&a.waitUntil&&(a.waitUntil(l),l=void 0);let d=U.renderOpts.collectedTags;if(!q)return await (0,u.sendResponse)(K,Y,i,U.renderOpts.pendingWaitUntil),null;{let e=await i.blob(),t=(0,_.toNodeOutgoingHttpHeaders)(i.headers);d&&(t[m.NEXT_CACHE_TAGS_HEADER]=d),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==U.renderOpts.collectedRevalidate&&!(U.renderOpts.collectedRevalidate>=m.INFINITE_CACHE)&&U.renderOpts.collectedRevalidate,a=void 0===U.renderOpts.collectedExpire||U.renderOpts.collectedExpire>=m.INFINITE_CACHE?void 0:U.renderOpts.collectedExpire;return{value:{kind:x.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:a}}}}catch(t){throw(null==r?void 0:r.isStale)&&await T.onRequestError(e,t,{routerKind:"App Router",routePath:g,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:S})},!1,A),t}},c=await T.handleResponse({req:e,nextConfig:E,cacheKey:M,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:k,isRoutePPREnabled:!1,isOnDemandRevalidate:S,revalidateOnlyGenerated:$,responseGenerator:d,waitUntil:a.waitUntil,isMinimalMode:o});if(!q)return null;if((null==c||null==(i=c.value)?void 0:i.kind)!==x.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==c||null==(l=c.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});o||t.setHeader("x-nextjs-cache",S?"REVALIDATED":c.isMiss?"MISS":c.isStale?"STALE":"HIT"),R&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let h=(0,_.fromNodeOutgoingHttpHeaders)(c.value.headers);return o&&q||h.delete(m.NEXT_CACHE_TAGS_HEADER),!c.cacheControl||t.getHeader("Cache-Control")||h.get("Cache-Control")||h.set("Cache-Control",(0,f.getCacheControlHeader)(c.cacheControl)),await (0,u.sendResponse)(K,Y,new Response(c.value.body,{headers:h,status:c.value.status||200})),null};H?await l(H):await z.withPropagatedContext(e.headers,()=>z.trace(c.BaseServerSpan.handleRequest,{spanName:`${j} ${g}`,kind:i.SpanKind.SERVER,attributes:{"http.method":j,"http.target":e.url}},l))}catch(t){if(t instanceof h.NoFallbackError||await T.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,p.getRevalidateReason)({isStaticGeneration:L,isOnDemandRevalidate:S})},!1,A),q)throw t;return await (0,u.sendResponse)(K,Y,new Response(null,{status:500})),null}}e.s(["handler",()=>P,"patchFetch",()=>q,"routeModule",()=>T,"serverHooks",()=>O,"workAsyncStorage",()=>I,"workUnitAsyncStorage",()=>N],923248)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__482f18b0._.js.map