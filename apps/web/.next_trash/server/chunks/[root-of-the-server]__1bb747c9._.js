module.exports=[918622,(e,t,r)=>{t.exports=e.x("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js",()=>require("next/dist/compiled/next-server/app-page-turbo.runtime.prod.js"))},556704,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-async-storage.external.js",()=>require("next/dist/server/app-render/work-async-storage.external.js"))},832319,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/work-unit-async-storage.external.js",()=>require("next/dist/server/app-render/work-unit-async-storage.external.js"))},270406,(e,t,r)=>{t.exports=e.x("next/dist/compiled/@opentelemetry/api",()=>require("next/dist/compiled/@opentelemetry/api"))},193695,(e,t,r)=>{t.exports=e.x("next/dist/shared/lib/no-fallback-error.external.js",()=>require("next/dist/shared/lib/no-fallback-error.external.js"))},522734,(e,t,r)=>{t.exports=e.x("fs",()=>require("fs"))},446786,(e,t,r)=>{t.exports=e.x("os",()=>require("os"))},504446,(e,t,r)=>{t.exports=e.x("net",()=>require("net"))},755004,(e,t,r)=>{t.exports=e.x("tls",()=>require("tls"))},254799,(e,t,r)=>{t.exports=e.x("crypto",()=>require("crypto"))},688947,(e,t,r)=>{t.exports=e.x("stream",()=>require("stream"))},60438,(e,t,r)=>{t.exports=e.x("perf_hooks",()=>require("perf_hooks"))},666680,(e,t,r)=>{t.exports=e.x("node:crypto",()=>require("node:crypto"))},691180,e=>{"use strict";var t=e.i(666680);let r="pp_session";function i(e){return e.toString("base64").replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}function n(e,r){return i((0,t.createHmac)("sha256",e).update(r,"utf8").digest())}function o(e){if(!e)return{};let t={};for(let r of e.split(/;\s*/g)){let e=r.indexOf("=");if(e<=0)continue;let i=r.slice(0,e).trim(),n=r.slice(e+1).trim();i&&(t[i]=decodeURIComponent(n))}return t}function a(e){return o(e.headers.get("cookie"))[r]??null}function s(e){let t=Math.floor((e.now??Date.now())/1e3),r="number"==typeof e.ttlSeconds?e.ttlSeconds:604800,o={uid:e.userId,iat:t,exp:t+r,..."number"==typeof e.sessionVersion&&Number.isFinite(e.sessionVersion)?{sv:Math.max(0,Math.trunc(e.sessionVersion))}:{}},a=i(Buffer.from(JSON.stringify(o),"utf8")),s=n(e.secret,a);return`${a}.${s}`}function l(e){let r,i=e.token.trim(),o=i.indexOf(".");if(o<=0)return{ok:!1,error:"session_token_invalid"};let a=i.slice(0,o),s=i.slice(o+1);if(!a||!s)return{ok:!1,error:"session_token_invalid"};let l=n(e.secret,a),p=Buffer.from(s),d=Buffer.from(l);if(p.length!==d.length||!(0,t.timingSafeEqual)(p,d))return{ok:!1,error:"session_token_invalid"};try{let e,t;r=JSON.parse((e=a.length%4,t=(a+(e?"=".repeat(4-e):"")).replace(/-/g,"+").replace(/_/g,"/"),Buffer.from(t,"base64")).toString("utf8"))}catch{return{ok:!1,error:"session_token_invalid"}}if(!r||"object"!=typeof r||"string"!=typeof r.uid||!r.uid||"number"!=typeof r.exp||!Number.isFinite(r.exp))return{ok:!1,error:"session_token_invalid"};if(null!=r.sv){let e=Number(r.sv);if(!Number.isFinite(e)||e<0)return{ok:!1,error:"session_token_invalid"};r.sv=Math.max(0,Math.trunc(e))}let u=Math.floor((e.now??Date.now())/1e3);return r.exp<=u?{ok:!1,error:"session_token_expired"}:{ok:!0,payload:r}}function p(e){let t=[`${r}=${encodeURIComponent(e.token)}`,"Path=/","HttpOnly","SameSite=Lax",`Max-Age=${Math.max(0,Math.floor(e.maxAgeSeconds))}`];return e.secure&&t.push("Secure"),t.join("; ")}function d(e){let t=[`${r}=`,"Path=/","HttpOnly","SameSite=Lax","Max-Age=0"];return e?.secure&&t.push("Secure"),t.join("; ")}e.s(["createSessionToken",()=>s,"getSessionTokenFromRequest",()=>a,"parseCookieHeader",()=>o,"serializeClearSessionCookie",()=>d,"serializeSessionCookie",()=>p,"verifySessionToken",()=>l])},324725,(e,t,r)=>{t.exports=e.x("next/dist/server/app-render/after-task-async-storage.external.js",()=>require("next/dist/server/app-render/after-task-async-storage.external.js"))},224361,(e,t,r)=>{t.exports=e.x("util",()=>require("util"))},814747,(e,t,r)=>{t.exports=e.x("path",()=>require("path"))},406461,(e,t,r)=>{t.exports=e.x("zlib",()=>require("zlib"))},792509,(e,t,r)=>{t.exports=e.x("url",()=>require("url"))},921517,(e,t,r)=>{t.exports=e.x("http",()=>require("http"))},524836,(e,t,r)=>{t.exports=e.x("https",()=>require("https"))},427699,(e,t,r)=>{t.exports=e.x("events",()=>require("events"))},371276,e=>{"use strict";let t=function(){let e=[];for(let t of["SECRET_KEY","PROOFPACK_SESSION_SECRET","PROOFPACK_SESSION_BOOTSTRAP_KEY","PROOFPACK_REVIEWER_KEY","EXCHANGE_ADMIN_KEY","EXCHANGE_CRON_SECRET","CRON_SECRET","RESET_SECRET","ADMIN_RESET_SECRET","INTERNAL_SERVICE_SECRET","DEPLOYER_PRIVATE_KEY","CITADEL_MASTER_SEED","GROQ_API_KEY","GOOGLE_API_KEY","PINATA_JWT","BINANCE_API_KEY","BINANCE_API_SECRET"]){let r=String(process.env[t]??"").trim();r&&r.length>=8&&e.push(r)}return e}();function r(e){let r=e;for(let e of t)e&&r.includes(e)&&(r=r.split(e).join("[REDACTED]"));return r}function i(e,t,i){var n;let o,a=e.headers.get("x-request-id")??"unknown",s=new URL(e.url,"http://localhost");o={...n={requestId:a,method:e.method,path:s.pathname,status:t.status,durationMs:Date.now()-i.startMs,ip:e.headers.get("x-real-ip")??e.headers.get("x-forwarded-for")?.split(",")[0]?.trim()??null,userAgent:e.headers.get("user-agent"),userId:i.userId??null,meta:i.meta,ts:new Date().toISOString()},userAgent:n.userAgent?r(n.userAgent):n.userAgent,meta:n.meta?function e(t,i){if(i>6)return"[TRUNCATED]";if(null==t)return t;if("string"==typeof t)return r(t);if("number"==typeof t||"boolean"==typeof t)return t;if(Array.isArray(t))return t.slice(0,50).map(t=>e(t,i+1));if("object"==typeof t){let r={},n=0;for(let[o,a]of Object.entries(t)){if((n+=1)>80){r.__more__="[TRUNCATED]";break}!function(e){let t=e.toLowerCase();return t.includes("password")||t.includes("secret")||t.includes("token")||t.includes("apikey")||t.includes("api_key")||t.includes("private")||t.includes("seed")||t.includes("jwt")||t.includes("authorization")||t.includes("cookie")}(o)?r[o]=e(a,i+1):r[o]="[REDACTED]"}return r}return String(t)}(n.meta,0):n.meta},process.stdout.write(JSON.stringify(o)+"\n")}e.s(["logRouteResponse",()=>i],371276)},303395,e=>{"use strict";let t=(process.env.EMAIL_BRAND??process.env.EMAIL_FROM_NAME??"Coinwaka").trim()||"Coinwaka",r=(process.env.SUPPORT_EMAIL??"support@coinwaka.com").trim()||"support@coinwaka.com",i="http://localhost:3000".trim(),n=(()=>{try{if(!i)return"";return new URL(i).origin}catch{return""}})(),o=(process.env.EMAIL_LOGO_URL??"").trim(),a=(process.env.EMAIL_LOGO_ALT??t).trim()||t,s=Math.max(60,Math.min(240,parseInt(process.env.EMAIL_LOGO_WIDTH??"120",10)||120));function l(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#39;")}function p(e){let i=new Date().getFullYear(),p=l(e.preheader),d=o?`
      <div style="line-height:0;">
        <img src="${l(o)}" width="${s}" alt="${l(a)}" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:100%;margin:0 auto;" />
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
    ${p}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          <tr>
            <td align="center" style="padding:18px 24px;background-color:#4f46e5;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">
              ${d}
            </td>
          </tr>

          <tr>
            <td style="padding:24px;color:#111827;font-size:14px;line-height:1.6;">
              ${e.bodyHtml}
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;line-height:1.5;" align="center">
              <div>&copy; ${i} ${l(t)}.</div>
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
</html>`}function d(e){let t=e.url,r=l(e.label);return`
  <table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:18px auto;">
    <tr>
      <td bgcolor="#4f46e5" style="border-radius:10px;">
        <a href="${t}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;">${r}</a>
      </td>
    </tr>
  </table>`}function u(e){let r=`Verify your email — ${t}`;return{subject:r,text:`Verify your email address to finish setting up your ${t} account:

${e}

This link expires in 24 hours.

If you didn't create an account, you can ignore this email.`,html:p({preheader:`Verify your email to finish setting up your ${t} account.`,bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Verify your email</h2>
      <p style="margin:0 0 12px;">Thanks for signing up. Click the button below to verify your email address.</p>
      ${d({url:e,label:"Verify email"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 24 hours.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t create an account, you can ignore this email.</p>
    `})}}function c(){return{subject:`KYC Verified — ${t}`,text:"Your identity has been verified. You now have Verified KYC status with increased withdrawal limits ($50,000/day).",html:p({preheader:"Your identity verification is approved.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Identity verified</h2>
      <p style="margin:0 0 8px;">Your identity documents have been reviewed and approved.</p>
      <p style="margin:0;">You now have <strong>Verified</strong> KYC status with a daily withdrawal limit of <strong>$50,000</strong>.</p>
    `})}}function f(e){return{subject:`KYC Review Update — ${t}`,text:`Your identity document submission was not approved.

Reason: ${e}

Please re-submit clearer documents from your account page.`,html:p({preheader:"Your document submission needs an update.",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Document review update</h2>
      <p style="margin:0 0 8px;">Your identity document submission was not approved.</p>
      <div style="background-color:#fef2f2;border:1px solid #fecaca;border-left:4px solid #ef4444;padding:12px 12px;margin:16px 0;border-radius:8px;">
        <div style="font-size:13px;color:#7f1d1d;"><strong>Reason:</strong> ${l(e)}</div>
      </div>
      <p style="margin:0;color:#374151;">Please re-submit clearer documents from your account page.</p>
    `})}}function m(e,r,i){return{subject:`Security Alert — ${t}`,text:`Security event on your account:

Action: ${e}
IP: ${r}
Time: ${i}

If this wasn't you, change your password immediately.`,html:p({preheader:"Security activity detected on your account.",bodyHtml:`
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
          <td style="padding:10px 12px;font-size:13px;color:#111827;">${l(i)}</td>
        </tr>
      </table>
      <p style="margin:14px 0 0;color:#b91c1c;font-size:13px;"><strong>If this wasn’t you</strong>, change your password immediately and enable 2FA.</p>
    `})}}function h(e){let r=`Reset your password — ${t}`;return{subject:r,text:`A password reset was requested for your ${t} account.

Reset your password using this link (expires in 1 hour):
${e}

If you didn't request this, you can ignore this email.`,html:p({preheader:"Reset your password (link expires in 1 hour).",bodyHtml:`
      <h2 style="margin:0 0 12px;font-size:18px;line-height:1.3;color:#111827;">Reset your password</h2>
      <p style="margin:0 0 12px;">A password reset was requested for your account.</p>
      ${d({url:e,label:"Reset password"})}
      <p style="margin:0 0 8px;color:#6b7280;font-size:12px;">This link expires in 1 hour.</p>
      <p style="margin:14px 0 6px;color:#111827;font-weight:600;">If the button doesn’t work, copy and paste this link:</p>
      <p style="margin:0 0 10px;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,'Liberation Mono','Courier New',monospace;font-size:12px;color:#374151;">${l(e)}</p>
      <p style="margin:0;color:#6b7280;font-size:12px;">If you didn’t request this, you can ignore this email.</p>
    `})}}function x(e){let r=`[Ops] ${e.title} — ${t}`,i=(e.statusUrl??"").trim(),n=Array.isArray(e.lines)?e.lines.map(e=>String(e)).filter(Boolean):[];return{subject:r,text:[`${e.summary}`,"",...n.length?["Signals:",...n.map(e=>`- ${e}`)]:[],...i?["",`Status: ${i}`]:[]].join("\n"),html:p({preheader:e.summary,bodyHtml:`
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
      ${i?`
        <p style="margin:10px 0 0;color:#374151;">Open the status page for details:</p>
        ${d({url:i,label:"View status"})}
        <p style="margin:0;color:#6b7280;font-size:12px;word-break:break-all;">${l(i)}</p>
      `:""}
    `})}}e.s(["kycApprovedEmail",()=>c,"kycRejectedEmail",()=>f,"opsAlertEmail",()=>x,"passwordResetEmail",()=>h,"securityAlertEmail",()=>m,"verificationEmail",()=>u])},449507,e=>{"use strict";var t=e.i(666680);function r(e,r){return new Promise((i,n)=>{(0,t.scrypt)(e,r,64,{N:16384,r:8,p:1},(e,t)=>{e?n(e):i(t)})})}async function i(e){let i=(0,t.randomBytes)(32),n=await r(e,i);return`${i.toString("hex")}:${n.toString("hex")}`}async function n(e,i){let[n,o]=i.split(":");if(!n||!o)return!1;let a=Buffer.from(n,"hex"),s=Buffer.from(o,"hex"),l=await r(e,a);return l.length===s.length&&(0,t.timingSafeEqual)(l,s)}e.s(["hashPassword",()=>i,"verifyPassword",()=>n])},944273,e=>{"use strict";var t=e.i(666680);async function r(e,r){let i=(0,t.randomBytes)(32).toString("hex"),n=new Date(Date.now()+864e5);return await e`
    INSERT INTO email_verification_token (user_id, token, expires_at)
    VALUES (${r}::uuid, ${i}, ${n.toISOString()}::timestamptz)
  `,i}async function i(e,t){let r=await e`
    SELECT id, user_id::text AS user_id, expires_at, used_at
    FROM email_verification_token
    WHERE token = ${t}
    LIMIT 1
  `;if(0===r.length)return null;let i=r[0];return i.used_at||new Date(i.expires_at).getTime()<Date.now()?null:(await e`
    UPDATE email_verification_token
    SET used_at = now()
    WHERE id = ${i.id}::uuid
  `,await e`
    UPDATE app_user
    SET email_verified = true, updated_at = now()
    WHERE id = ${i.user_id}::uuid
  `,{userId:i.user_id})}e.s(["consumeVerificationToken",()=>i,"createVerificationToken",()=>r])},972394,e=>{"use strict";var t=e.i(747909),r=e.i(174017),i=e.i(996250),n=e.i(759756),o=e.i(561916),a=e.i(174677),s=e.i(869741),l=e.i(316795),p=e.i(487718),d=e.i(995169),u=e.i(47587),c=e.i(666012),f=e.i(570101),m=e.i(626937),h=e.i(10372),x=e.i(193695);e.i(52474);var g=e.i(600220),y=e.i(469719),w=e.i(89171),E=e.i(843793),b=e.i(449507),v=e.i(691180),R=e.i(944273),_=e.i(909815),S=e.i(303395),k=e.i(371276);let A=y.z.object({email:y.z.string().email().max(255),password:y.z.string().min(8).max(128),displayName:y.z.string().min(2).max(60).optional(),country:y.z.string().trim().min(2).max(2),acceptTerms:y.z.literal(!0),acceptRisk:y.z.literal(!0)});async function $(e){let t,r=Date.now(),i=await e.json().catch(()=>({}));try{t=A.parse(i)}catch{return w.NextResponse.json({error:"Invalid input. Email required, password min 8 chars."},{status:400})}let n=(0,E.getSql)(),o=t.email.toLowerCase().trim();if((await n`
    SELECT id FROM app_user WHERE email = ${o} LIMIT 1
  `).length>0)return w.NextResponse.json({error:"email_taken"},{status:409});let a=await (0,b.hashPassword)(t.password),s=t.country.toUpperCase(),[l]=await n`
    INSERT INTO app_user (email, password_hash, display_name, status, kyc_level, country)
    VALUES (${o}, ${a}, ${t.displayName??null}, 'active', 'none', ${s})
    RETURNING id, email, display_name, status, created_at
  `,p=process.env.PROOFPACK_SESSION_SECRET??"";if(!p)return w.NextResponse.json({error:"Server misconfigured"},{status:500});let d=null;try{if(d=await (0,R.createVerificationToken)(n,l.id)){let t=e.headers.get("origin")??"http://localhost:3000"??"http://localhost:3010",r=`${t}/verify-email?token=${d}`,i=(0,S.verificationEmail)(r);(await (0,_.sendMail)({to:o,subject:i.subject,text:i.text,html:i.html})).demo}}catch(e){console.error("[signup] Failed to send verification email:",e instanceof Error?e.message:e)}let u=(0,v.createSessionToken)({userId:l.id,secret:p,ttlSeconds:604800,sessionVersion:0}),c=new w.NextResponse(JSON.stringify({ok:!0,user:{id:l.id,email:l.email,displayName:l.display_name},verifyUrl:null}),{status:201,headers:{"content-type":"application/json","set-cookie":(0,v.serializeSessionCookie)({token:u,maxAgeSeconds:604800,secure:!0})}});return(0,k.logRouteResponse)(e,c,{startMs:r,userId:l.id}),c}e.s(["POST",()=>$,"runtime",0,"nodejs"],462843);var C=e.i(462843);let T=new t.AppRouteRouteModule({definition:{kind:r.RouteKind.APP_ROUTE,page:"/api/auth/signup/route",pathname:"/api/auth/signup",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/auth/signup/route.ts",nextConfigOutput:"",userland:C}),{workAsyncStorage:I,workUnitAsyncStorage:N,serverHooks:O}=T;function M(){return(0,i.patchFetch)({workAsyncStorage:I,workUnitAsyncStorage:N})}async function P(e,t,i){T.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let y="/api/auth/signup/route";y=y.replace(/\/index$/,"")||"/";let w=await T.prepare(e,t,{srcPage:y,multiZoneDraftMode:!1});if(!w)return t.statusCode=400,t.end("Bad Request"),null==i.waitUntil||i.waitUntil.call(i,Promise.resolve()),null;let{buildId:E,params:b,nextConfig:v,parsedUrl:R,isDraftMode:_,prerenderManifest:S,routerServerContext:k,isOnDemandRevalidate:A,revalidateOnlyGenerated:$,resolvedPathname:C,clientReferenceManifest:I,serverActionsManifest:N}=w,O=(0,s.normalizeAppPath)(y),M=!!(S.dynamicRoutes[O]||S.routes[C]),P=async()=>((null==k?void 0:k.render404)?await k.render404(e,t,R,!1):t.end("This page could not be found"),null);if(M&&!_){let e=!!S.routes[C],t=S.dynamicRoutes[O];if(t&&!1===t.fallback&&!e){if(v.experimental.adapterPath)return await P();throw new x.NoFallbackError}}let q=null;!M||T.isDev||_||(q="/index"===(q=C)?"/":q);let z=!0===T.isDev||!M,j=M&&!z;N&&I&&(0,a.setManifestsSingleton)({page:y,clientReferenceManifest:I,serverActionsManifest:N});let D=e.method||"GET",H=(0,o.getTracer)(),L=H.getActiveScopeSpan(),U={params:b,prerenderManifest:S,renderOpts:{experimental:{authInterrupts:!!v.experimental.authInterrupts},cacheComponents:!!v.cacheComponents,supportsDynamicResponse:z,incrementalCache:(0,n.getRequestMeta)(e,"incrementalCache"),cacheLifeProfiles:v.cacheLife,waitUntil:i.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,r,i,n)=>T.onRequestError(e,t,i,n,k)},sharedContext:{buildId:E}},F=new l.NodeNextRequest(e),K=new l.NodeNextResponse(t),V=p.NextRequestAdapter.fromNodeNextRequest(F,(0,p.signalFromNodeResponse)(t));try{let a=async e=>T.handle(V,U).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let r=H.getRootSpanAttributes();if(!r)return;if(r.get("next.span_type")!==d.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${r.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let i=r.get("next.route");if(i){let t=`${D} ${i}`;e.setAttributes({"next.route":i,"http.route":i,"next.span_name":t}),e.updateName(t)}else e.updateName(`${D} ${y}`)}),s=!!(0,n.getRequestMeta)(e,"minimalMode"),l=async n=>{var o,l;let p=async({previousCacheEntry:r})=>{try{if(!s&&A&&$&&!r)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let o=await a(n);e.fetchMetrics=U.renderOpts.fetchMetrics;let l=U.renderOpts.pendingWaitUntil;l&&i.waitUntil&&(i.waitUntil(l),l=void 0);let p=U.renderOpts.collectedTags;if(!M)return await (0,c.sendResponse)(F,K,o,U.renderOpts.pendingWaitUntil),null;{let e=await o.blob(),t=(0,f.toNodeOutgoingHttpHeaders)(o.headers);p&&(t[h.NEXT_CACHE_TAGS_HEADER]=p),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let r=void 0!==U.renderOpts.collectedRevalidate&&!(U.renderOpts.collectedRevalidate>=h.INFINITE_CACHE)&&U.renderOpts.collectedRevalidate,i=void 0===U.renderOpts.collectedExpire||U.renderOpts.collectedExpire>=h.INFINITE_CACHE?void 0:U.renderOpts.collectedExpire;return{value:{kind:g.CachedRouteKind.APP_ROUTE,status:o.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:r,expire:i}}}}catch(t){throw(null==r?void 0:r.isStale)&&await T.onRequestError(e,t,{routerKind:"App Router",routePath:y,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:A})},!1,k),t}},d=await T.handleResponse({req:e,nextConfig:v,cacheKey:q,routeKind:r.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:$,responseGenerator:p,waitUntil:i.waitUntil,isMinimalMode:s});if(!M)return null;if((null==d||null==(o=d.value)?void 0:o.kind)!==g.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(l=d.value)?void 0:l.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});s||t.setHeader("x-nextjs-cache",A?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),_&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let x=(0,f.fromNodeOutgoingHttpHeaders)(d.value.headers);return s&&M||x.delete(h.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||x.get("Cache-Control")||x.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,c.sendResponse)(F,K,new Response(d.value.body,{headers:x,status:d.value.status||200})),null};L?await l(L):await H.withPropagatedContext(e.headers,()=>H.trace(d.BaseServerSpan.handleRequest,{spanName:`${D} ${y}`,kind:o.SpanKind.SERVER,attributes:{"http.method":D,"http.target":e.url}},l))}catch(t){if(t instanceof x.NoFallbackError||await T.onRequestError(e,t,{routerKind:"App Router",routePath:O,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:j,isOnDemandRevalidate:A})},!1,k),M)throw t;return await (0,c.sendResponse)(F,K,new Response(null,{status:500})),null}}e.s(["handler",()=>P,"patchFetch",()=>M,"routeModule",()=>T,"serverHooks",()=>O,"workAsyncStorage",()=>I,"workUnitAsyncStorage",()=>N],972394)}];

//# sourceMappingURL=%5Broot-of-the-server%5D__1bb747c9._.js.map