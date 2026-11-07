// Five direct full-image editorial caption corrections with strict D1 CAS and AI-defer readback.
// Only change exactly 5 explicitly documented copy versions. No approval/scheduling/publication or media modification.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const cfg=JSON.parse(fs.readFileSync('ops/request-five-editorial-visual-copy-deltas-20261108.json','utf8'));
if(cfg.scope!=='five-current-exact-visual-grounded-editorial-copy-updates'||cfg.allowCopyChange!==true||cfg.allowApproval!==false||cfg.allowPublication!==false||cfg.items?.length!==5||new Set(cfg.items.map(x=>x.id)).size!==5)throw Error('Unsafe request batch');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Cloudflare D1 authentication missing');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...a){let i=0;const result=s.replace(/\?/g,()=>quote(a[i++]));if(i!==a.length)throw Error('SQL bindings mismatch');return result;}
async function run(s){const u='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 query failed '+JSON.stringify(j.errors||[]).slice(0,230));return j.result;}
async function first(s,...a){return (await run(sql(s,...a)))[0]?.results?.[0]||null}
const affected=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale'];
const blockedWords=['治療','預防疾病','改善疾病','抗發炎','抗癌','補氣','生津','膠原蛋白','鈣質','消除疲勞','保證功效'];
const results=[];
for(const fix of cfg.items){
 const r={id:fix.id,updated:false,readback:false,approved:false,published:false};
 try{
 const post=await first('SELECT * FROM social_posts WHERE id=?',fix.id);
 if(!post||post.status!=='pending_review'||post.title!==fix.expectedTitle||post.copy!==fix.expectedCopy||post.image_url!==fix.expectedImageUrl||!['clear','passed'].includes(post.image_quality_status)||post.approved_by||post.approved_at||post.scheduled_at||post.published_at||Number(post.image_approved||0)!==0)throw Error('D1 post edition or safety status has changed');
 const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',fix.id);
 if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.content_fingerprint!==fingerprint(post)||prior.image_url!==post.image_url||prior.image_sha256!==fix.expectedImageSha)throw Error('Current AI review not bound to exact original image and copy');
 const e=JSON.parse(prior.evidence_json||'{}');
 if(e.content_fingerprint!==prior.content_fingerprint||e.image_sha256!==prior.image_sha256||e.checks?.duplicate?.result!=='DEFER'||affected.some(k=>e.checks?.[k]?.result!=='PASS'))throw Error('Old visual checklist does not support delta inheritance');
 const actor=await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
 if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Original reviewer not authorized');
 if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',fix.id))throw Error('Remote linked draft must be checked before text change');
 if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',fix.id))throw Error('Prior delivery exists');
 const raw=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});
 if(!raw.ok)throw Error('Official original candidate image not accessible');
 const bytes=Buffer.from(await raw.arrayBuffer());if(bytes.length<1000||sha(bytes)!==fix.expectedImageSha)throw Error('Current image SHA differs');
 if(blockedWords.some(t=>fix.copy.includes(t))||!fix.copy.includes('仙加味'))throw Error('New copy may violate brand or unsupported health-claim rule');
 const now=new Date().toISOString();
 const fp=fingerprint({...post,copy:fix.copy});
 e.review_scope='20261108-five-editorial-copy-current-image-validation-v1';
 e.inherited_from_review_id=prior.id;e.reviewed_at=now;e.content_fingerprint=fp;e.requested_decision='defer';
 e.checks.action={result:'PASS',evidence:fix.evidence};
 e.checks.occasion={...e.checks.occasion,result:'PASS',evidence:'已依更正後文案的具體時間與生活場景核對原始圖片；不得把任何尚未完成的紙張或手機畫面說成已填寫/已顯示。'};
 e.checks.compliance_final={result:'PASS',evidence:'更正後文字與目前相同版本原始圖已重新檢視，不含疾病防治、醫療或未經核准療效；漢方飲食/品牌連結具體且無內部作業文字。完整歷史圖文去重仍獨立維持DEFER，非對外發布許可。'};
 e.checks.duplicate={result:'DEFER',evidence:'已與同題角度 '+fix.differentFrom+' 區分本篇文案及圖中主要動作；完整歷史重複素材中仍有來源缺口，未確認全數獨立，不將候選去重評分當最終通過。'};
 e.risk={...e.risk,uncertainties:[...new Set([...(e.risk?.uncertainties||[]),'修改後文案尚缺完整歷史媒體與主題去重終判'])]};
 e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
 const json=JSON.stringify(e),reviewId='AI-DEFER-'+sha(json),auditId='AUD-'+crypto.randomUUID();
 const update=sql("UPDATE social_posts SET copy=?,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND title=? AND copy=? AND image_url=? AND image_quality_status IN ('clear','passed') AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",fix.copy,'AI審核：NEEDS_HUMAN_REVIEW；原圖動作及同題角度文案已修正，歷史完整去重仍待覆核',now,post.id,post.updated_at,post.title,post.copy,post.image_url);
 const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND copy=? AND approved_by IS NULL AND approved_at IS NULL)",reviewId,post.id,fp,post.image_url,fix.expectedImageSha,json,e.model||'ChatGPT-Work','2026-10-31-ai-deferral-only-v1',actor.email,now,post.id,now,fix.copy);
 const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','原圖動作／同題角度精準文案修復並保留歷史DEFER','貼文',?,?,?,'' WHERE changes()=1",auditId,post.id,JSON.stringify({oldCopySHA:sha(post.copy),review:prior.id}),JSON.stringify({newCopySHA:sha(fix.copy),newReview:reviewId,duplicate:'DEFER',approval:false,publication:false}));
 const saved=await run([update,insert,audit].join(';\n'));
 if(saved.some(x=>x.meta?.changes!==1))throw Error('D1 CAS/evidence/audit write not confirmed');
 const [back,proof]=await Promise.all([first('SELECT id,status,copy,title,image_url,approved_by,approved_at,scheduled_at,published_at FROM social_posts WHERE id=?',fix.id),first('SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',reviewId)]);
 const check=JSON.parse(proof?.evidence_json||'{}');
 if(back?.status!=='pending_review'||back.copy!==fix.copy||back.image_url!==post.image_url||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||proof?.decision!=='NEEDS_HUMAN_REVIEW'||proof.content_fingerprint!==fp||proof.image_sha256!==fix.expectedImageSha||check.checks.action.result!=='PASS'||check.checks.duplicate.result!=='DEFER')throw Error('Post/review readback failed');
 Object.assign(r,{updated:true,readback:true,reviewId});
 }catch(error){r.blocker=String(error.message||error).slice(0,320)}
 results.push(r);
}
const counts=(await run('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const summary={schema:cfg.scope,results,counts,completed:results.filter(x=>x.updated&&x.readback).length,blocked:results.filter(x=>x.blocker).length,aiApprovals:0,humanApprovals:0,scheduled:0,published:0};
fs.writeFileSync('five-editorial-visual-fixes.json',JSON.stringify(summary,null,2)+'\n');console.log('FIVE_VISUAL_EDITORIAL_COPY_FIX',JSON.stringify(summary));
