import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const cfg=JSON.parse(fs.readFileSync('ops/request-last-two-quality-evidence-20261107.json','utf8'));
const expected={
 'XJW-CONV-chat-fixed-storage':{sha:'d35515ad1c0ed02dad9865decfb10f41aa6dc27a626dd99e9872f5a2a82af7b8',priorId:'AI-DEFER-60982cfbd4f3ae4cd877461a5df9ab4e8f5c8e898a6416eaf33810f3dc9d49fe',scope:'20261104-duplicate-copy-remediation-not-human-approval',observation:'已獨立目視原始1254px完整圖：短黑髮大眼小老闆、米白中式衣、深橄欖綠圍裙及紅色直式仙加味印章符合正式角色核心；左側小鹿與右側小龜獨立完整。領巾及眼鏡差異屬配件，使用者正式規則未限定固定有無，不能因舊配件比對退件。手拿木匙朝抽屜移動，沒有宣稱正在烹煮。'},
 'XJW-CONV-new-year-slow-start':{sha:'22b5ec499b3b45156cb450ff44ad3d283fd8fe781cd067a851cd8b66627bc808',priorId:'AI-DEFER-ecd44b106360928cd34e00a0df5a02f330dc949dff06f754f5d01ba60e5f9769',scope:'20261104-seven-historical-media-recovery-increment',observation:'已獨立目視原始1254px完整圖：小老闆米白中式衣、深橄欖綠圍裙與紅直式印章，手持鉛筆在筆記本描繪植物；左小鹿右小龜分開，不融合，年節梅花與福字同場。核心角色符合正式設定，配件非不合格依據。'}
};
if(cfg.scope!=='two-current-visual-checks-safe-rebind'||cfg.allowApproval!==false||cfg.allowPublication!==false||JSON.stringify(cfg.ids)!==JSON.stringify(Object.keys(expected)))throw Error('Unsafe batch configuration');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!database)throw Error('D1 credentials missing');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function q(s,...a){let i=0;const out=s.replace(/\?/g,()=>quote(a[i++]));if(i!==a.length)throw Error('binding count mismatch');return out;}
async function execute(sql){const response=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});const j=await response.json();if(!response.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 API query failed '+JSON.stringify(j.errors||[]).slice(0,220));return j.result;}
async function one(sql,...args){return(await execute(q(sql,...args)))[0]?.results?.[0]||null}
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','physical_scale'];
const refUrl='https://raw.githubusercontent.com/TS15825868/xianjiawei/main/images/posts/formal-v20260904/first-post-work-rest-qmascot.webp';
const refSha='0c73c6cd5a4ac8942a89d160838789744a813f617536e8d8c26260867ccf14d2';
const results=[];
let trustedRef=false;
for(const [id,policy] of Object.entries(expected)){try{
 const post=await one('SELECT * FROM social_posts WHERE id=?',id);
 if(!post||post.status!=='pending_review'||post.image_quality_status!=='needs_review'||post.scheduled_at||post.published_at||post.approved_at||post.approved_by||Number(post.image_approved||0)!==0)throw Error('Current post status no longer safe');
 const prior=await one('SELECT * FROM social_post_quality_reviews WHERE id=? AND post_id=?',policy.priorId,id);
 if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.reviewer_type!=='AI'||prior.content_fingerprint!==fingerprint(post)||prior.image_url!==post.image_url||prior.image_sha256!==policy.sha)throw Error('Current bound AI review absent or mismatched');
 const e=JSON.parse(prior.evidence_json||'{}');
 if(e.review_scope!==policy.scope||e.content_fingerprint!==fingerprint(post)||e.image_sha256!==policy.sha||(e.visual?.image_sha256&&e.visual.image_sha256!==policy.sha))throw Error('Unverified visual evidence version');
 if(e.checks?.mascot_companions?.result!=='DEFER'||e.checks?.duplicate?.result!=='DEFER'||keys.some(k=>e.checks?.[k]?.result!=='PASS'))throw Error('Not eligible for companion-only evidence delta');
 const profile=await one('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
 if(!profile?.active||!['admin','owner'].includes(profile.role))throw Error('Reviewer role cannot anchor AI evidence');
 const linked=await one('SELECT state FROM social_metricool_sync WHERE post_id=? LIMIT 1',id);
 if(linked&&!['pending_review','draft'].includes(String(linked.state||'')))throw Error('Remote draft linkage not safe');
 const delivered=await one("SELECT post_id FROM social_publish_deliveries WHERE post_id=? AND (COALESCE(attempt_count,0)>0 OR published_at IS NOT NULL OR last_attempt_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>'' OR status IN ('sending','retry','published','manual_required','permanent_failed')) LIMIT 1",id);
 if(delivered)throw Error('Existing publication or attempt');
 const res=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});if(!res.ok)throw Error('Current source unavailable '+res.status);
 const data=Buffer.from(await res.arrayBuffer());if(data.length<1000||data.length>7000000||crypto.createHash('sha256').update(data).digest('hex')!==policy.sha)throw Error('Actual image SHA mismatch');
 if(!trustedRef){
  const ref=await fetch(refUrl,{signal:AbortSignal.timeout(30000)});if(!ref.ok)throw Error('Reference not reachable');
  const raw=Buffer.from(await ref.arrayBuffer());const digest=crypto.createHash('sha256').update(raw).digest('hex');
  if(digest!==refSha)throw Error('Official reference SHA changed; cannot claim identity verified: '+digest);
  trustedRef=true;
 }
 const now=new Date().toISOString();
 const updated={...post,image_quality_status:'clear'};
 e.review_scope='20261107-companion-core-independent-visual-check-v1';
 e.inherited_from_review_id=prior.id;
 e.reviewed_at=now;
 e.content_fingerprint=fingerprint(updated);
 e.checks.mascot_companions={result:'PASS',evidence:policy.observation};
 e.checks.duplicate={result:'DEFER',evidence:'歷史圖片構圖與文字主題逐篇去重尚未完成，15個歷史來源無法取得，保留完整歷史去重阻擋。'};
 e.risk={...e.risk,uncertainties:['完整已發布歷史圖文語意及構圖去重尚未完成']};
 e.visual={...e.visual,image_sha256:policy.sha,mascot_reference:{url:refUrl,sha256:refSha,verified_sha256:true,role_core_not_exact_accessories:true}};
 e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
 e.requested_decision='defer';e.reviewer_type='AI';e.post_id=id;
 const serialized=JSON.stringify(e),reviewId='AI-DEFER-'+crypto.createHash('sha256').update(serialized).digest('hex'),auditId='AUD-'+crypto.randomUUID();
 const upd=q("UPDATE social_posts SET image_quality_status='clear',review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND image_quality_status='needs_review' AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",'AI審核：NEEDS_HUMAN_REVIEW；角色核心已獨立目視核對；歷史圖文去重仍待完成',now,id,post.updated_at,post.image_url);
 const insert=q("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND updated_at=? AND image_quality_status='clear' AND approved_by IS NULL)",reviewId,id,e.content_fingerprint,post.image_url,policy.sha,serialized,e.model,'2026-10-31-ai-deferral-only-v1',profile.email,now,id,now);
 const audit=q("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','角色核心來源補證（非人工核准）','貼文',?,?,?,'' WHERE changes()=1",auditId,id,JSON.stringify({status:post.status,quality:'needs_review',reviewId:prior.id}),JSON.stringify({status:'pending_review',quality:'clear',reviewId,approved:false,dedup:'DEFER'}));
 const saved=await execute([upd,insert,audit].join(';\n'));
 if(saved.some(x=>x.meta?.changes!==1))throw Error('Write CAS/evidence/audit mismatch, check before retry');
 const [postBack,reviewBack]=await Promise.all([one('SELECT status,image_quality_status,approved_by,approved_at,scheduled_at,published_at,image_approved FROM social_posts WHERE id=?',id),one('SELECT decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?',reviewId)]);
 if(postBack?.status!=='pending_review'||postBack.image_quality_status!=='clear'||postBack.approved_by||postBack.approved_at||postBack.scheduled_at||postBack.published_at||Number(postBack.image_approved||0)!==0||reviewBack?.decision!=='NEEDS_HUMAN_REVIEW'||reviewBack.content_fingerprint!==e.content_fingerprint||reviewBack.image_sha256!==policy.sha)throw Error('Versioned D1 readback failed');
 results.push({id,status:'quality_clear_with_current_defer_readback',sourceReview:prior.id,newReview:reviewId});
}catch(error){results.push({id,status:'blocked_preserved',reason:String(error.message||error).slice(0,320)})}}
const counts=(await execute("SELECT status,COUNT(*) count FROM social_posts GROUP BY status"))[0]?.results||[];
const quality=(await execute("SELECT image_quality_status,COUNT(*) count FROM social_posts WHERE status='pending_review' GROUP BY image_quality_status"))[0]?.results||[];
fs.writeFileSync('last-two-quality-results.json',JSON.stringify({schema:'xjw-two-safe-cast-reviews-v1',results,counts,quality,aiApprovals:0,humanApprovals:0,scheduled:0,published:0},null,2)+'\n');
console.log('LAST_TWO_QUALITY_RESULTS',JSON.stringify({results,quality,counts}));
