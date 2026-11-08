// All-active editorial dedup audit, read-only. Produces per-post, version-bound proofs and historical nearest candidates.
// Do not auto-approve a post solely from numerical similarity or incomplete external media.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-all-active-dedup-audit-20261107.json','utf8'));
if(req.scope!=='full-current-active-20261107-readonly'||req.allowApproval!==false||req.allowPublication!==false||req.mutateD1!==false)throw Error('Unsafe audit request');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!db)throw Error('Cloudflare D1 credentials absent');
async function query(s){
 const u='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';
 const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 read failed '+JSON.stringify(j.errors||[]).slice(0,180));
 return j.result[0]?.results||[];
}
async function queryAllPages(sql,pageSize=100){
 const rows=[];
 for(let offset=0;;offset+=pageSize){
  if(offset>20000)throw Error('Unexpectedly large D1 pagination; stop rather than return partial data');
  const batch=await query(`${sql} LIMIT ${pageSize} OFFSET ${offset}`);
  if(!Array.isArray(batch)||batch.length>pageSize)throw Error('D1 paged query shape invalid');
  rows.push(...batch);
  if(batch.length<pageSize)return rows;
 }
}
const pending=await queryAllPages("SELECT * FROM social_posts WHERE status='pending_review' ORDER BY id");
const allCounts=await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status");
const latest=await queryAllPages("SELECT q.* FROM social_post_quality_reviews q WHERE q.post_id IN (SELECT id FROM social_posts WHERE status='pending_review') AND q.reviewed_at=(SELECT MAX(t.reviewed_at) FROM social_post_quality_reviews t WHERE t.post_id=q.post_id) ORDER BY q.post_id,q.reviewed_at,q.id");
const ai=new Map(latest.map(x=>[x.post_id,x]));
const metaRows=await query("SELECT status,result_json FROM social_meta_history_readonly WHERE run_id='XJW-META-HISTORY-20261105-V1' LIMIT 1");
const meta=metaRows[0]?JSON.parse(metaRows[0].result_json||'{}'):{};
const fb=(meta.facebook||[]).map(x=>({id:'FB:'+x.id,platform:'Facebook',publishedAt:x.date,copy:x.text||'',permalink:x.permalink||'',imageSlots:(x.images||[]).length}));
const m=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8'));
const other=['instagram','threads'].flatMap(k=>(m.records?.[k]||[]).map(x=>({id:(k==='instagram'?'IG:':'TH:')+x.postId,platform:k,publishedAt:x.dateRaw,copy:x.content||'',permalink:x.permalink||'',imageSlots:x.mediaCoverUrl?1:0})));
const history=[...fb,...other];
const known=JSON.parse(fs.readFileSync('ops/visual-text-neighbors-20261107.json','utf8'));
const legacyMap=new Map(known.map(x=>[x.id,x]));
const revised=new Set(['XJW-CAND-20270309','XJW-CAND-20270330']);
const norm=s=>String(s||'').replace(/https?:\/\/\S+|#[^\s#]+/g,'').replace(/仙加味|補養是一種節奏|小老闆|小鹿|小烏龜|官方LINE/gi,'').replace(/[^\p{L}\p{N}]/gu,'');
const grams=s=>{const t=norm(s),g=new Map();for(let i=0;i<t.length-2;i++){const z=t.slice(i,i+3);g.set(z,(g.get(z)||0)+1)}return g};
function sim(a,b){const x=grams(a),y=grams(b);if(!x.size||!y.size)return 0;let dot=0,nx=0,ny=0;for(const[k,v]of x){nx+=v*v;dot+=v*(y.get(k)||0)}for(const v of y.values())ny+=v*v;return +(dot/Math.sqrt(nx*ny)).toFixed(4)}
const checks=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const rows=pending.map(p=>{
 const ar=ai.get(p.id);let e={};try{e=JSON.parse(ar?.evidence_json||'{}')}catch{}
 const scores=history.map(x=>({id:x.id,platform:x.platform,score:sim(p.copy,x.copy),permalink:x.permalink,date:x.publishedAt,snippet:x.copy.slice(0,150),mediaSlots:x.imageSlots})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
 const within=pending.filter(x=>x.id!==p.id).map(x=>({id:x.id,title:x.title,score:sim(p.copy,x.copy)})).filter(x=>x.score>.03).sort((a,b)=>b.score-a.score);
 const existing=legacyMap.get(p.id);
 const checked=Object.fromEntries(checks.map(k=>[k,e.checks?.[k]?.result||'missing']));
 const eCur=ar?.content_fingerprint===fingerprint(p)&&e.content_fingerprint===fingerprint(p)&&ar?.image_url===p.image_url;
 const max=scores[0]?.score||0,maxIn=within[0]?.score||0;
 return{id:p.id,title:p.title,status:p.status,copySHA256:crypto.createHash('sha256').update(String(p.copy||'')).digest('hex'),imageUrl:p.image_url,imageQualityStatus:p.image_quality_status,copyImageFingerprint:fingerprint(p),currentAIReviewId:ar?.id||null,latestAIContentCurrent:!!eCur,latestAIDecision:ar?.decision||null,checks:checked,highestPublishedSimilarity:max,highestPendingSimilarity:maxIn,publishedCandidates:scores.slice(0,5),pendingCandidates:within.slice(0,4),previousVisualNeighbors:existing?.visualNearest?.slice(0,3)||[],oldCopySimilarityStale:revised.has(p.id),alert:max>=.16||maxIn>=.16?'MANUAL_EDITORIAL_ANGLE_CHECK':'NO_STRONG_CAPTION_COLLISION_IN_RETRIEVED_HISTORY',dedup:'DEFER_until_independent_visual_history_conclusion',mayBeScheduled:false,mayBePublished:false};
});
const pendingCount=Number(allCounts.find(x=>x.status==='pending_review')?.count||0);
const totalCount=allCounts.reduce((sum,row)=>sum+Number(row.count||0),0);
if(!Number.isSafeInteger(totalCount)||totalCount<0||!Number.isSafeInteger(pendingCount)||pending.length!==pendingCount||new Set(pending.map(x=>x.id)).size!==pending.length)throw Error('Incomplete or duplicated live D1 pending snapshot; do not report truncated results');
const endCounts=await query("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status");
if(JSON.stringify(endCounts)!==JSON.stringify(allCounts))throw Error('Concurrent D1 status changes during audit; retry readonly snapshot');
const output={schema:'xjw-all-active-version-bound-history-dedup-screen-v1',checkedAt:new Date().toISOString(),source:{d1:'direct Cloudflare D1 live read',facebook:'Meta official stored one-shot 74 Page posts',instagram:'Metricool first party 35 posts',threads:'Metricool first party 23 posts',visualNeighbors:'existing 79 perceptual hash and text-similarity outputs',historicalMediaRecovered:178,historicalMediaUnavailable:15},scope:'All current pending posts, no status or approvals modified; per-row latest evidence checked; numerical similarity is a screening signal, not a completed visual judgment',counts:allCounts,activePosts:pending.length,historyRows:history.length,historyByPlatform:{facebook:fb.length,instagram:other.filter(x=>x.platform==='instagram').length,threads:other.filter(x=>x.platform==='threads').length},alerts:rows.filter(x=>x.alert==='MANUAL_EDITORIAL_ANGLE_CHECK').length,copyExactPublished:rows.filter(x=>x.publishedCandidates.some(y=>y.score===1)).length,imageQualityUnresolved:rows.filter(x=>x.imageQualityStatus==='needs_review').length,currentVersionEvidence:rows.filter(x=>x.latestAIContentCurrent).length,aiApprovals:0,humanApprovals:0,d1Mutations:0,metricoolMutations:0,publications:0,limitations:['15 historical media bytes remain inaccessible, so pixel-level uniqueness across all prior posts is not certified','Older Instagram/Threads carousel children may be missing','Image nearest matches from 20261107 may use old copy versions for two corrected candidate texts','No numerical threshold grants a PASS; all ambiguity requires substantive current-image checks'],rows};
fs.writeFileSync('all-active-history-dedup-screen.json',JSON.stringify(output,null,2)+'\n');
console.log('ACTIVE_FULL_HISTORY_SCREEN',JSON.stringify({counts:output.counts,pending:output.activePosts,history:output.historyByPlatform,alerts:output.alerts,qualityUnresolved:output.imageQualityUnresolved,currentVersionEvidence:output.currentVersionEvidence,copyExactPublished:output.copyExactPublished,zeroApprovals:true,topAlerts:rows.filter(x=>x.alert==='MANUAL_EDITORIAL_ANGLE_CHECK').sort((a,b)=>Math.max(b.highestPublishedSimilarity,b.highestPendingSimilarity)-Math.max(a.highestPublishedSimilarity,a.highestPendingSimilarity)).slice(0,20).map(x=>({id:x.id,publishedScore:x.highestPublishedSimilarity,pendingScore:x.highestPendingSimilarity}))}));
