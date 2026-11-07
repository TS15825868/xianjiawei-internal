// Safe, version-checked D1 quality-only batch. Never grants AI/human approval.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const cfg=JSON.parse(fs.readFileSync('ops/request-quality-clear-batch-20261107.json','utf8'));
if(cfg.scope!=='clear-only-current-evidenced-visual-holds'||cfg.allowApproval!==false||cfg.allowPublication!==false)throw Error('Unsafe batch configuration');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!database)throw Error('Missing Cloudflare D1 credentials');
const quote=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
const sql=(pattern,...values)=>{let i=0;const q=pattern.replace(/\?/g,()=>quote(values[i++]));if(i!==values.length)throw Error('SQL binding mismatch');return q};
async function execute(s){
 const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const body=await res.json();if(!res.ok||!body.success||!Array.isArray(body.result)||body.result.some(x=>x.success===false))throw Error('Remote D1 query failure: '+JSON.stringify(body.errors||[]).slice(0,350));
 return body.result;
}
async function first(pattern,...args){return (await execute(sql(pattern,...args)))[0]?.results?.[0]||null}
async function rows(pattern,...args){return (await execute(sql(pattern,...args)))[0]?.results||[]}
const checks=['brand','product','specification','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale'];
const acceptedScopes=new Set(['20261104-seven-historical-media-recovery-increment','20261104-preserved-successful-pixel-evidence-supplement','20261107-current-fingerprint-inherited-visual-delta']);
const results=[];const actorCache=new Map();
const candidates=await rows("SELECT * FROM social_posts WHERE status='pending_review' AND image_quality_status='needs_review' ORDER BY id ASC");
for(const post of candidates){
 try {
  if(post.approved_by||post.approved_at||post.published_at||post.scheduled_at||Number(post.image_approved||0)!==0)throw Error('Safety state changed');
  const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',post.id);
  if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.reviewer_type!=='AI')throw Error('Current AI deferral proof not found');
  const e=JSON.parse(prior.evidence_json||'{}');
  if(!acceptedScopes.has(e.review_scope)||prior.content_fingerprint!==fingerprint(post)||e.content_fingerprint!==fingerprint(post))throw Error('Image/copy fingerprint not current');
  if(prior.image_url!==post.image_url||e.image_url!==post.image_url||!/^https:\/\/raw\.githubusercontent\.com\/TS15825868\/xianjiawei-internal\/main\//.test(String(post.image_url||'')))throw Error('Source image URL mismatch');
  if(!/^[a-f0-9]{64}$/.test(String(prior.image_sha256||''))||e.image_sha256!==prior.image_sha256||e.visual?.image_sha256!==prior.image_sha256)throw Error('Image SHA evidence mismatch');
  for(const k of checks)if(e.checks?.[k]?.result!=='PASS'||String(e.checks[k].evidence||'').trim().length<12)throw Error('Visual checklist not independently PASS: '+k);
  if(e.checks?.duplicate?.result!=='DEFER')throw Error('Unsafe historical duplicate decision');
  if(!actorCache.has(prior.authorized_by))actorCache.set(prior.authorized_by,await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by));
  const actor=actorCache.get(prior.authorized_by);
  if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Authorized reviewer not active');
  const external=await first('SELECT state FROM social_metricool_sync WHERE post_id=? LIMIT 1',post.id);
  if(external&&!['draft','pending_review'].includes(String(external.state||'')))throw Error('Non-draft remote linkage');
  const delivery=await first("SELECT post_id FROM social_publish_deliveries WHERE post_id=? AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')) LIMIT 1",post.id);
  if(delivery)throw Error('Existing publication attempt');
  const response=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('Current image not reachable: '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<1000||bytes.length>8000000)throw Error('Suspicious image size');
  if(crypto.createHash('sha256').update(bytes).digest('hex')!==prior.image_sha256)throw Error('Actual image SHA differs');
  const now=new Date().toISOString(),newFp=fingerprint({...post,image_quality_status:'clear'});
  e.review_scope='20261107-safe-batch-current-image-quality-rebind-v1';
  e.content_fingerprint=newFp;e.reviewed_at=now;e.inherited_from_review_id=prior.id;
  e.reviewer_type='AI';e.post_id=post.id;e.requested_decision='defer';e.model=String(e.model||'ChatGPT-Work');
  e.risk={...e.risk,uncertainties:['歷史構圖、視覺近似、文案與主題去重仍待完整結論；圖片品質clear不構成AI或人工核准']};
  e.checks.duplicate={result:'DEFER',evidence:'已有檔案SHA、感知雜湊與文案相似候選，尚缺完整的歷史構圖與語意判定及15項未取得來源，維持defer。'};
  e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
  const serialized=JSON.stringify(e);
  const id='AI-DEFER-'+crypto.createHash('sha256').update(serialized).digest('hex');
  const audit='AUD-'+crypto.randomUUID();
  const update=sql("UPDATE social_posts SET image_quality_status='clear',review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND image_quality_status='needs_review' AND approved_by IS NULL AND approved_at IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND COALESCE(image_approved,0)=0",'AI審核：NEEDS_HUMAN_REVIEW；歷史構圖及主題去重待完成',now,post.id,post.updated_at,post.image_url);
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND status='pending_review' AND image_quality_status='clear' AND COALESCE(image_approved,0)=0 AND approved_by IS NULL)",id,post.id,newFp,post.image_url,prior.image_sha256,serialized,e.model,'2026-10-31-ai-deferral-only-v1',actor.email,now,post.id,now);
  const auditSql=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','既有獨立視覺證據批次釐清（非人工核准）','貼文',?,?,?,'' WHERE changes()=1",audit,post.id,JSON.stringify({quality:'needs_review',fingerprint:fingerprint(post)}),JSON.stringify({quality:'clear',sourceReview:prior.id,sha256:prior.image_sha256,dedup:'DEFER',humanApproval:false}));
  const saved=await execute([update,insert,auditSql].join(';\n'));
  if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1||saved[2]?.meta?.changes!==1)throw Error('CAS or evidence write failed; check D1 before retrying');
  const back=await first('SELECT id,status,image_quality_status,approved_by,approved_at,scheduled_at,published_at,image_approved,updated_at FROM social_posts WHERE id=?',post.id);
  const backProof=await first('SELECT id,decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?',id);
  if(back?.status!=='pending_review'||back?.image_quality_status!=='clear'||back?.approved_by||back?.approved_at||back?.scheduled_at||back?.published_at||back?.image_approved||backProof?.decision!=='NEEDS_HUMAN_REVIEW'||backProof?.content_fingerprint!==newFp||backProof?.image_sha256!==prior.image_sha256)throw Error('Readback did not match expected safe deferral');
  results.push({id:post.id,result:'quality_clear_and_current_deferral_read_back',reviewId:id});
 }catch(error){results.push({id:post.id,result:'blocked_preserved_or_requires_check',reason:String(error.message||error).slice(0,350)})}
}
const counts=await rows('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status');
const quality=await rows("SELECT image_quality_status,COUNT(*) AS count FROM social_posts WHERE status='pending_review' GROUP BY image_quality_status");
const output={schema:'xjw-safe-full-pending-quality-batch-v1',scope:cfg.scope,scanned:candidates.length,completed:results.filter(x=>x.result==='quality_clear_and_current_deferral_read_back').length,blocked:results.filter(x=>x.result!=='quality_clear_and_current_deferral_read_back').length,results,counts,quality,aiApprovalsGranted:0,humanApprovalsGranted:0,externalSchedulesCreated:0,publicationsPerformed:0};
fs.writeFileSync('safe-quality-clear-batch-results.json',JSON.stringify(output,null,2)+'\n');
console.log('SAFE_QUALITY_BATCH_SUMMARY',JSON.stringify({scanned:output.scanned,completed:output.completed,blocked:output.blocked,counts,quality}));
