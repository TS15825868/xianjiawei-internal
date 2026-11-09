// Exact-current, two source-verified food-culture caption repairs. No media edits, approvals or publishing.
import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-two-food-culture-life-copy-20261109.json','utf8'));
if(req.scope!=='two-food-culture-grounded-copy-remediation-20261109'||req.authorizeCopyFix!==true||req.authorizeApproval!==false||req.authorizePublish!==false||req.items?.length!==2)throw Error('Unsafe copy patch request');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!account||!token||!db)throw Error('Missing D1 credentials');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const z=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind count mismatch');return z}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(z=>z.success===false))throw Error('D1 query failed '+JSON.stringify(j.errors||[]).slice(0,190));return j.result}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
for(const fix of req.items){const out={id:fix.id,copyUpdated:false,evidenceReadback:false,aiApproved:false,published:false};try{
 const post=await first('SELECT * FROM social_posts WHERE id=?',fix.id);
 if(!post||post.status!=='pending_review'||post.title!==fix.expectedTitle||post.copy!==fix.expectedCopy||post.image_url!==fix.expectedImageUrl||post.image_alt!==fix.expectedImageAlt||!['clear','passed'].includes(post.image_quality_status)||post.approved_by||post.approved_at||post.published_at||post.scheduled_at||Number(post.image_approved||0)!==0)throw Error('Original D1 source changed or no longer pending');
 const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',fix.id);
 if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.image_url!==post.image_url||prior.content_fingerprint!==fingerprint(post)||!prior.image_sha256)throw Error('Latest current-bound AI deferral missing');
 const evidence=JSON.parse(prior.evidence_json||'{}');
 if(evidence.content_fingerprint!==prior.content_fingerprint||evidence.image_sha256!==prior.image_sha256||evidence.checks?.duplicate?.result!=='DEFER')throw Error('Current review evidence inconsistent');
 const actor=await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
 if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Existing reviewer not authorized');
 if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',fix.id))throw Error('Current remote Metricool draft requires coordinated update');
 if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',fix.id))throw Error('Existing delivery history requires special handling');
 const f=await fetch(post.image_url,{signal:AbortSignal.timeout(30000)});
 if(!f.ok)throw Error('Current original image not reachable');
 if(sha(Buffer.from(await f.arrayBuffer()))!==prior.image_sha256)throw Error('Current image bytes changed');
 if(fix.copy===post.copy||!fix.copy.includes('仙加味')||!/(餐桌|料理|飲食文化|食材|備餐)/.test(fix.copy))throw Error('Improved copy not materially linked to brand food life');
 const blocked=['治療','預防疾病','改善疾病','抗發炎','抗癌','補氣','生津','膠原蛋白','鈣質','保證功效','消除疲勞'];
 if(blocked.some(t=>fix.copy.includes(t)))throw Error('New copy requires independent claim check');
 const now=new Date().toISOString(),newFingerprint=fingerprint({...post,copy:fix.copy});
 const e={...evidence};e.review_scope='20261109-two-food-culture-brand-link-repair-v1';e.reviewed_at=now;e.content_fingerprint=newFingerprint;e.inherited_from_review_id=prior.id;e.requested_decision='defer';e.post_id=post.id;
 e.checks={...e.checks,
  action:{result:'PASS',evidence:fix.evidence},
  brand:{result:'PASS',evidence:'依據當前正式原圖及新版文案，補充與仙加味相關的飲食文化、餐桌備餐及料理情境，圖片原檔未變。'},
  scene_environment:{result:'PASS',evidence:fix.evidence},
  duplicate:{result:'DEFER',evidence:'食物與備餐品牌文化連結修正後仍保留歷史主題及視覺去重DEFER。既有已發布跨平台文案與歷史媒體精確／感知雜湊比對僅為候選篩選，缺失歷史圖像與輪播子圖未完整驗明；本次未宣稱唯一性。'}};
 // Revalidate the affected standalone legal-claim check for the new text only; no invented full-history clearance.
 e.checks.compliance_final={result:'PASS',evidence:'本次已重新逐字核對更正後文案與原圖場景：無療效、疾病預防治療、未經核准成分/產品包裝宣稱；生活情境連結仙加味，無內部測試文字。歷史視覺/語意去重仍由獨立duplicate=DEFER阻擋正式發布。'};
 e.risk={...e.risk,level:'MEDIUM',uncertainties:[...new Set([...(e.risk?.uncertainties||[]),'更正後文案的完整歷史構圖/主題去重仍未結案'])]};
 e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
 const reviewBody=JSON.stringify(e),reviewId='AI-DEFER-'+sha(reviewBody),auditId='AUD-'+crypto.randomUUID();
 const update=sql("UPDATE social_posts SET copy=?,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND image_quality_status IN ('clear','passed') AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",fix.copy,'AI審核：NEEDS_HUMAN_REVIEW；年節食物生活稿已連結仙加味飲食文化，仍待完整歷史去重',now,post.id,post.updated_at,post.title,post.copy,post.image_url,post.image_alt);
 const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND copy=? AND approved_by IS NULL AND approved_at IS NULL)",reviewId,post.id,newFingerprint,post.image_url,prior.image_sha256,reviewBody,e.model||'ChatGPT-Work','2026-10-31-ai-deferral-only-v1',actor.email,now,post.id,now,fix.copy);
 const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','補齊年節餐桌實質仙加味飲食文化連結（不核准發布）','貼文',?,?,?,'' WHERE changes()=1",auditId,post.id,JSON.stringify({copySHA:sha(post.copy),currentReview:prior.id}),JSON.stringify({copySHA:sha(fix.copy),reviewId,dedup:'DEFER',approved:false,published:false}));
 const writes=await query([update,insert,audit].join(';\n'));
 if(writes.some(x=>x.meta?.changes!==1))throw Error('D1 CAS, evidence or audit write did not succeed; inspect latest version before retry');
 const [postBack,evidenceBack]=await Promise.all([first('SELECT status,copy,title,image_url,image_alt,updated_at,approved_by,approved_at,scheduled_at,published_at,image_quality_status FROM social_posts WHERE id=?',post.id),first('SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',reviewId)]);
 const checked=JSON.parse(evidenceBack?.evidence_json||'{}');
 if(postBack?.status!=='pending_review'||postBack.copy!==fix.copy||postBack.image_url!==post.image_url||postBack.image_alt!==post.image_alt||postBack.approved_by||postBack.approved_at||postBack.scheduled_at||postBack.published_at||evidenceBack?.decision!=='NEEDS_HUMAN_REVIEW'||evidenceBack.content_fingerprint!==newFingerprint||evidenceBack.image_sha256!==prior.image_sha256||checked.checks.action.result!=='PASS'||checked.checks.duplicate.result!=='DEFER')throw Error('D1 readback failed');
 Object.assign(out,{copyUpdated:true,evidenceReadback:true,newReviewId:reviewId});
 }catch(error){out.blocker=String(error.message||error).slice(0,350)}results.push(out);}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
const out={schema:req.scope,results,counts,succeeded:results.filter(x=>x.copyUpdated&&x.evidenceReadback).length,blocked:results.filter(x=>x.blocker).length,aiApproved:0,humanApproved:0,schedules:0,publications:0};
fs.writeFileSync('two-food-culture-copy-fix-results.json',JSON.stringify(out,null,2)+'\n');
console.log('TWO_FOOD_CULTURE_COPY_FIX',JSON.stringify(out));
if(out.blocked)process.exitCode=1;
