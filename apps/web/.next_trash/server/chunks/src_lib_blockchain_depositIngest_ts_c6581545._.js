module.exports=[569442,e=>{"use strict";var t=e.i(56778),a=e.i(901323),s=e.i(194748);let i="00000000-0000-0000-0000-000000000001",r=null;async function n(e){if(r)return r;let t=(await e`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'status'
      ) AS has_status,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'credited_at'
      ) AS has_credited_at,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'ex_chain_deposit_event'
          AND column_name = 'confirmed_at'
      ) AS has_confirmed_at
  `)[0];return r={hasStatus:!!t?.has_status,hasCreditedAt:!!t?.has_credited_at,hasConfirmedAt:!!t?.has_confirmed_at}}function o(e,t){let a=Number((process.env[e]??"").trim());return Number.isFinite(a)?Math.trunc(a):t}function d(e,t,a){return Math.max(t,Math.min(a,e))}function l(e,t){let a=Math.max(1,Math.floor(t)),s=[];for(let t=0;t<e.length;t+=a)s.push(e.slice(t,t+a));return s}function c(e){return new Promise(t=>setTimeout(t,Math.max(0,Math.floor(e))))}function u(e){let t=(e instanceof Error?e.message:String(e)).toLowerCase();return t.includes("rate limit")||t.includes("triggered rate limit")||t.includes("-32005")}function _(e){let t=(e instanceof Error?e.message:String(e)).toLowerCase();return t.includes("invalid params")&&(t.includes("variadic")||t.includes("array type")||t.includes("invalid variadic"))}async function m(e,t,a){let s=d(a?.maxDepth??12,4,24),i=async(a,r,n)=>{try{return await f(e,{...t,fromBlock:a,toBlock:r},{maxAttempts:6,baseDelayMs:800})}catch(l){let e;if(!((e=(l instanceof Error?l.message:String(l)).toLowerCase()).includes("block range is too large")||e.includes("range is too large")||e.includes("block range too large")||e.includes("fromblock")&&e.includes("toblock")&&e.includes("too large"))||a>=r||n>=s)throw l;let t=Math.floor((a+r)/2),o=await i(a,t,n+1),d=await i(t+1,r,n+1);return o.concat(d)}};return await i(t.fromBlock,t.toBlock,0)}async function f(e,t,a){let s,i=d(a?.maxAttempts??4,1,8),r=d(a?.baseDelayMs??500,50,1e4);for(let a=1;a<=i;a+=1)try{return await e.getLogs(t)}catch(t){if(s=t,!u(t)||a===i)throw t;let e=r*a*a+Math.floor(150*Math.random());await c(e)}throw s instanceof Error?s:Error(String(s))}async function h(e,t){let a=d(o("BSC_DEPOSIT_LOG_THROTTLE_MS",0),0,1e4),s=t.topics.map(e=>Array.isArray(e)&&1===e.length?e[0]??null:e),i="string"==typeof s[0]?s[0]:null,r={fromBlock:t.fromBlock,toBlock:t.toBlock,topics:s};try{let s=await m(e,{...r,address:t.addresses});return a&&await c(a),s}catch(s){if(!u(s)&&!_(s))if(i&&_(s))try{let s=await m(e,{fromBlock:t.fromBlock,toBlock:t.toBlock,address:t.addresses,topics:[i]});return a&&await c(a),s}catch(e){if(!u(e)&&!_(e))throw e}else throw s}let n=[];for(let s of t.addresses){let o;if(s){try{o=await m(e,{...r,address:s})}catch(a){if(!i||!_(a))throw a;o=await m(e,{fromBlock:t.fromBlock,toBlock:t.toBlock,address:s,topics:[i]})}n.push(...o),a&&await c(a)}}return n}function b(e){return String(e||"").trim().toLowerCase()}function S(e){let t=String(e||"");return t.startsWith("0x")&&66===t.length?"0x"+t.slice(-40).toLowerCase():""}function N(e){let t=b(e);return t.startsWith("0x")&&42===t.length?"0x"+"0".repeat(48)+t.slice(2):"0x"+"0".repeat(64)}async function E(e,s){let i=(0,a.getBscReadProvider)(),r=s.chain??"bsc",l=d(s.confirmations??o("BSC_DEPOSIT_CONFIRMATIONS",2),0,200),c=await i.getBlockNumber(),u=Math.max(0,c-l),_=String(s.txHash||"").trim();if(!_.startsWith("0x")||_.length<10)return{ok:!1,error:"tx_not_found",txHash:_};let m=await i.getTransactionReceipt(_);if(!m)return{ok:!1,error:"tx_not_found",txHash:_};let f=Number(m.blockNumber);if(!Number.isFinite(f)||f<=0)return{ok:!1,error:"tx_not_found",txHash:_,details:{blockNumber:m.blockNumber}};if(f>u)return{ok:!1,error:"tx_not_confirmed",txHash:_,details:{blockNumber:f,tip:c,safeTip:u,confirmations:l}};if("number"==typeof m.status&&1!==m.status)return{ok:!1,error:"tx_failed",txHash:_,details:{status:m.status}};let h=await i.getTransaction(_);if(!h)return{ok:!1,error:"tx_not_found",txHash:_};let S=h.to?b(h.to):"",N=h.value??0n;if(!S||"bigint"!=typeof N||N<=0n)return{ok:!1,error:"not_a_native_transfer",txHash:_,details:{to:h.to,value:String(N)}};let E=await e`
    SELECT user_id::text AS user_id
    FROM ex_deposit_address
    WHERE chain = ${r} AND status = 'active' AND lower(address) = ${S}
    LIMIT 1
  `,x=E[0]?.user_id?String(E[0].user_id):"";if(!x)return{ok:!1,error:"unknown_deposit_address",txHash:_,details:{toAddress:S}};let g=(await e`
    SELECT id::text AS id, symbol, decimals
    FROM ex_asset
    WHERE chain = ${r}
      AND is_enabled = true
      AND contract_address IS NULL
      AND upper(symbol) = 'BNB'
    LIMIT 1
  `)[0]??null;if(!g)return{ok:!1,error:"bnb_asset_missing",txHash:_};let I=t.ethers.formatUnits(N,g.decimals),T=await n(e),k=await A(e,{chain:r,txHash:_,logIndex:-1,blockNumber:f,fromAddress:h.from?b(h.from):null,toAddress:S,userId:x,assetId:g.id,assetSymbol:g.symbol,amount:I,cols:T});return{ok:!0,chain:r,txHash:_,blockNumber:f,confirmations:l,safeTip:u,toAddress:S,userId:x,assetSymbol:"BNB",amount:I,outcome:k}}async function x(e,s){var i,r;let l,c=(0,a.getBscReadProvider)(),u=d(s.confirmations??o("BSC_DEPOSIT_CONFIRMATIONS",2),0,200),_=await c.getBlockNumber(),m=Math.max(0,_-u),f=String(s.txHash||"").trim();if(!f.startsWith("0x")||f.length<10)return{ok:!1,error:"tx_not_found",txHash:f};let h=await c.getTransactionReceipt(f);if(!h)return{ok:!1,error:"tx_not_found",txHash:f};let N=Number(h.blockNumber);if(!Number.isFinite(N)||N<=0)return{ok:!1,error:"tx_not_found",txHash:f,details:{blockNumber:h.blockNumber}};if(N>m)return{ok:!1,error:"tx_not_confirmed",txHash:f,details:{blockNumber:N,tip:_,safeTip:m,confirmations:u}};if("number"==typeof h.status&&1!==h.status)return{ok:!1,error:"tx_failed",txHash:f,details:{status:h.status}};let E=b(s.depositAddress);if(!E||!E.startsWith("0x")||42!==E.length)return{ok:!1,error:"no_matching_token_transfers",txHash:f,details:{depositAddress:E}};let x=(s.tokenSymbols??[]).map(e=>String(e||"").trim().toUpperCase()).filter(Boolean),g=x.length?x:(i=process.env.BSC_REPORT_TOKEN_SYMBOLS??"",r=["USDT","USDC"],(l=String(i||"").split(",").map(e=>e.trim().toUpperCase()).filter(Boolean)).length?l:r),I=await e`
    SELECT id::text AS id, symbol, decimals, contract_address
    FROM ex_asset
    WHERE chain = ${"bsc"}
      AND is_enabled = true
      AND contract_address IS NOT NULL
      AND upper(symbol) = ANY(${g})
    ORDER BY symbol ASC
  `;if(0===I.length)return{ok:!1,error:"token_asset_not_enabled",txHash:f,details:{symbols:g}};let T=new Map;for(let e of I){let t=b(e.contract_address);t&&T.set(t,e)}let k=await n(e),D=t.ethers.id("Transfer(address,address,uint256)"),p=[],O=0;for(let a of Array.isArray(h.logs)?h.logs:[]){let i,r=Array.isArray(a?.topics)?a.topics:[];if(!r?.length||String(r[0]).toLowerCase()!==D.toLowerCase())continue;let n=S(r?.[2]??"");if(!n||n!==E)continue;let o=b(String(a?.address??"")),d=T.get(o);if(!d)continue;let l=S(r?.[1]??"")||null;try{i=BigInt(String(a?.data??"0x0"))}catch{continue}if(i<=0n)continue;let c=t.ethers.formatUnits(i,d.decimals),u=Number(a?.index??a?.logIndex??a?.log_index??0);O+=1;let _=await A(e,{chain:"bsc",txHash:f,logIndex:u,blockNumber:N,fromAddress:l,toAddress:n,userId:s.userId,assetId:d.id,assetSymbol:d.symbol,amount:c,cols:k});p.push({assetSymbol:d.symbol,amount:c,logIndex:u,outcome:_})}return 0===O?{ok:!1,error:"no_matching_token_transfers",txHash:f,details:{depositAddress:E,symbols:g}}:{ok:!0,chain:"bsc",txHash:f,blockNumber:N,confirmations:u,safeTip:m,depositAddress:E,matches:O,credits:p}}async function g(e){await e`
    INSERT INTO app_user (id, status, kyc_level, country)
    VALUES (${i}::uuid, 'active', 'full', 'ZZ')
    ON CONFLICT (id) DO NOTHING
  `}async function A(e,t){return await e.begin(async e=>{let a=await e`
      INSERT INTO ex_chain_deposit_event (
        chain, tx_hash, log_index, block_number, from_address, to_address,
        user_id, asset_id, amount
      )
      VALUES (
        ${t.chain},
        ${t.txHash},
        ${t.logIndex},
        ${t.blockNumber},
        ${t.fromAddress},
        ${t.toAddress},
        ${t.userId}::uuid,
        ${t.assetId}::uuid,
        (${t.amount}::numeric)
      )
      ON CONFLICT (chain, tx_hash, log_index) DO NOTHING
      RETURNING id
    `,r=a[0]?.id??null;if(!r){let a=await e`
        SELECT id, journal_entry_id
        FROM ex_chain_deposit_event
        WHERE chain = ${t.chain}
          AND tx_hash = ${t.txHash}
          AND log_index = ${t.logIndex}
        FOR UPDATE
        LIMIT 1
      `;if(0===a.length||(r=Number(a[0].id),a[0].journal_entry_id))return"duplicate";await e`
        UPDATE ex_chain_deposit_event
        SET
          block_number = ${t.blockNumber},
          from_address = ${t.fromAddress},
          to_address = ${t.toAddress},
          user_id = ${t.userId}::uuid,
          asset_id = ${t.assetId}::uuid,
          amount = (${t.amount}::numeric)
        WHERE id = ${r}
      `}await g(e);let n=await e`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${t.userId}::uuid, ${t.assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `,o=await e`
      INSERT INTO ex_ledger_account (user_id, asset_id)
      VALUES (${i}::uuid, ${t.assetId}::uuid)
      ON CONFLICT (user_id, asset_id) DO UPDATE SET user_id = EXCLUDED.user_id
      RETURNING id
    `,d=`${t.chain}:${t.txHash}:${t.logIndex}`,l=(await e`
      INSERT INTO ex_journal_entry (type, reference, metadata_json)
      VALUES (
        'deposit',
        ${d},
        ${{chain:t.chain,tx_hash:t.txHash,log_index:t.logIndex,block_number:t.blockNumber,from_address:t.fromAddress,to_address:t.toAddress,asset_id:t.assetId,asset_symbol:t.assetSymbol,amount:t.amount}}::jsonb
      )
      RETURNING id
    `)[0].id;return await e`
      INSERT INTO ex_journal_line (entry_id, account_id, asset_id, amount)
      VALUES
        (${l}::uuid, ${n[0].id}::uuid, ${t.assetId}::uuid, (${t.amount}::numeric)),
        (${l}::uuid, ${o[0].id}::uuid, ${t.assetId}::uuid, ((${t.amount}::numeric) * -1))
    `,await e`
      UPDATE ex_chain_deposit_event
      SET journal_entry_id = ${l}::uuid
      WHERE chain = ${t.chain}
        AND tx_hash = ${t.txHash}
        AND log_index = ${t.logIndex}
    `,t.cols?.hasStatus&&await e`
        UPDATE ex_chain_deposit_event
        SET status = 'confirmed'
        WHERE chain = ${t.chain}
          AND tx_hash = ${t.txHash}
          AND log_index = ${t.logIndex}
      `,t.cols?.hasCreditedAt&&await e`
        UPDATE ex_chain_deposit_event
        SET credited_at = coalesce(credited_at, now())
        WHERE chain = ${t.chain}
          AND tx_hash = ${t.txHash}
          AND log_index = ${t.logIndex}
      `,t.cols?.hasConfirmedAt&&await e`
        UPDATE ex_chain_deposit_event
        SET confirmed_at = coalesce(confirmed_at, now())
        WHERE chain = ${t.chain}
          AND tx_hash = ${t.txHash}
          AND log_index = ${t.logIndex}
      `,await (0,s.createNotification)(e,{userId:t.userId,type:"deposit_credited",title:"Deposit credited",body:`+${t.amount} ${t.assetSymbol} (BSC)`,metadata:{asset_symbol:t.assetSymbol,chain:t.chain,amount:t.amount,tx_hash:t.txHash,log_index:t.logIndex,entry_id:l}}),"credited"})}async function I(e,t){let a=(await e`
    INSERT INTO ex_chain_deposit_event (
      chain, tx_hash, log_index, block_number, from_address, to_address,
      user_id, asset_id, amount
    )
    VALUES (
      ${t.chain},
      ${t.txHash},
      ${t.logIndex},
      ${t.blockNumber},
      ${t.fromAddress},
      ${t.toAddress},
      ${t.userId}::uuid,
      ${t.assetId}::uuid,
      (${t.amount}::numeric)
    )
    ON CONFLICT (chain, tx_hash, log_index) DO NOTHING
    RETURNING id
  `).length>0?"inserted":"exists";return t.cols?.hasStatus&&await e`
      UPDATE ex_chain_deposit_event
      SET status = 'pending'
      WHERE chain = ${t.chain}
        AND tx_hash = ${t.txHash}
        AND log_index = ${t.logIndex}
        AND journal_entry_id IS NULL
        AND status <> 'reverted'
    `,a}async function T(e,t){let a=await e`
    SELECT last_scanned_block
    FROM ex_chain_deposit_cursor
    WHERE chain = ${t}
    LIMIT 1
  `;return a.length>0?Number(a[0].last_scanned_block??0)||0:(await e`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block)
    VALUES (${t}, 0)
    ON CONFLICT (chain) DO NOTHING
  `,0)}async function k(e,t,a){await e`
    INSERT INTO ex_chain_deposit_cursor (chain, last_scanned_block, updated_at)
    VALUES (${t}, ${a}, now())
    ON CONFLICT (chain)
    DO UPDATE SET
      last_scanned_block = GREATEST(ex_chain_deposit_cursor.last_scanned_block, EXCLUDED.last_scanned_block),
      updated_at = now()
  `}async function D(e,s){let i,r=(0,a.getBscReadProvider)(),c=await n(e),u=d(s?.confirmations??o("BSC_DEPOSIT_CONFIRMATIONS",2),0,200),_=d(s?.blocksPerBatch??o("BSC_DEPOSIT_BLOCKS_PER_BATCH",1200),10,1e4),m=d(s?.maxBlocks??o("BSC_DEPOSIT_MAX_BLOCKS_PER_RUN",15e3),10,2e5),f=d(s?.maxMs??o("BSC_DEPOSIT_MAX_MS",0),0,3e5),E=Date.now(),x=s?.scanNative??!0,g=s?.scanTokens??!0,D=(s?.tokenSymbols??[]).map(e=>String(e||"").trim().toUpperCase()).filter(Boolean),p=await r.getBlockNumber(),O=Math.max(0,p-u),w=await T(e,"bsc"),y=w+1,C=null;try{let t=await e`
      SELECT min(assigned_block)::text AS b
      FROM ex_deposit_address
      WHERE chain = ${"bsc"} AND status = 'active' AND assigned_block IS NOT NULL
    `,a=t[0]?.b,s=null==a?NaN:Number(a);Number.isFinite(s)&&s>0&&(C=Math.trunc(s))}catch{C=null}let $=null!=C?Math.max(0,C-50):null,R=Math.max(0===w&&"number"!=typeof s?.fromBlock?O:y,$??0),B=Math.max(0,Math.min(O,s?.fromBlock??R)),L=Math.min(O,B+m-1);if(B>L)return{ok:!0,chain:"bsc",fromBlock:B,toBlock:L,tip:p,confirmations:u,batches:0,assets:0,scanNative:x,scanTokens:g,checkedLogs:0,matchedDeposits:0,credited:0,duplicates:0};let M=d(o("BSC_DEPOSIT_MAX_ADDRESSES",500),1,5e4),U=await e`
    SELECT user_id::text AS user_id, address
    FROM ex_deposit_address
    WHERE chain = ${"bsc"} AND status = 'active'
    ORDER BY derivation_index ASC
    LIMIT ${M}
  `,H=new Map;for(let e of U){let t=b(e.address);t&&H.set(t,String(e.user_id))}if(0===H.size)return await k(e,"bsc",L),{ok:!0,chain:"bsc",fromBlock:B,toBlock:L,tip:p,confirmations:u,batches:0,assets:0,scanNative:x,scanTokens:g,checkedLogs:0,matchedDeposits:0,credited:0,duplicates:0};let P=g?await e`
        SELECT id::text AS id, symbol, decimals, contract_address
        FROM ex_asset
        WHERE chain = ${"bsc"}
          AND is_enabled = true
          AND contract_address IS NOT NULL
          AND (${0===D.length}::boolean OR upper(symbol) = ANY(${D}))
        ORDER BY symbol ASC
      `:[],v=x?(await e`
            SELECT id::text AS id, symbol, decimals
            FROM ex_asset
            WHERE chain = ${"bsc"}
              AND is_enabled = true
              AND contract_address IS NULL
              AND upper(symbol) = 'BNB'
            LIMIT 1
          `)[0]??null:null,F=d(o("BSC_DEPOSIT_PENDING_LOOKBACK_BLOCKS",60),0,500),W=0;if(v&&F>0&&O<p){let a=Math.max(O+1,p-F+1);for(let s=a;s<=p&&!(f>0&&Date.now()-E>f);s+=1){let a=await r.getBlock(s,!0);if(a)for(let s of Array.isArray(a.transactions)?a.transactions:[]){let i=s.to?b(s.to):"";if(!i)continue;let r=H.get(i);if(!r)continue;let n=s.value??0n;if("bigint"!=typeof n||n<=0n)continue;let o=t.ethers.formatUnits(n,v.decimals);"inserted"===await I(e,{chain:"bsc",txHash:String(s.hash),logIndex:-1,blockNumber:Number(a.number),fromAddress:s.from?b(s.from):null,toAddress:i,userId:r,assetId:v.id,amount:o,cols:c})&&(W+=1)}}}let G=d(o("BSC_DEPOSIT_PENDING_TOKEN_LOOKBACK_BLOCKS",F),0,500);if(g&&P.length>0&&G>0&&O<p){let a=Math.max(O+1,p-G+1),s=t.ethers.id("Transfer(address,address,uint256)"),i=d(o("BSC_DEPOSIT_TO_TOPIC_CHUNK",20),1,200),n=l(Array.from(H.keys()).map(N),i),u=new Map;for(let e of P){let t=b(e.contract_address);t&&u.set(t,e)}let _=d(o("BSC_DEPOSIT_LOG_ADDRESS_CHUNK",25),5,250);for(let i of l(Array.from(u.keys()),_))if(i.length){if(f>0&&Date.now()-E>f)break;for(let o of n)if(o.length){if(f>0&&Date.now()-E>f)break;for(let n of(await h(r,{addresses:i,fromBlock:a,toBlock:p,topics:[s,null,o]}))){if(f>0&&Date.now()-E>f)break;let a=u.get(b(String(n?.address??"")));if(!a)continue;let s=S(n?.topics?.[2]??"");if(!s)continue;let i=H.get(s);if(!i)continue;let r=S(n?.topics?.[1]??"")||null,o=0n;try{o=BigInt(String(n?.data??"0x0"))}catch{o=0n}if(o<=0n)continue;let d=t.ethers.formatUnits(o,a.decimals);"inserted"===await I(e,{chain:"bsc",txHash:String(n?.transactionHash??""),logIndex:Number(n?.index??0),blockNumber:Number(n?.blockNumber??0),fromAddress:r,toAddress:s,userId:i,assetId:a.id,amount:d,cols:c})&&(W+=1)}}}}let K=t.ethers.id("Transfer(address,address,uint256)"),X=d(o("BSC_DEPOSIT_TO_TOPIC_CHUNK",20),1,200),j=g?l(Array.from(H.keys()).map(N),X):[],V=0,Y=0,Z=0,z=0,q=0,J=!1,Q=()=>f>0&&Date.now()-E>f;for(let a=B;a<=L;a+=_){if(Q()){J=!0,i="time_budget";break}let s=Math.min(L,a+_-1);if(V+=1,v)for(let n=a;n<=s;n+=1){if(Q()){J=!0,i="time_budget";break}let a=await r.getBlock(n,!0);if(a){for(let s of Array.isArray(a.transactions)?a.transactions:[]){if(Q()){J=!0,i="time_budget";break}let r=s.to?b(s.to):"";if(!r)continue;let n=H.get(r);if(!n)continue;let o=s.value??0n;if("bigint"!=typeof o||o<=0n)continue;Z+=1;let d=t.ethers.formatUnits(o,v.decimals);"credited"===await A(e,{chain:"bsc",txHash:String(s.hash),logIndex:-1,blockNumber:Number(a.number),fromAddress:s.from?b(s.from):null,toAddress:r,userId:n,assetId:v.id,assetSymbol:v.symbol,amount:d,cols:c})?z+=1:q+=1}if(J)break}}if(J)break;if(!g){await k(e,"bsc",s);continue}let n=d(o("BSC_DEPOSIT_LOG_ADDRESS_CHUNK",25),5,250),u=new Map;for(let e of P){let t=b(e.contract_address);t&&u.set(t,e)}for(let o of l(Array.from(u.keys()),n))if(o.length){if(Q()){J=!0,i="time_budget";break}for(let n of j){if(!n.length)continue;if(Q()){J=!0,i="time_budget";break}let d=await h(r,{addresses:o,fromBlock:a,toBlock:s,topics:[K,null,n]});for(let a of(Y+=d.length,d)){if(Q()){J=!0,i="time_budget";break}let s=u.get(b(String(a?.address??"")));if(!s)continue;let r=S(a.topics?.[2]??"");if(!r)continue;let n=H.get(r);if(!n)continue;let o=S(a.topics?.[1]??"")||null,d=BigInt(a.data);if(d<=0n)continue;Z+=1;let l=t.ethers.formatUnits(d,s.decimals);"credited"===await A(e,{chain:"bsc",txHash:String(a.transactionHash),logIndex:Number(a.index),blockNumber:Number(a.blockNumber),fromAddress:o,toAddress:r,userId:n,assetId:s.id,assetSymbol:s.symbol,amount:l,cols:c})?z+=1:q+=1}if(J)break}if(J)break}if(J)break;await k(e,"bsc",s)}return{ok:!0,chain:"bsc",fromBlock:B,toBlock:L,tip:p,confirmations:u,batches:V,assets:P.length+ +!!v,scanNative:x,scanTokens:g,checkedLogs:Y,matchedDeposits:Z,credited:z,duplicates:q,...W?{pendingSeen:W}:{},...J?{stoppedEarly:J,stopReason:i}:{}}}async function p(e,t){let s,i=(0,a.getBscReadProvider)(),r=await n(e),l=d(t?.confirmations??o("BSC_DEPOSIT_CONFIRMATIONS",2),0,200),c=await i.getBlockNumber(),u=Math.max(0,c-l),_=d(t?.max??o("BSC_DEPOSIT_FINALIZE_MAX",250),1,2e3),m=d(t?.maxMs??o("BSC_DEPOSIT_FINALIZE_MAX_MS",0),0,6e4),f=Date.now(),h=()=>m>0&&Date.now()-f>m,S=await e`
    SELECT
      e.tx_hash,
      e.log_index,
      e.block_number,
      e.from_address,
      e.to_address,
      e.user_id::text AS user_id,
      e.asset_id::text AS asset_id,
      a.symbol AS asset_symbol,
      e.amount::text AS amount
    FROM ex_chain_deposit_event e
    JOIN ex_asset a ON a.id = e.asset_id
    WHERE e.chain = ${"bsc"}
      AND e.journal_entry_id IS NULL
      AND e.status = 'pending'
      AND e.block_number <= ${u}
    ORDER BY e.block_number ASC, e.id ASC
    LIMIT ${_}
  `,N=0,E=0,x=0,g=!1;for(let t of S){if(h()){g=!0,s="time_budget";break}x+=1,"credited"===await A(e,{chain:"bsc",txHash:String(t.tx_hash),logIndex:Number(t.log_index),blockNumber:Number(t.block_number),fromAddress:t.from_address?b(String(t.from_address)):null,toAddress:b(String(t.to_address)),userId:String(t.user_id),assetId:String(t.asset_id),assetSymbol:String(t.asset_symbol),amount:String(t.amount),cols:r})?N+=1:E+=1}return{ok:!0,chain:"bsc",tip:c,safe_tip:u,confirmations_required:l,scanned:x,credited:N,duplicates:E,...g?{stoppedEarly:g,stopReason:s}:{}}}e.s(["finalizePendingBscDeposits",()=>p,"ingestBscTokenDepositTx",()=>x,"ingestNativeBnbDepositTx",()=>E,"scanAndCreditBscDeposits",()=>D])}];

//# sourceMappingURL=src_lib_blockchain_depositIngest_ts_c6581545._.js.map