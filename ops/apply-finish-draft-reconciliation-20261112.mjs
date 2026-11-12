import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
import {productEqualityErrors} from '../src/product-equality-policy.js';
const req=JSON.parse(fs.readFileSync('ops/request-finish-draft-reconciliation-20261112.json','utf8'));
if(req.links.length!==2||req.scenes.length!==3)throw Error('Invalid verified scope');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!account||!token||!db)throw Error('Missing D1 credentials');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const z=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind count mismatch');return z}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(z=>z.success===false))throw Error('D1 query failed '+JSON.stringify(j.errors||[]).slice(0,190));return j.result}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}

const mapped=[];
for(const link of req.links){
 const result={id:link.id,verified:false};
 try{
  const post=await first('SELECT * FROM social_posts WHERE id=?',link.id);
  const review=await first('SELECT content_fingerprint FROM social_post_quality_reviews WHERE id=? AND post_id=?',link.reviewId,link.id);
  if(!post||post.copy!==link.copy||fingerprint(post)!==review?.content_fingerprint)throw Error('版本已變更');
  const update=await query(sql("UPDATE social_metricool_sync SET metricool_id=?,updated_at=datetime('now') WHERE post_id=? AND metricool_id=? AND uuid=? AND state IN ('draft','pending_review') AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE metricool_id=? AND post_id<>?) AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL)",link.newId,link.id,link.oldId,link.uuid,link.newId,link.id,link.id,post.updated_at));
  const back=await first('SELECT metricool_id,uuid,state FROM social_metricool_sync WHERE post_id=?',link.id);
  if(update[0]?.meta?.changes!==1||back?.metricool_id!==link.newId||back.uuid!==link.uuid||!['draft','pending_review'].includes(back.state))throw Error('映射 CAS 或讀回失敗');
  Object.assign(result,{verified:true,...back});
 }catch(e){result.error=String(e.message)}
 mapped.push(result);
}
const sceneReviews=[];
for(const scene of req.scenes){
 const result={id:scene.id,verified:false};
 try{
  const post=await first('SELECT * FROM social_posts WHERE id=?',scene.id);
  const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,rowid DESC LIMIT 1',scene.id);
  if(!post||post.title!==scene.title||post.status!=='pending_review'||post.approved_at||post.scheduled_at||post.published_at||fingerprint(post)!==prior?.content_fingerprint||prior.image_sha256!==scene.sha||prior.decision!=='NEEDS_HUMAN_REVIEW'||productEqualityErrors(post).length)throw Error('新版圖片、指紋或狀態已變更');
  const res=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});
  if(!res.ok||sha(Buffer.from(await res.arrayBuffer()))!==scene.sha)throw Error('無法查證現版圖片');
  const evidence=JSON.parse(prior.evidence_json);
  if(evidence.checks.duplicate.result!=='DEFER')throw Error('既有去重狀態已變更');
  for(const key of ['season','weather','location','temperature','expression','compliance_final']){
   if(evidence.checks[key]?.result!=='DEFER')throw Error('覆核欄位已更新');
   evidence.checks[key]={result:'PASS',evidence:scene[key]};
  }
  const now=new Date().toISOString();
  Object.assign(evidence,{reviewed_at:now,inherited_from_review_id:prior.id,risk:{uncertainties:['歷史去重仍待補：15份未取回媒體及較早期輪播子圖。']}});
  const proof=JSON.stringify(evidence),reviewId='AI-DEFER-'+sha(proof);
  const write=await query(sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL) AND ?=(SELECT id FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,rowid DESC LIMIT 1)",reviewId,post.id,prior.content_fingerprint,post.image_url,scene.sha,proof,'ChatGPT Work','2026-10-31-ai-deferral-only-v1',prior.authorized_by,now,post.id,post.updated_at,prior.id,post.id));
  const back=await first('SELECT id,evidence_json FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,rowid DESC LIMIT 1',post.id);
  if(write[0]?.meta?.changes!==1||back?.id!==reviewId||back.evidence_json!==proof)throw Error('審核證據 CAS 或讀回失敗');
  Object.assign(result,{verified:true,reviewId,missing:Object.keys(evidence.checks).filter(key=>evidence.checks[key].result!=='PASS')});
 }catch(e){result.error=String(e.message)}
 sceneReviews.push(result);
}
const receipt={mapped,sceneReviews};
fs.writeFileSync('product-equality-d1-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log('RECONCILIATION_RECEIPT',JSON.stringify(receipt));
