module.exports=[437274,e=>{"use strict";var i=e.i(469719),t=e.i(666680),r=e.i(300959),a=e.i(364608),d=e.i(891454),n=e.i(315569),u=e.i(843793),s=e.i(184883),_=e.i(371276),l=e.i(677702),o=e.i(630862);function c(e){var i;let{taker:t}=e,r=e.maxFills??200,a=e.makers.filter(e=>e.side!==t.side).filter(e=>!(0,o.isZeroOrLess3818)(e.remaining_quantity)).slice().sort((i=t.side,(e,t)=>{if("buy"===i){let i=(0,o.cmp3818)(e.price,t.price);if(0!==i)return i}else{let i=(0,o.cmp3818)(t.price,e.price);if(0!==i)return i}return e.created_at<t.created_at?-1:e.created_at>t.created_at?1:e.id<t.id?-1:+(e.id>t.id)})),d=t.remaining_quantity,n=new Map;for(let e of a)n.set(e.id,e.remaining_quantity);let u=[];for(let e=0;e<a.length&&u.length<r&&!(0,o.isZeroOrLess3818)(d);e++){let i=a[e],r=n.get(i.id)??"0";if((0,o.isZeroOrLess3818)(r))continue;if(!function(e,i,t){let r=(0,o.cmp3818)(t,i);return"buy"===e?r<=0:r>=0}(t.side,t.price,i.price))break;let s=(0,o.min3818)(d,r);if((0,o.isZeroOrLess3818)(s))break;u.push({maker_order_id:i.id,taker_order_id:t.id,price:i.price,quantity:s}),d=(0,o.sub3818NonNegative)(d,s);let _=(0,o.sub3818NonNegative)(r,s);n.set(i.id,_)}return{fills:u,taker_remaining_quantity:d,maker_remaining_by_id:Object.fromEntries(n.entries())}}function m(e,i,t,r="0"){return"sell"===e?i:(0,o.add3818)(t,r)}var E=e.i(939249),p=e.i(361179),y=e.i(90878),N=e.i(194748),g=e.i(784756),S=e.i(430848),b=e.i(831075);let A=i.z.enum(["buy","sell"]),f=i.z.enum(["GTC","IOC","FOK"]),$=i.z.enum(["none","cancel_newest","cancel_oldest","cancel_both"]),T=i.z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9:_\-\.]+$/),q=i.z.discriminatedUnion("type",[i.z.object({market_id:i.z.string().uuid(),side:A,type:i.z.literal("limit"),price:l.amount3818PositiveSchema,quantity:l.amount3818PositiveSchema,iceberg_display_quantity:l.amount3818PositiveSchema.optional(),time_in_force:f.optional().default("GTC"),post_only:i.z.boolean().optional().default(!1),stp_mode:$.optional().default("none"),reduce_only:i.z.boolean().optional().default(!1),idempotency_key:T.optional()}),i.z.object({market_id:i.z.string().uuid(),side:A,type:i.z.literal("market"),quantity:l.amount3818PositiveSchema,stp_mode:$.optional().default("none"),reduce_only:i.z.boolean().optional().default(!1),idempotency_key:T.optional()})]);function D(e){let i=String(process.env[e]??"").trim();if(!i)return null;let t=Number(i);if(!Number.isFinite(t))return null;let r=Math.trunc(t);return r>0?r:null}async function R(e){let t=Date.now(),l=(0,u.getSql)(),o=null,c=(i,r)=>{try{(0,_.logRouteResponse)(e,i,{startMs:t,userId:o,meta:r})}catch{}return i},m=await (0,d.requireSessionUserId)(l,e);if(!m.ok)return c(m.response,{code:"unauthorized"});o=m.userId;let E=await (0,s.retryOnceOnTransientDbError)(()=>(0,n.resolveReadOnlyUserScope)(l,e,o));if(!E.ok)return c((0,r.apiError)(E.error,{status:403}),{code:E.error});let p=E.scope.userId;try{let t=await (0,a.requireActiveUser)(l,p);if(t)return c((0,r.apiError)(t),{code:t});let d=new URL(e.url).searchParams.get("market_id");if(d&&!i.z.string().uuid().safeParse(d).success)return c((0,r.apiError)("invalid_market_id"),{code:"invalid_market_id"});let n=await (0,s.retryOnceOnTransientDbError)(async()=>await l`
        SELECT
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          iceberg_display_quantity::text AS iceberg_display_quantity,
          iceberg_hidden_remaining::text AS iceberg_hidden_remaining,
          status,
          hold_id,
          created_at,
          updated_at
        FROM ex_order
        WHERE user_id = ${p}
          AND (${d??null}::uuid IS NULL OR market_id = ${d??null}::uuid)
        ORDER BY created_at DESC
        LIMIT 100
      `);return c(Response.json({user_id:p,orders:n}),E.scope.impersonating?{impersonate_user_id:p}:void 0)}catch(i){let e=(0,s.responseForDbError)("exchange.orders.list",i);if(e)return c(e,{code:"db_error"});throw i}}async function h(e){let i=Date.now(),n=(0,u.getSql)(),l=null,A=(t,r)=>{try{(0,_.logRouteResponse)(e,t,{startMs:i,userId:l,meta:r})}catch{}return t},f=await (0,d.requireSessionUserId)(n,e);if(!f.ok)return A(f.response,{code:"unauthorized"});l=f.userId;try{let i,d=await (0,a.requireActiveUser)(n,l);if(d)return A((0,r.apiError)(d),{code:d});let u=Number(String(process.env.EXCHANGE_PLACE_MAX_PER_MIN??"").trim()||"0");if(Number.isFinite(u)&&u>0)try{let e=(0,b.createPgRateLimiter)(n,{name:"exchange-place",windowMs:6e4,max:Math.trunc(u)});if(!(await e.consume(`u:${l}`)).allowed)return A((0,r.apiError)("rate_limit_exceeded",{status:429}),{code:"rate_limit_exceeded"})}catch{}let s=await e.json().catch(()=>({}));try{i=q.parse(s)}catch(e){return A((0,r.apiZodError)(e)??(0,r.apiError)("invalid_input"),{code:"invalid_input"})}let _="exchange.orders.place",f=(e.headers.get("x-idempotency-key")?.trim()||null)??i.idempotency_key??null,$="limit"===i.type?{market_id:i.market_id,side:i.side,type:i.type,price:i.price,quantity:i.quantity,iceberg_display_quantity:i.iceberg_display_quantity??null,time_in_force:i.time_in_force,post_only:i.post_only,stp_mode:i.stp_mode,reduce_only:i.reduce_only}:{market_id:i.market_id,side:i.side,type:i.type,quantity:i.quantity,stp_mode:i.stp_mode,reduce_only:i.reduce_only},T=f?(0,t.createHash)("sha256").update(JSON.stringify($)).digest("hex"):null,R=await n.begin(async e=>{let t;if(f&&T){let i=(await e`
          SELECT request_hash, response_json, status_code
          FROM app_idempotency_key
          WHERE user_id = ${l}::uuid
            AND scope = ${_}
            AND idem_key = ${f}
          LIMIT 1
          FOR UPDATE
        `)[0]??null;if(i){if(i.request_hash!==T)return{status:409,body:{error:"idempotency_key_conflict"}};if(null!=i.status_code&&null!=i.response_json)return{status:i.status_code,body:i.response_json}}else await e`
            INSERT INTO app_idempotency_key (user_id, scope, idem_key, request_hash)
            VALUES (${l}::uuid, ${_}, ${f}, ${T})
          `}let r=await (0,S.chargeGasFee)(e,{userId:l,action:"place_order",reference:i.market_id});if(r)return{status:409,body:{error:r.code,details:r.details}};let a=async(i,t)=>{if(!t)return;let r=await e`
          SELECT status
          FROM ex_order
          WHERE id = ${i}::uuid
          LIMIT 1
        `,a=r[0]?.status;if("filled"!==a&&"canceled"!==a)return;let d=(await e`
          SELECT remaining_amount::text AS remaining_amount, status
          FROM ex_hold
          WHERE id = ${t}::uuid
          LIMIT 1
          FOR UPDATE
        `)[0];if(d&&"active"===d.status){if((0,o.isZeroOrLess3818)(d.remaining_amount))return void await e`
            UPDATE ex_hold
            SET remaining_amount = 0, status = 'consumed'
            WHERE id = ${t}::uuid AND status = 'active'
          `;await e`
          UPDATE ex_hold
          SET status = 'released', released_at = now()
          WHERE id = ${t}::uuid AND status = 'active'
        `}};await e`SELECT pg_advisory_xact_lock(hashtext(${i.market_id}::text))`;let d=await e`
        SELECT
          id,
          chain,
          symbol,
          base_asset_id,
          quote_asset_id,
          status,
          halt_until::text AS halt_until,
          tick_size::text AS tick_size,
          lot_size::text AS lot_size,
          maker_fee_bps,
          taker_fee_bps
        FROM ex_market
        WHERE id = ${i.market_id}
        LIMIT 1
      `;if(0===d.length)return{status:404,body:{error:"market_not_found"}};let n=d[0];if("enabled"!==n.status)return{status:409,body:{error:"market_disabled"}};if(n.halt_until){let e=Date.parse(n.halt_until);if(Number.isFinite(e)&&e>Date.now())return{status:409,body:{error:"market_halted",details:{halt_until:n.halt_until}}}}let u=D("EXCHANGE_MAX_OPEN_ORDERS_PER_USER");if(u){let i=await e`
          SELECT count(*)::int AS n
          FROM ex_order
          WHERE user_id = ${l}::uuid
            AND status IN ('open','partially_filled')
        `;if((i[0]?.n??0)>=u)return{status:409,body:{error:"open_orders_limit"}}}let s=function(e){let i=String(process.env[e]??"").trim();if(!i)return null;let t=Number(i);return Number.isFinite(t)&&t>0?t:null}("EXCHANGE_MAX_ORDER_NOTIONAL");if(s){let t=null;if("limit"===i.type){let e=Number(i.price);t=Number.isFinite(e)&&e>0?e:null}else{let r=(await e`
            SELECT
              (
                SELECT e.price::text
                FROM ex_execution e
                WHERE e.market_id = ${n.id}::uuid
                ORDER BY e.created_at DESC
                LIMIT 1
              ) AS last_exec_price,
              (
                SELECT o.price::text
                FROM ex_order o
                WHERE o.market_id = ${n.id}::uuid
                  AND o.side = 'buy'
                  AND o.status IN ('open','partially_filled')
                  AND o.user_id <> ${l}::uuid
                ORDER BY o.price DESC, o.created_at ASC
                LIMIT 1
              ) AS bid,
              (
                SELECT o.price::text
                FROM ex_order o
                WHERE o.market_id = ${n.id}::uuid
                  AND o.side = 'sell'
                  AND o.status IN ('open','partially_filled')
                  AND o.user_id <> ${l}::uuid
                ORDER BY o.price ASC, o.created_at ASC
                LIMIT 1
              ) AS ask
          `)[0],a=r?.ask!=null?Number(r.ask):NaN,d=r?.bid!=null?Number(r.bid):NaN,u=r?.last_exec_price!=null?Number(r.last_exec_price):NaN;t="buy"===i.side?Number.isFinite(a)&&a>0?a:Number.isFinite(u)&&u>0?u:Number.isFinite(d)&&d>0?d:null:Number.isFinite(d)&&d>0?d:Number.isFinite(u)&&u>0?u:Number.isFinite(a)&&a>0?a:null}let r=Number(i.quantity);if(t&&Number.isFinite(r)&&r>0){let e=t*r;if(Number.isFinite(e)&&e>s)return{status:409,body:{error:"order_notional_too_large",details:{max:s}}}}}let y=D("EXCHANGE_PRICE_BAND_BPS");if(y&&"limit"===i.type){let t=(await e`
          SELECT
            (
              SELECT e.price::text
              FROM ex_execution e
              WHERE e.market_id = ${n.id}::uuid
              ORDER BY e.created_at DESC
              LIMIT 1
            ) AS last_exec_price,
            (
              SELECT o.price::text
              FROM ex_order o
              WHERE o.market_id = ${n.id}::uuid
                AND o.side = 'buy'
                AND o.status IN ('open','partially_filled')
              ORDER BY o.price DESC, o.created_at ASC
              LIMIT 1
            ) AS bid,
            (
              SELECT o.price::text
              FROM ex_order o
              WHERE o.market_id = ${n.id}::uuid
                AND o.side = 'sell'
                AND o.status IN ('open','partially_filled')
              ORDER BY o.price ASC, o.created_at ASC
              LIMIT 1
            ) AS ask
        `)[0],r=t?.last_exec_price!=null?Number(t.last_exec_price):NaN,a=t?.bid!=null?Number(t.bid):NaN,d=t?.ask!=null?Number(t.ask):NaN,u=Number.isFinite(a)&&a>0&&Number.isFinite(d)&&d>0?(a+d)/2:NaN,s=Number.isFinite(r)&&r>0?r:Number.isFinite(u)&&u>0?u:null,_=Number(i.price);if(s&&Number.isFinite(_)&&_>0){let i=1e4*Math.abs((_-s)/s);if(Number.isFinite(i)&&i>y){let i=D("EXCHANGE_CIRCUIT_BREAKER_SECONDS");return i&&await e`
                UPDATE ex_market
                SET halt_until = GREATEST(
                  COALESCE(halt_until, now()),
                  now() + make_interval(secs => ${i})
                )
                WHERE id = ${n.id}::uuid
              `,{status:409,body:{error:"exchange_price_out_of_band",details:{reference_price:String(s),band_bps:y,min_price:String(s*(1-y/1e4)),max_price:String(s*(1+y/1e4))}}}}}}let g="market"===i.type,b="limit"===i.type?i.time_in_force:"IOC",A="limit"===i.type&&i.post_only,$="limit"===i.type?i.price:"0",q="limit"===i.type?i.iceberg_display_quantity:void 0,R=null!=q?String(q):null;if(null!=q&&"limit"!==i.type)return{status:400,body:{error:"iceberg_limit_only"}};if(null!=q){if("GTC"!==b)return{status:400,body:{error:"iceberg_gtc_only"}};if(!(0,E.isMultipleOfStep3818)(String(q),n.lot_size))return{status:400,body:{error:"iceberg_display_not_multiple_of_lot",details:{lot_size:n.lot_size}}};let e=(0,o.toBigInt3818)(String(q)),t=(0,o.toBigInt3818)(String(i.quantity));if(e<=0n||e>=t)return{status:400,body:{error:"iceberg_display_must_be_lt_total"}}}let h=i.stp_mode;if(h&&"none"!==h){let t="buy"===i.side?"sell":"buy",r=await e`
          SELECT id::text AS id, hold_id::text AS hold_id
          FROM ex_order
          WHERE market_id = ${n.id}::uuid
            AND user_id = ${l}::uuid
            AND side = ${t}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND (
              ${g}::boolean = true
              OR (${i.side} = 'buy' AND price <= (${$}::numeric))
              OR (${i.side} = 'sell' AND price >= (${$}::numeric))
            )
          ORDER BY
            CASE WHEN ${i.side} = 'buy' THEN price END ASC,
            CASE WHEN ${i.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
          FOR UPDATE
        `;if(r.length>0){if("cancel_oldest"===h||"cancel_both"===h)for(let i of r)await e`
                UPDATE ex_order
                SET status = 'canceled', updated_at = now()
                WHERE id = ${i.id}::uuid
                  AND user_id = ${l}::uuid
                  AND status IN ('open','partially_filled')
              `,await a(i.id,i.hold_id);if("cancel_newest"===h)return{status:409,body:{error:"stp_cancel_newest",details:{crossing_orders:r.length}}};if("cancel_both"===h)return{status:409,body:{error:"stp_cancel_both",details:{crossing_orders:r.length}}}}}if("limit"===i.type&&!(0,E.isMultipleOfStep3818)(i.price,n.tick_size))return{status:400,body:{error:"price_not_multiple_of_tick",details:{tick_size:n.tick_size}}};if(!(0,E.isMultipleOfStep3818)(i.quantity,n.lot_size))return{status:400,body:{error:"quantity_not_multiple_of_lot",details:{lot_size:n.lot_size}}};let I="buy"===i.side?n.quote_asset_id:n.base_asset_id,x=Math.max(n.maker_fee_bps??0,n.taker_fee_bps??0);if(!g&&(A||"FOK"===b)){let t="buy"===i.side?"sell":"buy",r=await e`
          SELECT id::text AS id, price::text AS price, remaining_quantity::text AS remaining_quantity, created_at::text AS created_at
          FROM ex_order
          WHERE market_id = ${n.id}::uuid
            AND side = ${t}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND user_id <> ${l}::uuid
            AND (
              (${i.side} = 'buy' AND price <= (${$}::numeric))
              OR (${i.side} = 'sell' AND price >= (${$}::numeric))
            )
          ORDER BY
            CASE WHEN ${i.side} = 'buy' THEN price END ASC,
            CASE WHEN ${i.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
        `;if(A&&r.length>0)return{status:409,body:{error:"post_only_would_take"}};if("FOK"===b){let e=c({taker:{id:"00000000-0000-0000-0000-000000000000",side:i.side,price:$,remaining_quantity:i.quantity,created_at:new Date().toISOString()},makers:r.map(e=>({id:e.id,side:t,price:e.price,remaining_quantity:e.remaining_quantity,created_at:e.created_at})),maxFills:200});if(!(0,o.isZeroOrLess3818)(e.taker_remaining_quantity))return{status:409,body:{error:"fok_insufficient_liquidity"}}}}if(g&&"buy"===i.side){let r=await e`
          SELECT price::text AS price, remaining_quantity::text AS remaining_quantity
          FROM ex_order
          WHERE market_id = ${n.id}::uuid
            AND side = 'sell'
            AND status IN ('open', 'partially_filled')
            AND user_id <> ${l}::uuid
            AND remaining_quantity > 0
          ORDER BY price ASC, created_at ASC
          LIMIT 200
        `,a=function(e,i,t){let r=e,a=0n;for(let e of i){if((0,o.isZeroOrLess3818)(r))break;let i=(0,o.min3818)(r,e.remaining_quantity);a+=(0,o.toBigInt3818)((0,o.mul3818Ceil)(i,e.price)),r=(0,o.sub3818NonNegative)(r,i)}if(!(0,o.isZeroOrLess3818)(r))return null;let d=(0,o.fromBigInt3818)(a),n=(0,o.bpsFeeCeil3818)(d,t?.maxFeeBps??0),u=(0,o.bpsFeeCeil3818)(d,100);return(0,o.add3818)((0,o.add3818)(d,n),u)}(i.quantity,r,{maxFeeBps:x});if(!a)return{status:409,body:{error:"insufficient_liquidity",details:{available_asks:r.length}}};t=a}else t=g?i.quantity:function(e,i,t,r){if("buy"!==e)return t;let a=(0,o.mul3818Ceil)(i,t),d=r?.maxFeeBps??0,n=(0,o.bpsFeeCeil3818)(a,d);return(0,o.add3818)(a,n)}(i.side,$,i.quantity,{maxFeeBps:x});let L=(await e`
        INSERT INTO ex_ledger_account (user_id, asset_id)
        VALUES (${l}, ${I}::uuid)
        ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
        RETURNING id
      `)[0].id,O=(await e`
        WITH posted AS (
          SELECT coalesce(sum(amount), 0)::numeric AS posted
          FROM ex_journal_line
          WHERE account_id = ${L}
        ),
        held AS (
          SELECT coalesce(sum(remaining_amount), 0)::numeric AS held
          FROM ex_hold
          WHERE account_id = ${L} AND status = 'active'
        )
        SELECT
          posted.posted::text AS posted,
          held.held::text AS held,
          (posted.posted - held.held)::text AS available,
          ((posted.posted - held.held) >= (${t}::numeric)) AS ok
        FROM posted, held
      `)[0];if(!O?.ok)return{status:409,body:{error:"insufficient_balance",details:{posted:O?.posted??"0",held:O?.held??"0",available:O?.available??"0",requested:t}}};let k=(await e`
        INSERT INTO ex_order (
          market_id,
          user_id,
          side,
          type,
          price,
          quantity,
          remaining_quantity,
          iceberg_display_quantity,
          iceberg_hidden_remaining,
          status
        )
        VALUES (
          ${n.id}::uuid,
          ${l}::uuid,
          ${i.side},
          ${i.type},
          (${$}::numeric),
          (${i.quantity}::numeric),
          (
            CASE
              WHEN ${R}::numeric IS NULL THEN (${i.quantity}::numeric)
              ELSE (${R}::numeric)
            END
          ),
          (${R}::numeric),
          (
            CASE
              WHEN ${R}::numeric IS NULL THEN 0
              ELSE greatest((${i.quantity}::numeric) - (${R}::numeric), 0)
            END
          ),
          'open'
        )
        RETURNING
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id,
          created_at,
          updated_at
      `)[0],C=(await e`
        INSERT INTO ex_hold (account_id, asset_id, amount, remaining_amount, reason)
        VALUES (${L}, ${I}::uuid, (${t}::numeric), (${t}::numeric), ${`order:${k.id}`})
        RETURNING id, amount::text AS amount, remaining_amount::text AS remaining_amount, status, created_at
      `)[0].id,w=(await e`
        UPDATE ex_order
        SET hold_id = ${C}::uuid, updated_at = now()
        WHERE id = ${k.id}::uuid
        RETURNING
          id,
          market_id,
          user_id,
          side,
          type,
          price::text AS price,
          quantity::text AS quantity,
          remaining_quantity::text AS remaining_quantity,
          status,
          hold_id,
          created_at,
          updated_at
      `)[0],H=[],F="buy"===w.side?"sell":"buy",U=[],M=0;for(;M<200;){let i=await e`
          SELECT remaining_quantity::text AS remaining, status
          FROM ex_order
          WHERE id = ${w.id}::uuid
          LIMIT 1
        `,t=i[0]?.remaining??"0",r=i[0]?.status??w.status;if("filled"===r||(0,o.isZeroOrLess3818)(t))break;let d=await e`
          SELECT
            id,
            user_id,
            side,
            price::text AS price,
            remaining_quantity::text AS remaining_quantity,
            iceberg_display_quantity::text AS iceberg_display_quantity,
            iceberg_hidden_remaining::text AS iceberg_hidden_remaining,
            hold_id,
            created_at
          FROM ex_order
          WHERE market_id = ${n.id}::uuid
            AND side = ${F}
            AND status IN ('open','partially_filled')
            AND remaining_quantity > 0
            AND id <> ${w.id}::uuid
            AND user_id <> ${w.user_id}::uuid
            AND (
              ${g}::boolean = true
              OR (${w.side} = 'buy' AND price <= (${w.price}::numeric))
              OR (${w.side} = 'sell' AND price >= (${w.price}::numeric))
            )
          ORDER BY
            CASE WHEN ${w.side} = 'buy' THEN price END ASC,
            CASE WHEN ${w.side} = 'sell' THEN price END DESC,
            created_at ASC
          LIMIT 200
          FOR UPDATE
        `,u=new Map(d.map(e=>[e.id,e])),s=(g?function(e){let i="buy"===e.taker.side?"999999999999999999.000000000000000000":"0.000000000000000001";return c({taker:{...e.taker,price:i},makers:e.makers,maxFills:e.maxFills})}({taker:{id:w.id,side:w.side,remaining_quantity:t,created_at:w.created_at},makers:d.map(e=>({id:e.id,side:e.side,price:e.price,remaining_quantity:e.remaining_quantity,created_at:e.created_at})),maxFills:1}):c({taker:{id:w.id,side:w.side,price:w.price,remaining_quantity:t,created_at:w.created_at},makers:d.map(e=>({id:e.id,side:e.side,price:e.price,remaining_quantity:e.remaining_quantity,created_at:e.created_at})),maxFills:1})).fills[0]??null;if(!s)break;let _=u.get(s.maker_order_id);if(!_)break;let l=s.quantity;if((0,o.isZeroOrLess3818)(l))continue;let E=s.price,p=(0,o.mul3818Round)(l,E),y=(0,o.bpsFeeCeil3818)(p,n.maker_fee_bps??0),N=(0,o.bpsFeeCeil3818)(p,n.taker_fee_bps??0),S="buy"===w.side?w.user_id:_.user_id,b="sell"===w.side?w.user_id:_.user_id,A=await e`
          WITH upserts AS (
            INSERT INTO ex_ledger_account (user_id, asset_id)
            VALUES
              (${S}::uuid, ${n.base_asset_id}::uuid),
              (${S}::uuid, ${n.quote_asset_id}::uuid),
              (${b}::uuid, ${n.base_asset_id}::uuid),
              (${b}::uuid, ${n.quote_asset_id}::uuid)
            ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING user_id, asset_id, id
          )
          SELECT user_id::text AS user_id, asset_id::text AS asset_id, id::text AS id FROM upserts
        `,f=(e,i)=>A.find(t=>t.user_id===e&&t.asset_id===i)?.id,$=f(S,n.base_asset_id),T=f(S,n.quote_asset_id),q=f(b,n.base_asset_id),D=f(b,n.quote_asset_id);if(!$||!T||!q||!D)return{status:500,body:{error:"not_found",details:"missing_accounts"}};let R=f(_.user_id,n.quote_asset_id),h=f(w.user_id,n.quote_asset_id);if(!R||!h)return{status:500,body:{error:"not_found",details:"missing_accounts_maker_taker"}};let I=await e`
          INSERT INTO ex_ledger_account (user_id, asset_id)
          VALUES (${"00000000-0000-0000-0000-000000000001"}::uuid, ${n.quote_asset_id}::uuid)
          ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
          RETURNING id
        `,x=I[0]?.id;if(!x)return{status:500,body:{error:"not_found",details:"missing_fee_collector_account"}};let L=await e`
          INSERT INTO ex_execution (market_id, price, quantity, maker_order_id, taker_order_id, maker_fee_quote, taker_fee_quote)
          VALUES (
            ${n.id}::uuid,
            (${E}::numeric),
            (${l}::numeric),
            ${_.id}::uuid,
            ${w.id}::uuid,
            (${y}::numeric),
            (${N}::numeric)
          )
          RETURNING id, created_at
        `;H.push({id:L[0].id,price:E,quantity:l,maker_order_id:_.id,taker_order_id:w.id,created_at:L[0].created_at});let O=(await e`
          INSERT INTO ex_journal_entry (type, reference, metadata_json)
          VALUES (
            'trade',
            ${`${n.symbol} ${l}@${E}`},
            ${{market_id:n.id,maker_order_id:_.id,taker_order_id:w.id}}::jsonb
          )
          RETURNING id
        `)[0].id;await e`
          INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
          VALUES
            -- base: buyer +qty, seller -qty
            (${O}::uuid, ${$}::uuid, ${n.base_asset_id}::uuid, (${l}::numeric)),
            (${O}::uuid, ${q}::uuid, ${n.base_asset_id}::uuid, ((${l}::numeric) * -1)),
            -- quote: buyer -q, seller +q
            (${O}::uuid, ${T}::uuid, ${n.quote_asset_id}::uuid, ((${p}::numeric) * -1)),
            (${O}::uuid, ${D}::uuid, ${n.quote_asset_id}::uuid, (${p}::numeric))
        `;let k=[];if((0,o.isZeroOrLess3818)(y)||k.push({accountId:R,amountSigned:`-${y}`}),(0,o.isZeroOrLess3818)(N)||k.push({accountId:h,amountSigned:`-${N}`}),k.length>0){for(let i of k)await e`
              INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
              VALUES (${O}::uuid, ${i.accountId}::uuid, ${n.quote_asset_id}::uuid, (${i.amountSigned}::numeric))
            `;let i=0n;(0,o.isZeroOrLess3818)(y)||(i+=(0,o.toBigInt3818)(y)),(0,o.isZeroOrLess3818)(N)||(i+=(0,o.toBigInt3818)(N));let t=(0,o.fromBigInt3818)(i);await e`
            INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
            VALUES (${O}::uuid, ${x}::uuid, ${n.quote_asset_id}::uuid, (${t}::numeric))
          `}await e`
          UPDATE ex_order
          SET
            remaining_quantity = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN LEAST(iceberg_display_quantity, iceberg_hidden_remaining)
              ELSE remaining_quantity - (${l}::numeric)
            END,
            iceberg_hidden_remaining = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN GREATEST(iceberg_hidden_remaining - LEAST(iceberg_display_quantity, iceberg_hidden_remaining), 0)
              ELSE iceberg_hidden_remaining
            END,
            created_at = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN now()
              ELSE created_at
            END,
            status = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN 'partially_filled'
              WHEN (remaining_quantity - (${l}::numeric)) <= 0 THEN 'filled'
              ELSE 'partially_filled'
            END,
            updated_at = now()
          WHERE id = ${_.id}::uuid
        `;let C=(await e`
          SELECT remaining_quantity::text AS remaining, iceberg_hidden_remaining::text AS hidden, status
          FROM ex_order
          WHERE id = ${_.id}::uuid
          LIMIT 1
        `)[0],W=C?.status==="filled"||!!C&&(0,o.isZeroOrLess3818)(C.remaining)&&(0,o.isZeroOrLess3818)(C.hidden);U.push({userId:_.user_id,orderId:_.id,side:_.side,fillQty:l,price:E,isFilled:W}),await e`
          UPDATE ex_order
          SET
            remaining_quantity = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN LEAST(iceberg_display_quantity, iceberg_hidden_remaining)
              ELSE remaining_quantity - (${l}::numeric)
            END,
            iceberg_hidden_remaining = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN GREATEST(iceberg_hidden_remaining - LEAST(iceberg_display_quantity, iceberg_hidden_remaining), 0)
              ELSE iceberg_hidden_remaining
            END,
            created_at = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN now()
              ELSE created_at
            END,
            status = CASE
              WHEN (remaining_quantity - (${l}::numeric)) <= 0
                AND iceberg_hidden_remaining > 0
                AND iceberg_display_quantity IS NOT NULL
              THEN 'partially_filled'
              WHEN (remaining_quantity - (${l}::numeric)) <= 0 THEN 'filled'
              ELSE 'partially_filled'
            END,
            updated_at = now()
          WHERE id = ${w.id}::uuid
        `;let P=m(_.side,l,p,y),v=m(w.side,l,p,N);_.hold_id&&await e`
            UPDATE ex_hold
            SET
              remaining_amount = greatest(remaining_amount - (${P}::numeric), 0),
              status = CASE
                WHEN (remaining_amount - (${P}::numeric)) <= 0 THEN 'consumed'
                ELSE status
              END
            WHERE id = ${_.hold_id}::uuid AND status = 'active'
          `,w.hold_id&&await e`
            UPDATE ex_hold
            SET
              remaining_amount = greatest(remaining_amount - (${v}::numeric), 0),
              status = CASE
                WHEN (remaining_amount - (${v}::numeric)) <= 0 THEN 'consumed'
                ELSE status
              END
            WHERE id = ${w.hold_id}::uuid AND status = 'active'
          `,await a(_.id,_.hold_id),await a(w.id,w.hold_id),w=(await e`
          SELECT
            id,
            market_id,
            user_id,
            side,
            type,
            price::text AS price,
            quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status,
            hold_id,
            created_at,
            updated_at
          FROM ex_order
          WHERE id = ${w.id}::uuid
          LIMIT 1
        `)[0],M+=1}for(let i of(await a(w.id,w.hold_id),g&&!(0,o.isZeroOrLess3818)(w.remaining_quantity)&&"filled"!==w.status&&(await e`
          UPDATE ex_order
          SET status = 'canceled', updated_at = now()
          WHERE id = ${w.id}::uuid
            AND status IN ('open', 'partially_filled')
        `,await a(w.id,w.hold_id),w=(await e`
          SELECT
            id, market_id, user_id, side, type,
            price::text AS price, quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status, hold_id, created_at, updated_at
          FROM ex_order WHERE id = ${w.id}::uuid LIMIT 1
        `)[0]),g||"IOC"!==b||(0,o.isZeroOrLess3818)(w.remaining_quantity)||"filled"===w.status||(await e`
          UPDATE ex_order
          SET status = 'canceled', updated_at = now()
          WHERE id = ${w.id}::uuid
            AND status IN ('open', 'partially_filled')
        `,await a(w.id,w.hold_id),w=(await e`
          SELECT
            id, market_id, user_id, side, type,
            price::text AS price, quantity::text AS quantity,
            remaining_quantity::text AS remaining_quantity,
            status, hold_id, created_at, updated_at
          FROM ex_order WHERE id = ${w.id}::uuid LIMIT 1
        `)[0]),U))await (0,N.createNotification)(e,{userId:i.userId,type:i.isFilled?"order_filled":"order_partially_filled",title:i.isFilled?"Order Filled":"Order Partially Filled",body:`Your ${i.side} order was ${i.isFilled?"fully":"partially"} filled: ${i.fillQty} @ ${i.price} on ${n.symbol}`,metadata:{orderId:i.orderId,fillQty:i.fillQty,price:i.price,market:n.symbol}});if(H.length>0||"canceled"===w.status){let i="filled"===w.status?"order_filled":"canceled"===w.status?"order_canceled":"order_partially_filled",t="filled"===w.status?"Order Filled":"canceled"===w.status?g?"Market Order Canceled (IOC)":"Limit Order Canceled (IOC)":"Order Partially Filled";await (0,N.createNotification)(e,{userId:w.user_id,type:i,title:t,body:`Your ${w.side} ${w.type} order on ${n.symbol} — ${H.length} fill(s)`,metadata:{orderId:w.id,market:n.symbol,fills:H.length}})}return 0===H.length&&("open"===w.status||"partially_filled"===w.status)&&await (0,N.createNotification)(e,{userId:w.user_id,type:"order_placed",title:"Order Placed",body:`Your ${w.side} ${w.type} order was placed on ${n.symbol}.`,metadata:{orderId:w.id,market:n.symbol}}),await (0,p.enqueueOutbox)(e,{topic:"ex.order.placed",aggregate_type:"order",aggregate_id:w.id,payload:{order:w,executions:H}}),f&&await e`
          UPDATE app_idempotency_key
          SET response_json = ${e.json({order:w,executions:H})}::jsonb,
              status_code = 201,
              updated_at = now()
          WHERE user_id = ${l}::uuid
            AND scope = ${_}
            AND idem_key = ${f}
            AND request_hash = ${T}
        `,{status:201,body:{order:w,executions:H}}}),h=R.body;if("string"==typeof h.error){if(f)try{await n`
            DELETE FROM app_idempotency_key
            WHERE user_id = ${l}::uuid
              AND scope = ${_}
              AND idem_key = ${f}
              AND status_code IS NULL
          `}catch{}try{if(new Set(["insufficient_balance","insufficient_liquidity","post_only_would_take","fok_insufficient_liquidity","open_orders_limit","order_notional_too_large","exchange_price_out_of_band","market_halted","stp_cancel_newest","stp_cancel_both"]).has(h.error)){let e=s?.market_id??null,i=s?.side??null,t=s?.type??null;await (0,N.createNotification)(n,{userId:l,type:"order_rejected",title:"Order Rejected",body:`Your order was rejected (${h.error}).`,metadata:{reason:h.error,market_id:e,side:i,type:t}})}}catch{}return A((0,r.apiError)(h.error,{status:R.status,details:h.details}),{code:h.error})}let I=A(Response.json(R.body,{status:R.status}),{orderId:R.body?.order?.id});try{let i=R.body?.order;i?.id&&(await (0,y.writeAuditLog)(n,{actorId:l,actorType:"user",action:"order.placed",resourceType:"order",resourceId:i.id,...(0,y.auditContextFromRequest)(e),detail:{side:i.side,price:i.price,quantity:i.quantity,market_id:i.market_id}}),(0,g.propagateLeaderOrder)(n,{leaderUserId:l,marketId:i.market_id,side:i.side,type:i.type,price:i.price,quantity:i.quantity}).catch(e=>console.error("Copy trading propagation failed:",e)))}catch{}return I}catch(i){let e=(0,s.responseForDbError)("exchange.orders.place",i);if(e)return A(e,{code:"db_error"});throw i}}e.s(["GET",()=>R,"POST",()=>h,"dynamic",0,"force-dynamic","runtime",0,"nodejs"],437274)}];

//# sourceMappingURL=src_app_api_exchange_orders_route_ts_a9c1ba05._.js.map