// URL-level historic source availability audit; HEAD/range-only. No image redownloads, writes to D1 or approvals.
import fs from 'node:fs';
const request=JSON.parse(fs.readFileSync('ops/request-history-source-gap-inspection-20261108.json','utf8'));
if(request.scope!=='original-source-reachability-without-media-downloads'||request.publish!==false||request.mutateD1!==false)throw Error('Unsafe provenance request');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!acct||!token||!db)throw Error('D1 read credentials not configured');
const sql="SELECT result_json FROM social_meta_history_readonly WHERE run_id='XJW-META-HISTORY-20261105-V1' LIMIT 1";
const api=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(20000)});
const reply=await api.json();if(!api.ok||!reply.success||!reply.result?.[0]?.results?.length)throw Error('Official Meta Facebook original post history unavailable; no guessing');
const meta=JSON.parse(reply.result[0].results[0].result_json);
const metricool=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8'));
const canon=u=>String(u||'').split('?')[0];
const sources=new Map();
for(const p of meta.facebook||[]){
 for(const im of p.images||[]){
  const url=String(im.url||'');if(!url.startsWith('https://'))continue;
  const k=canon(url);
  if(!sources.has(k))sources.set(k,{network:'facebook',originalPostIds:[],permalinks:[],sourceUrl:url,canonicalPath:k});
  const t=sources.get(k);if(!t.originalPostIds.includes(p.id))t.originalPostIds.push(p.id);
  if(p.permalink&&!t.permalinks.includes(p.permalink))t.permalinks.push(p.permalink);
 }
}
for(const p of metricool.records?.instagram||[]){
 const url=String(p.mediaCoverUrl||'');if(!url.startsWith('https://'))continue;
 const k=canon(url);
 if(!sources.has(k))sources.set(k,{network:'instagram',originalPostIds:[],permalinks:[],sourceUrl:url,canonicalPath:k});
 const t=sources.get(k);if(!t.originalPostIds.includes(p.postId))t.originalPostIds.push(p.postId);
 if(p.permalink&&!t.permalinks.includes(p.permalink))t.permalinks.push(p.permalink);
}
const targets=[...sources.values()];
const limits={concurrency:6,timeoutMs:7500};
async function inspect(target){
 const abort=new AbortController();const tid=setTimeout(()=>abort.abort(),limits.timeoutMs);
 try{
  const res=await fetch(target.sourceUrl,{method:'HEAD',redirect:'follow',signal:abort.signal});
  const type=res.headers.get('content-type')||'';
  let status=res.status,method='HEAD',reachable=res.ok&&type.toLowerCase().startsWith('image/');
  if([403,405,406].includes(res.status)){
   // 1-byte range fallback: never redownload successfully recovered 178 media objects.
   const ctrl=new AbortController(),t2=setTimeout(()=>ctrl.abort(),limits.timeoutMs);
   try{const alt=await fetch(target.sourceUrl,{method:'GET',headers:{Range:'bytes=0-0'},redirect:'follow',signal:ctrl.signal});status=alt.status;method='GET_RANGE_0_0';reachable=(alt.status===206||alt.status===200)&&String(alt.headers.get('content-type')||'').startsWith('image/');await alt.body?.cancel?.();}finally{clearTimeout(t2)}
  }
  return {...target,httpStatus:status,method,reachable,checkedAt:new Date().toISOString()};
 }catch(error){return {...target,reachable:false,httpStatus:null,reason:String(error.message||error).slice(0,130),checkedAt:new Date().toISOString()};}
 finally{clearTimeout(tid);}
}
const results=[];let offset=0;
async function worker(){for(;;){const i=offset++;if(i>=targets.length)return;results[i]=await inspect(targets[i]);}}
await Promise.all(Array.from({length:Math.min(limits.concurrency,targets.length)},()=>worker()));
const grouped={};
for(const x of results){const group=grouped[x.network]||(grouped[x.network]={reachable:0,unreachable:0,total:0});group.total++;group[x.reachable?'reachable':'unreachable']++;}
const out={schema:'xjw-historical-original-source-head-check-v1',checkedAt:new Date().toISOString(),sourceRun:request.previouslyRecoveredHistoricalAssets,requestsMade:results.length,method:'HEAD, or one-byte range if HEAD is rejected; not re-downloading recovered historical files',grouped,unreachable:results.filter(x=>!x.reachable),reachableCount:results.filter(x=>x.reachable).length,results,limitations:['Source metadata reachability cannot prove content-level or pixel-level non-duplication','Fifteen missing sources from prior private Work cache are not identified by URL in ops/history-cache-increment-20261107.json; do not assume a one-to-one correspondence to these results','Instagram carousel children not returned by Metricool firstparty analytics; Threads historical media not exposed in this snapshot','Partial/expired CDN urls may fail even when underlying official post still exists'],d1Writes:0,postReviewChanges:0,externalPublication:0};
fs.writeFileSync('historical-original-source-head-audit.json',JSON.stringify(out,null,2)+'\n');
console.log('HISTORICAL_SOURCE_REACHABILITY',JSON.stringify({requestsMade:out.requestsMade,grouped:out.grouped,unreachable:out.unreachable.length,firstUnreachable:out.unreachable.slice(0,12).map(x=>({network:x.network,post:x.originalPostIds[0],httpStatus:x.httpStatus,permalink:x.permalinks[0]})),d1Writes:0}));
