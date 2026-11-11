// 仙加味：只有文案措辭更正時，重綁已存在的待審 AI 證據。
// Immutable review INSERT only; does not update post, grant AI/HUMAN approval, or publish.
// Requires exact corrected-copy CAS lease and readback of each immutable D1 review.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {createD1Transport} from './d1-http-transport.mjs';
const require=createRequire(import.meta.url),{fingerprint}=require('./metricool-free-evidence.cjs');
const path=process.env.AI_REBIND_REQUEST_FILE;
if(!/^ops\/rebind-copy-only-requests\/[A-Za-z0-9_-]+\.json$/.test(path||''))throw Error('Invalid AI source rebind request path');
const req=JSON.parse(fs.readFileSync(path,'utf8'));
if(req.mode!=='copy_only_pending_review_rebind'||req.approve!==false||req.schedule!==false||req.publish!==false||
 !/^ops\/post-copy-cleanup-batches\/[A-Za-z0-9_-]+\.json$/.test(req.copyBatch||'')||
 !/^ops\/receipts\/[A-Za-z0-9_-]+\.json$/.test(req.copyReceipt||'')||
 !Array.isArray(req.postIds)||req.postIds.length<1||req.postIds.length>50||
 new Set(req.postIds).size!==req.postIds.length)throw Error('Unsafe rebind request');
const b=JSON.parse(fs.readFileSync(req.copyBatch,'utf8')),receipt=JSON.parse(fs.readFileSync(req.copyReceipt,'utf8'));
if(receipt.complete!==true||receipt.verified!==receipt.attempted||receipt.verified!==req.postIds.length||
 receipt.approved!==0||receipt.scheduled!==0||receipt.published!==0||
 b.allowHumanApproval!==false||b.allowSchedule!==false||b.allowPublication!==false||
 b.batch_id!==receipt.batch)throw Error('Unverified copy-only repair lease');
