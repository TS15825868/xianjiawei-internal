import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
import {productEqualityErrors} from '../src/product-equality-policy.js';
const req=JSON.parse(fs.readFileSync('ops/request-product-equality-20261112.json','utf8'));
if(req.scope!=='pending-product-equality-20261112'||!Array.isArray(req.items)||req.items.length!==26||new Set(req.items.map(x=>x.id)).size!==26)throw Error('Unsafe request');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!account||!token||!db)throw Error('Missing D1 credentials');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const z=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind count mismatch');return z}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(z=>z.success===false))throw Error('D1 query failed '+JSON.stringify(j.errors||[]).slice(0,190));return j.result}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
const deferred='已取得的歷史素材與相似候選為比對基礎；15份歷史媒體及部分IG／Threads輪播子圖仍未驗明。新版主題與新圖仍須完成對應的歷史比對。';
for (const fix of req.items) {
 const out={id:fix.id,verified:false,imageReplaced:false};
 try {
  const post=await first('SELECT * FROM social_posts WHERE id=?',fix.id);
  if(!post||post.status!=='pending_review'||fingerprint(post)!==fix.expected||post.approved_by||post.approved_at||post.published_at||post.scheduled_at||Number(post.image_approved||0))throw Error('目前版本或待審狀態已變更');
  const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC,rowid DESC LIMIT 1',fix.id);
  if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.content_fingerprint!==fix.expected||prior.image_url!==post.image_url||!prior.image_sha256)throw Error('缺現版 defer 證據');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',fix.id))throw Error('須先協調 Metricool 草稿映射');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',fix.id))throw Error('須先核對發送紀錄');
  const actor=await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
  if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('既有證據權限已變更');
  const oldEvidence=JSON.parse(prior.evidence_json||'{}');
  if(oldEvidence.content_fingerprint!==fix.expected||oldEvidence.image_sha256!==prior.image_sha256||oldEvidence.checks?.duplicate?.result!=='DEFER')throw Error('既有證據版本或去重狀態不符');
  const asset=fix.asset;
  if(!asset&&!['clear','passed'].includes(post.image_quality_status))throw Error('既有圖片仍需修復');
  const next={...post,title:fix.title,headline:fix.headline,copy:fix.copy,
    image_url:asset?.url??post.image_url,image_alt:fix.alt??post.image_alt,
    image_source:asset?'仙加味正式角色參考，2026-11-12 新製獨立情境，無商品包裝':post.image_source,
    image_width:asset?1254:post.image_width,image_height:asset?1254:post.image_height,
    image_bytes:asset?.bytes??post.image_bytes,image_quality_status:asset?'clear':post.image_quality_status};
  if(productEqualityErrors(next).length)throw Error('新品文案未通過產品平等檢查');
  const response=await fetch(next.image_url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('正式圖片無法讀取');
  const data=Buffer.from(await response.arrayBuffer()),hash=sha(data);
  if(hash!==(asset?.sha??prior.image_sha256)||(asset&&data.length!==asset.bytes))throw Error('正式圖片 SHA 或 bytes 不符');
  const now=new Date().toISOString(), fp=fingerprint(next);
  const checks=structuredClone(oldEvidence.checks);
  if(asset) {
    for(const key of Object.keys(checks))checks[key]={result:'DEFER',evidence:'新版圖文已重新綁定，需再取得該項可驗證的完整視覺覆核。'};
    for(const key of ['brand','occasion','scene_environment','action','mascot_companions'])checks[key]={result:'PASS',evidence:'已逐張查看新版情境圖；'+fix.alt+'紅色直式仙加味印章可辨。'};
    for(const key of ['product','specification','pricing_activity','physical_scale'])checks[key]={result:'PASS',evidence:'本篇是獨立品牌生活情境，未介紹或呈現販售商品、規格或價格。'};
  }
  checks.duplicate={result:'DEFER',evidence:deferred};
  checks.compliance_final={result:'DEFER',evidence:'新版文案已通過產品平等文字檢查，完整新版廣告及圖文合規保留待覆核。'};
  const evidence={post_id:post.id,reviewer_type:'AI',model:'ChatGPT Work',requested_decision:'defer',reviewed_at:now,content_fingerprint:fp,image_sha256:hash,image_url:next.image_url,image_bytes:data.length,inherited_from_review_id:prior.id,checks,risk:{uncertainties:[deferred,'新版合規仍待覆核']},publication:{approved:false,auto_schedule:false,auto_publish:false}};
  const proof=JSON.stringify(evidence),reviewId='AI-DEFER-'+sha(proof);
  const update=sql("UPDATE social_posts SET title=?,headline=?,copy=?,image_url=?,image_alt=?,image_source=?,image_width=?,image_height=?,image_bytes=?,image_quality_status=?,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",next.title,next.headline,next.copy,next.image_url,next.image_alt,next.image_source,next.image_width,next.image_height,next.image_bytes,next.image_quality_status,'產品平等文案已更新，歷史去重與最終合規待覆核',now,post.id,post.updated_at,post.title,post.copy,post.image_url);
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review')",reviewId,post.id,fp,next.image_url,hash,proof,evidence.model,'2026-10-31-ai-deferral-only-v1',actor.email,now,post.id,now);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','產品平等圖文修正與版本重綁','貼文',?,?,?,'' WHERE changes()=1",'AUD-'+crypto.randomUUID(),post.id,JSON.stringify({fingerprint:fix.expected,reviewId:prior.id}),JSON.stringify({fingerprint:fp,reviewId,imageSha:hash}));
  const written=await query([update,insert,audit].join(';\n'));
  if(written.length!==3||written.some(x=>x.meta?.changes!==1))throw Error('CAS 未成功或回執不一致');
  const [back, review]=await Promise.all([first('SELECT * FROM social_posts WHERE id=?',post.id),first('SELECT decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?',reviewId)]);
  if(!back||fingerprint(back)!==fp||back.status!=='pending_review'||back.approved_by||back.scheduled_at||back.published_at||review?.decision!=='NEEDS_HUMAN_REVIEW'||review.content_fingerprint!==fp||review.image_sha256!==hash)throw Error('D1 讀回未驗證');
  Object.assign(out,{verified:true,imageReplaced:Boolean(asset),reviewId,sha:hash,bytes:data.length});
 }catch(error){out.blocker=String(error.message||error).slice(0,250)}
 results.push(out);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
const latestDecisions=(await query("SELECT decision,COUNT(*) AS count FROM (SELECT p.id,(SELECT r.decision FROM social_post_quality_reviews r WHERE r.post_id=p.id ORDER BY r.reviewed_at DESC,r.rowid DESC LIMIT 1) AS decision FROM social_posts p WHERE p.status='pending_review') GROUP BY decision"))[0]?.results||[];
const receipt={results,counts,latestDecisions};
fs.writeFileSync('product-equality-d1-receipt.json',JSON.stringify(receipt,null,2)+'\n');
console.log('PRODUCT_EQUALITY_D1_RECEIPT',JSON.stringify(receipt));
