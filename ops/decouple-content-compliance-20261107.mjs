// Correct a conflated compliance-only check; historical duplication remains DEFER.
// This is not an overall go-live approval, and performs no post status mutation.
import fs from 'node:fs';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-decouple-compliance-review-20261107.json','utf8'));
if(req.scope!=='only-decouple-content-compliance-from-history-duplicate'||req.allowAIApproval!==false||req.allowHumanApproval!==false||req.allowPublish!==false)throw Error('Unsafe request');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!acct||!token||!db)throw Error('D1 credentials absent');
const quot=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const out=s.replace(/\?/g,()=>quot(v[i++]));if(i!==v.length)throw Error('SQL binds wrong');return out;}
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('Cloudflare query failure '+JSON.stringify(j.errors||[]).slice(0,220));return j.result;}
async function one(s,...p){return(await query(sql(s,...p)))[0]?.results?.[0]||null}
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const deny=['治療','改善疾病','預防疾病','補氣','生津','膠原蛋白','鈣質','關節','卡卡','精神不濟','保證功效','抗發炎','抗癌','修復細胞','增強免疫','有效降血壓','醫療效能','消除疲勞'];
const checkKeys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale'];
const posts=(await query("SELECT * FROM social_posts WHERE status='pending_review' ORDER BY id LIMIT 110"))[0]?.results||[];
const results=[];
for(const p of posts){
 const outcome={id:p.id,updated:false};
 try{
  if(!['clear','passed'].includes(p.image_quality_status)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Safety state changed');
  const r=await one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
  if(!r||r.decision!=='NEEDS_HUMAN_REVIEW'||r.content_fingerprint!==fingerprint(p)||r.image_url!==p.image_url)throw Error('Current version not bound');
  const e=JSON.parse(r.evidence_json||'{}');
  if(e.content_fingerprint!==r.content_fingerprint||e.image_sha256!==r.image_sha256||e.checks?.duplicate?.result!=='DEFER')throw Error('Duplicate review not safely held');
  if(e.checks?.compliance_final?.result!=='DEFER'){outcome.skipped='not_compliance_defer';results.push(outcome);continue;}
  if(checkKeys.some(k=>e.checks?.[k]?.result!=='PASS'))throw Error('Other independent review check incomplete');
  if(!String(e.checks.compliance_final.evidence||'').includes('未見')||!String(e.checks.compliance_final.evidence||'').includes('療效'))throw Error('Prior independent medical-claim review does not explicitly say no claims');
  if(deny.some(w=>(p.title+' '+p.copy).includes(w)))throw Error('Needs manual examination of potentially prohibited wording');
  const actor=await one('SELECT email,role,active FROM profiles WHERE email=?',r.authorized_by);
  if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('AI evidence author no longer authorized');
  const data=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!data.ok||sha(Buffer.from(await data.arrayBuffer()))!==r.image_sha256)throw Error('Current image hash mismatch');
  e.review_scope='20261107-independent-claims-compliance-not-publishing-gate-v1';
  e.inherited_from_review_id=r.id;
  e.reviewed_at=new Date().toISOString();
  e.checks.compliance_final={result:'PASS',evidence:'本項僅逐字和已保存原尺寸圖片檢查是否出現不實、療效、醫療或內部用語；現版未見違規效果宣稱。依《食品安全衛生管理法》第28條及《食品及相關產品標示宣傳廣告涉及不實誇張易生誤解或醫療效能認定準則》第3至5條，文案/圖片整體表現需另行符合規範。歷史去重仍為DEFER，本PASS不代表最終對外發布資格。'};
  e.checks.duplicate={...e.checks.duplicate,result:'DEFER'};
  e.risk={...e.risk,level:'MEDIUM',uncertainties:[...new Set([...(e.risk?.uncertainties||[]),'歷史圖片/構圖/語意去重未完整完成，不可授權發布'])]};
  e.publication={...e.publication,approved:false,auto_publish:false,auto_schedule:false};
  e.requested_decision='defer';
  const serialized=JSON.stringify(e),id='AI-DEFER-'+sha(serialized),aud='AUD-'+crypto.randomUUID();
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND image_url=? AND image_quality_status IN ('clear','passed') AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL)",id,p.id,r.content_fingerprint,p.image_url,r.image_sha256,serialized,e.model||'ChatGPT-Work','2026-10-31-ai-deferral-only-v1',actor.email,e.reviewed_at,p.id,p.updated_at,p.image_url);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','文案合規檢查與未完成去重解耦補證（不核准）','貼文',?,?,?,'' WHERE changes()=1",aud,p.id,JSON.stringify({review:r.id,compliance:'DEFER',duplicate:'DEFER'}),JSON.stringify({review:id,compliance:'PASS',duplicate:'DEFER',release:false}));
  const saved=await query(insert+';\n'+audit);
  if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('D1 insert/audit result mismatch');
  const read=await one('SELECT decision,content_fingerprint,evidence_json FROM social_post_quality_reviews WHERE id=?',id);
  const ee=JSON.parse(read?.evidence_json||'{}');
  if(read?.decision!=='NEEDS_HUMAN_REVIEW'||read.content_fingerprint!==r.content_fingerprint||ee.checks.compliance_final.result!=='PASS'||ee.checks.duplicate.result!=='DEFER')throw Error('D1 readback not safe');
  outcome.updated=true;outcome.reviewId=id;
 }catch(error){outcome.blocker=String(error.message||error).slice(0,220)}
 results.push(outcome);
}
const counts=(await query('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
const out={schema:req.scope,totalScanned:posts.length,success:results.filter(x=>x.updated).length,blocked:results.filter(x=>x.blocker).length,results,counts,aiApprovals:0,humanApprovals:0,published:0,scheduled:0};
fs.writeFileSync('independent-compliance-review-results.json',JSON.stringify(out,null,2)+'\n');
console.log('INDEPENDENT_COMPLIANCE_REVIEW',JSON.stringify({totalScanned:out.totalScanned,success:out.success,blocked:out.blocked,blockers:results.filter(x=>x.blocker).slice(0,10),counts}));