const items=req.postIds.map(id=>{
 const item=b.items.find(x=>x.id===id),proof=receipt.records.find(x=>x.id===id);
 if(!item||!proof||proof.result!=='changed_and_verified'||
   !/^[a-f0-9]{64}$/.test(proof.priorFingerprint)||!/^[a-f0-9]{64}$/.test(proof.currentFingerprint))
   throw Error('A corrected post is missing its verified original and current fingerprint');
 return {id,item,proof,newCopy:item.expected_copy.replace(item.old_phrase,item.replacement)};
});
const dbid=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const run=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbid});
const q=v=>v===null||v===undefined?'NULL':typeof v==='number'&&Number.isFinite(v)?String(v):"'"+String(v).replaceAll("'","''")+"'";
async function one(sql){return(await run(sql))[0]?.results?.[0]||null}
const sourcePrefix='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/';
const changes=['duplicate','compliance_final'];
const approvals=()=>({ai:0,human:0,scheduled:0,published:0});
const prepared=[];
for(const {id,item,proof,newCopy} of items){
 const p=await one('SELECT * FROM social_posts WHERE id='+q(id));
 if(!p||p.status!=='pending_review'||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||Number(p.image_approved)!==0||
 p.updated_at!==proof.updatedAt||p.image_url!==item.expected_image_url||p.copy!==newCopy||fingerprint(p)!==proof.currentFingerprint)
   throw Error('Current D1 post changed since authorized copy-only correction; no reviews written');
 const [mappings,deliveries]=await Promise.all([
   one('SELECT COUNT(*) AS n FROM social_metricool_sync WHERE post_id='+q(id)),
   one('SELECT COUNT(*) AS n FROM social_publish_deliveries WHERE post_id='+q(id))
 ]);
 if(!mappings||!deliveries||Number(mappings.n)!==0||Number(deliveries.n)!==0)throw Error('Existing remote mapping or delivery; fail closed');
 const old=await one('SELECT * FROM social_post_quality_reviews WHERE post_id='+q(id)+' ORDER BY reviewed_at DESC,id DESC LIMIT 1');
 const reviewId='AI-COPY-REVIEW-'+crypto.createHash('sha256').update(req.copyBatch+'|'+id+'|'+proof.currentFingerprint).digest('hex').slice(0,32);
 if(old?.id===reviewId){
  if(old?.content_fingerprint!==proof.currentFingerprint||old?.decision!=='NEEDS_HUMAN_REVIEW'||old?.image_url!==p.image_url)
   throw Error('Previously imported review does not match current copy');
  prepared.push({id,p,proof,reviewId,already:true});continue;
 }
 if(old?.content_fingerprint!==proof.priorFingerprint||old?.decision!=='NEEDS_HUMAN_REVIEW'||old?.image_url!==p.image_url||
  !/^[a-f0-9]{64}$/.test(old.image_sha256||''))
   throw Error('Old immutable AI evidence is not bound to preceding copy version');
 let e;try{e=JSON.parse(old.evidence_json)}catch{throw Error('Previous AI evidence is invalid')}
 if(e?.content_fingerprint!==proof.priorFingerprint||e?.image_sha256!==old.image_sha256||
 e?.image_url!==p.image_url||e?.post_id!==id)throw Error('Previous AI evidence JSON failed source binding');
 for(const [k,c] of Object.entries(e.checks||{})){
  if(changes.includes(k)){if(c?.result!=='DEFER')throw Error('Missing mandatory pending blocker '+k)}
  else if(c?.result!=='PASS')throw Error('Unexpected old non-pass check; explicit inspection required '+k);
 }
 if(Object.keys(e.checks||{}).length!==16)throw Error('Old review does not have exactly 16 applicable checks');
 if(!p.image_url.startsWith(sourcePrefix))throw Error('Photo source must be exact own-repo immutable source URL');
 const local=p.image_url.slice(sourcePrefix.length);
 if(!/^assets\/post-images\/[A-Za-z0-9./_-]+\.(jpg|jpeg|png|webp)$/.test(local)||!fs.existsSync(local))
   throw Error('Current official image source does not exist in checkout');
 const realSHA=crypto.createHash('sha256').update(fs.readFileSync(local)).digest('hex');
 if(realSHA!==old.image_sha256)throw Error('Image original bytes changed; explicit visual review required');
 if(String(p.copy).includes('正式包裝')||/(治療|醫治|預防疾病|改善疾病|保證療效|膠原蛋白|鈣質)/.test(p.copy))
   throw Error('Copy-only change failed public text compliance checks');
 const profile=await one('SELECT role,active FROM profiles WHERE email='+q(old.authorized_by));
 if(!profile?.active||!['owner','admin'].includes(profile.role))throw Error('Original authorized manager no longer active');
 prepared.push({id,p,proof,reviewId,already:false,old,e,realSHA});
}
const countBefore=await run('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status');
const state={schema:'xjw-copy-only-review-rebound-v1',source:req.copyBatch,at:new Date().toISOString(),
 requested:prepared.length,verified:0,complete:false,...approvals(),rows:[],countsBefore:countBefore[0].results};
