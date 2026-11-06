import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {recordAiDeferral} from '../src/ai-review-deferral.js';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const config=JSON.parse(fs.readFileSync('ops/scene-candidate-binding-20261106.json','utf8'));
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!database||!token||!account||config.humanApproval!==false)throw Error('Missing credentials or unsafe approval config');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
async function execute(sql){
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});
 const body=await response.json();if(!response.ok||!body.success||!Array.isArray(body.result)||body.result.some(x=>x.success===false))throw Error('D1 query failed; read back before retrying');return body.result;
}
function prepare(sql){return{values:[],bind(...values){this.values=values;return this},sql(){let i=0;const result=sql.replace(/\?/g,()=>quote(this.values[i++]));if(i!==this.values.length)throw Error('SQL parameter mismatch');return result},async run(){return(await execute(this.sql()))[0]},async first(){return(await execute(this.sql()))[0]?.results?.[0]||null},async all(){return(await execute(this.sql()))[0]}}}
const DB={prepare,async batch(statements){return execute(statements.map(x=>x.sql()).join(';\n'))}};
const report={sourceMain:process.env.GITHUB_SHA,generatedCandidates:config.items.length,results:[],approved:0,scheduled:0,published:0};
const save=()=>fs.writeFileSync('scene-candidate-results.json',JSON.stringify(report,null,2)+'\n');
const profile=await DB.prepare('SELECT email,role,active FROM profiles WHERE email=?').bind(config.authorized_by).first();
if(!profile?.active||!['owner','admin'].includes(profile.role))throw Error('No authorized manager');
if(new Set(config.items.map(x=>x.postId)).size!==config.items.length)throw Error('Duplicate candidate post ID');
for(const item of config.items){
 try{
  if(!/^media\/social-candidates\/20261106\/XJW-CAND-\d{8}\.webp$/.test(item.path))throw Error('Unsafe image path');
  const bytes=fs.readFileSync(item.path);if(crypto.createHash('sha256').update(bytes).digest('hex')!==item.sha256||bytes.length!==item.bytes)throw Error('Image hash mismatch');
  if(!item.bind){report.results.push({id:item.postId,state:'candidate_rejected_not_bound',reason:item.qc});save();continue;}
  const url='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/'+item.path;
  let row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(item.postId).first();
  if(!row||row.title!==(item.newTitle||item.expectedTitle)&&row.title!==item.expectedTitle||row.copy!==item.expectedCopy)throw Error('Current copy differs from inspected candidate; preserved');
  const source='ChatGPT Work 獨立情境候選｜正式角色參考 first-post-work-rest-qmascot.webp｜'+item.sha256+'｜待原尺寸角色核對及歷史去重；未人工核准';
  if(!row.image_url){
   if(row.status!=='draft'||row.published_at||row.scheduled_at||row.approved_by||row.image_approved)throw Error('Current status unsafe for candidate binding');
   const now=new Date().toISOString(),auditId='AUD-'+crypto.randomUUID();
   const results=await DB.batch([
    DB.prepare("UPDATE social_posts SET title=?,image_url=?,image_alt=?,image_source=?,image_width=?,image_height=?,image_bytes=?,image_quality_status='needs_review',image_approved=0,status='pending_review',approved_by=NULL,approved_at=NULL,scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND title=? AND copy=? AND COALESCE(image_url,'')='' AND status='draft' AND published_at IS NULL AND scheduled_at IS NULL AND approved_by IS NULL AND COALESCE(image_approved,0)=0 AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND state NOT IN ('draft','pending_review')) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id AND (COALESCE(attempt_count,0)>0 OR last_attempt_at IS NOT NULL OR published_at IS NOT NULL OR TRIM(COALESCE(remote_id,''))<>''))")
     .bind(item.newTitle||row.title,url,item.alt,source,item.width,item.height,item.bytes,'新情境候選已回填；初步場景檢視完成，原尺寸角色、歷史去重與最終品質未通過；不核准、不排程、不發布',now,row.id,row.updated_at,row.title,row.copy),
    DB.prepare('INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,?,?,?,?,?,?,? WHERE changes()=1')
     .bind(auditId,'chatgpt-work:AI','獨立情境候選回填（未核准）','貼文',row.id,JSON.stringify({status:row.status,updated_at:row.updated_at,image_url:row.image_url}),JSON.stringify({image_url:url,sha256:item.sha256,quality:'needs_review',humanApproved:false}),''),
    DB.prepare('DELETE FROM social_post_review_gates WHERE post_id=? AND EXISTS(SELECT 1 FROM audit_logs WHERE id=?)').bind(row.id,auditId)
   ]);
   if(results[0]?.meta?.changes!==1||results[1]?.meta?.changes!==1)throw Error('CAS did not update; preserved current version');
  }
  row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(item.postId).first();
  if(row.image_url!==url||row.status!=='pending_review'||row.approved_by||row.scheduled_at||row.published_at||row.image_approved||row.image_quality_status!=='needs_review')throw Error('Candidate readback failed');
  const fp=fingerprint(row);
  const prior=await DB.prepare("SELECT id FROM social_post_quality_reviews WHERE post_id=? AND content_fingerprint=? AND image_sha256=? AND decision='NEEDS_HUMAN_REVIEW' LIMIT 1").bind(row.id,fp,item.sha256).first();
  let result={review_id:prior?.id,idempotent:true};
  if(!prior){
   const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
   const checks=Object.fromEntries(keys.map(k=>[k,{result:'DEFER',evidence:`候選圖場景初檢已完成；${k} 須對照本篇原尺寸圖片與正式來源獨立完整覆核，不把製圖提示或縮圖當成通過證據。`}]));
   checks.brand={result:'PASS',evidence:'已檢視本篇完整文案，品牌連結使用仙加味；未使用台興山產名稱。'};
   checks.pricing_activity={result:'PASS',evidence:'本篇文案無售價、優惠、試喝份數或交期承諾，無需沿用歷史促銷。'};
   checks.duplicate={result:'DEFER',evidence:'這是本輪為本篇獨立生成的新圖；仍缺完整歷史輪播子圖及跨平台原文對應，不能宣稱歷史去重通過。'};
   checks.mascot_companions={result:'DEFER',evidence:'以官網已發布角色圖為參考，初檢可見米白中式上衣、綠圍裙、紅直章與分開夥伴；原尺寸眼型、臉型、印章與比例仍需獨立覆核。'};
   const evidence={reviewer_type:'AI',model:'ChatGPT-Work',post_id:row.id,requested_decision:'defer',content_fingerprint:fp,image_url:url,image_sha256:item.sha256,reviewed_at:new Date().toISOString(),checks,risk:{level:'MEDIUM',uncertainties:['候選原尺寸16項獨立視覺覆核尚未完成','正式角色細節逐張比對尚未完成','歷史輪播子圖及跨平台去重證據不足']},visual:{image_sha256:item.sha256,scene_summary:item.alt,products_visible:false,product_assets:[]},publication:{approved:false,auto_publish:false,auto_schedule:false}};
   result=await recordAiDeferral({DB},row,evidence,profile,{fingerprint,ensureAiSchema:async()=>{}});
  }
  const proof=await DB.prepare('SELECT id,post_id,decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?').bind(result.review_id).first();
  if(!proof||proof.content_fingerprint!==fp||proof.image_sha256!==item.sha256)throw Error('AI deferral readback failed');
  report.results.push({id:row.id,state:'candidate_bound_and_defer_read_back',image_url:url,sha256:item.sha256,review_id:proof.id,decision:proof.decision,fullVisualApproved:false,humanApproved:false});save();
 }catch(error){report.results.push({id:item.postId,state:'blocked_preserved',reason:error.message});save();}
}
report.counts=(await execute('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0].results;
report.remainingImages=(await execute("SELECT id,title,status FROM social_posts WHERE status NOT IN ('archived','published') AND COALESCE(image_url,'')=''"))[0].results;
save();console.log(JSON.stringify({counts:report.counts,results:report.results.map(x=>({id:x.id,state:x.state,reason:x.reason})),approved:0,scheduled:0,published:0}));
if(report.results.some(x=>x.state==='blocked_preserved'))process.exitCode=1;
