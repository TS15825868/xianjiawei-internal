// Seven manual angle-and-visual verdicts to CURRENT bound AI records. Only enrich DEFER; never confer approval.
import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fingerprint}=require('../tools/metricool-free-evidence.cjs');
const input=JSON.parse(fs.readFileSync('ops/seven-angle-evidence-20261107.json','utf8'));
if(input.scope!=='seven-current-editorial-angle-independence-with-historical-media-gaps'||input.allowApproval!==false||input.allowPublish!==false||input.records.length!==7)throw Error('Unsafe evidence batch');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!acct||!token||!db)throw Error('D1 credentials unavailable');
const h=v=>crypto.createHash('sha256').update(v).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function q(s,...v){let i=0;const out=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL binds');return out;}
async function exec(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const d=await r.json();if(!r.ok||!d.success||!Array.isArray(d.result)||d.result.some(x=>x.success===false))throw Error('D1 error '+JSON.stringify(d.errors||[]).slice(0,100));return d.result;}
async function one(s,...a){return(await exec(q(s,...a)))[0]?.results?.[0]||null}
const results=[];
for(const target of input.records){const output={id:target.id,proofAdded:false,readback:false,aiApproved:false};
try{
 const p=await one('SELECT * FROM social_posts WHERE id=?',target.id);
 if(!p||p.status!=='pending_review'||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0||!['clear','passed'].includes(p.image_quality_status))throw Error('Current post not safely pending');
 const prev=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',target.id);
 if(!prev||prev.decision!=='NEEDS_HUMAN_REVIEW'||prev.content_fingerprint!==fingerprint(p)||prev.image_url!==p.image_url||!prev.image_sha256)throw Error('Current AI review / fingerprint mismatch');
 const e=JSON.parse(prev.evidence_json||'{}');
 if(e.content_fingerprint!==prev.content_fingerprint||e.image_sha256!==prev.image_sha256||e.checks?.duplicate?.result!=='DEFER')throw Error('Duplicate still deferred / image proof mismatch');
 const original=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!original.ok||h(Buffer.from(await original.arrayBuffer()))!==prev.image_sha256)throw Error('Original image current SHA changed');
 const actor=await one('SELECT email,role,active FROM profiles WHERE email=?',prev.authorized_by);
 if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Existing AI reviewer not authorized');
 const now=new Date().toISOString();
 e.review_scope='20261107-seven-judged-editorial-angles-remain-defer-v1';
 e.reviewed_at=now;
 e.inherited_from_review_id=prev.id;
 e.independent_editorial_angle_review={scope:'currently readable FB74/IG35/Threads23 + direct inspected original scene + prior image-neighbor map; remaining 15 historical media inaccessible',verdict:target.verdict,evidence:target.detail,notCompleteHistoricalVisualCertification:true};
 e.checks.duplicate={result:'DEFER',evidence:'已完成本篇對已知歷史主題的獨立實質判定：'+target.detail+'；其餘15筆無法取得之歷史媒體及輪播子圖仍未核實，不得宣稱全歷史去重完成。'};
 e.requested_decision='defer';e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
 const str=JSON.stringify(e),id='AI-DEFER-'+h(str),audit='AUD-'+crypto.randomUUID();
 const insert=q("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND image_quality_status IN ('clear','passed'))",id,target.id,prev.content_fingerprint,p.image_url,prev.image_sha256,str,e.model||'ChatGPT-Work','2026-10-31-ai-deferral-only-v1',actor.email,now,target.id,p.updated_at,p.image_url);
 const log=q("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','當前七篇獨立情境角度補證（完整歷史仍DEFER）','貼文',?,?,?,'' WHERE changes()=1",audit,target.id,JSON.stringify({review:prev.id,decision:prev.decision}),JSON.stringify({review:id,decision:'NEEDS_HUMAN_REVIEW',editorialVerdict:target.verdict}));
 const saved=await exec(insert+';\n'+log);if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('CAS evidence / audit no changes');
 const back=await one('SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',id);
 const check=JSON.parse(back?.evidence_json||'{}');
 if(back?.decision!=='NEEDS_HUMAN_REVIEW'||back?.content_fingerprint!==prev.content_fingerprint||back?.image_sha256!==prev.image_sha256||check.independent_editorial_angle_review?.verdict!==target.verdict||check.checks.duplicate.result!=='DEFER')throw Error('D1 evidence readback mismatch');
 output.proofAdded=true;output.readback=true;output.reviewId=id;
}catch(error){output.blocker=String(error.message||error).slice(0,300)}results.push(output)}
const counts=(await exec('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
const report={schema:input.scope,results,counts,completed:results.filter(x=>x.proofAdded&&x.readback).length,aiApprovals:0,humanApprovals:0,scheduled:0,published:0};
fs.writeFileSync('seven-editorial-angle-receipts.json',JSON.stringify(report,null,2)+'\n');console.log('SEVEN_EDITORIAL_ANGLE_RECEIPTS',JSON.stringify(report));