const output='/tmp/ai-source-rebind-receipt.json';
const checkpoint=()=>fs.writeFileSync(output,JSON.stringify(state,null,2)+'\n');
checkpoint();
try{
 for(const x of prepared){
  if(!x.already){
   const now=new Date().toISOString();
   const e={...x.e,content_fingerprint:x.proof.currentFingerprint,reviewed_at:now,
    model:'ChatGPT-copy-only-version-check-v1',reviewer_type:'AI',post_id:x.id,
    assessment:{decision:'NEEDS_HUMAN_REVIEW',reasons:[
     '文案內部措辭已修正，保留其餘14項原版本證據及逐篇最新文案查核',
     '歷史圖片視覺去重仍缺外部媒體，維持DEFER',
     '產品情境圖片最終外觀仍待確認，合規末項維持DEFER'
    ]},
    source_delta:{type:'approved_literal_copy_repair',priorFingerprint:x.proof.priorFingerprint,
     currentFingerprint:x.proof.currentFingerprint,copyRepairBatch:b.batch_id,sourceReviewId:x.old.id,
     onlyWordingChanged:true,noMediaChange:true,fullDuplicateReviewComplete:false}
   };
   const sql=`INSERT INTO social_post_quality_reviews(
id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,
model,policy_version,authorized_by,reviewed_at,old_status,new_status)
SELECT ${[x.reviewId,x.id,'AI','NEEDS_HUMAN_REVIEW',x.proof.currentFingerprint,x.p.image_url,
 x.realSHA,JSON.stringify(e),e.model,x.old.policy_version,x.old.authorized_by,now,
 'pending_review','pending_review'].map(q).join(',')}
FROM social_posts p WHERE p.id=${q(x.id)} AND p.status='pending_review'
AND p.updated_at=${q(x.p.updated_at)} AND p.copy=${q(x.p.copy)}
AND p.image_url=${q(x.p.image_url)} AND p.published_at IS NULL AND p.scheduled_at IS NULL
AND p.approved_by IS NULL AND p.approved_at IS NULL AND COALESCE(p.image_approved,0)=0
AND EXISTS(SELECT 1 FROM social_post_quality_reviews r WHERE r.id=${q(x.old.id)}
AND r.post_id=p.id AND r.content_fingerprint=${q(x.proof.priorFingerprint)})
AND NOT EXISTS(SELECT 1 FROM social_metricool_sync m WHERE m.post_id=p.id)
AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries d WHERE d.post_id=p.id)
AND NOT EXISTS(SELECT 1 FROM social_post_quality_reviews r WHERE r.id=${q(x.reviewId)})`;
   const result=await run(sql);
   if(Number(result[0]?.meta?.changes)!==1)throw Error('D1 rebind CAS did not insert exactly one bound review');
  }
  const [p,after]=await Promise.all([
   one('SELECT * FROM social_posts WHERE id='+q(x.id)),
   one('SELECT * FROM social_post_quality_reviews WHERE id='+q(x.reviewId)+' LIMIT 1')
  ]);
  if(!p||p.status!=='pending_review'||p.published_at||p.scheduled_at||p.approved_by||p.approved_at||Number(p.image_approved)!==0||
   p.copy!==x.p.copy||p.image_url!==x.p.image_url||p.updated_at!==x.p.updated_at||
   !after||after.reviewer_type!=='AI'||after.decision!=='NEEDS_HUMAN_REVIEW'||
   after.content_fingerprint!==x.proof.currentFingerprint||after.image_sha256!==(x.realSHA||after.image_sha256))
   throw Error('D1 review readback or post unchanged-state verification failed');
  const checked=JSON.parse(after.evidence_json);
  if(checked.checks?.duplicate?.result!=='DEFER'||checked.checks?.compliance_final?.result!=='DEFER'||
   checked.source_delta?.fullDuplicateReviewComplete!==false)
   throw Error('Old dedup/compliance DEFER was lost');
  state.rows.push({id:x.id,reviewId:x.reviewId,verified:true,copySHA256:x.proof.currentFingerprint,
    duplicate:'DEFER',compliance_final:'DEFER',postStatus:p.status,priorStatus:'pending_review'});
  state.verified++;checkpoint();
 }
 const countAfter=await run('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status');
 state.countsAfter=countAfter[0].results;
 if(JSON.stringify(state.countsBefore)!==JSON.stringify(state.countsAfter))
  throw Error('D1 post status totals changed during source-only review insert');
 state.complete=true;state.finishedAt=new Date().toISOString();checkpoint();
 console.log('VERIFIED_COPY_ONLY_AI_EVIDENCE',JSON.stringify({verified:state.verified,complete:state.complete,unchanged:true}));
}catch(error){state.error=String(error?.message||'failed').slice(0,240);checkpoint();throw error}
