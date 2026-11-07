// Archive only the verified pending rewording of the already-published home soup editorial angle.
// Keep the original row, image, reviews and audit; never delete external drafts or publish anything.
import fs from 'node:fs';import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-archive-overlapping-home-soup-20261107.json','utf8'));
const pending='XJW-CONV-chat-home-soup',published='XJW-20913aa0-9cfb-49f0-acae-15005a51bbaa';
if(req.scope!=='single-verified-published-editorial-overlap'||req.pending!==pending||req.published!==published||req.authorizeArchive!==true||req.authorizePublish!==false)throw Error('Unsafe archive request');
const expectedPendingTitle='你家煮湯，最常放什麼？';
const expectedPublishedTitle='這週要煮哪一道家常湯？';
const expectedPendingCopySha='c2341f1e89644920f1f989352f529c27b76a0604bffb157a941b5a87a8c5df93';
const expectedPublishedCopySha='10751ece8670ccb196dc6d111a817e00e9d7397f7dac02c1354013fe519228b6';
const expectedImage='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/assets/post-images/2026-11-04/candidates/XJW-CONV-chat-home-soup-unique-poll-v2.png';
const priorPublishedImage='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/assets/post-images/2026-10-31/cooking-safety/XJW-CONV-chat-home-soup-safety-v1.png';
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!database)throw Error('D1 API credentials absent');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...a){let i=0;const q=s.replace(/\?/g,()=>quote(a[i++]));if(i!==a.length)throw Error('parameter count');return q;}
async function run(s){const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+database+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await res.json();if(!res.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 query failure '+JSON.stringify(j.errors||[]).slice(0,250));return j.result;}
async function first(s,...a){return(await run(sql(s,...a)))[0]?.results?.[0]||null}
function sha(t){return crypto.createHash('sha256').update(String(t||'')).digest('hex')}
const record={schema:'xjw-verified-home-soup-overlap-archive-v1',pending,published,updated:false,readback:false,noHumanApproval:true,noPublication:true};
try{
 const [p,u]=await Promise.all([first('SELECT * FROM social_posts WHERE id=?',pending),first('SELECT * FROM social_posts WHERE id=?',published)]);
 if(!p||!u||p.status!=='pending_review'||u.status!=='published'||!u.published_at||p.published_at||p.scheduled_at||p.approved_at||p.approved_by||Number(p.image_approved||0)!==0)throw Error('Current statuses changed or manually approved');
 if(p.title!==expectedPendingTitle||u.title!==expectedPublishedTitle||sha(p.copy)!==expectedPendingCopySha||sha(u.copy)!==expectedPublishedCopySha)throw Error('Published/pending copy or edition changed');
 if(p.image_url!==expectedImage||u.image_url!==priorPublishedImage)throw Error('Image lineage changed');
 if(!/家常|煮湯|湯鍋/.test(p.copy)||!/家常|煮湯|湯鍋/.test(u.copy))throw Error('Editorial topic proof no longer matches');
 const link=await first('SELECT post_id,state FROM social_metricool_sync WHERE post_id=? LIMIT 1',pending);
 if(link)throw Error('Pending post has remote Metricool linkage; preserve and reconcile first');
 const attempts=await first("SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1",pending);
 if(attempts)throw Error('Delivery record present; no automatic archive');
 const latest=await first('SELECT id,decision,image_url FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',pending);
 if(!latest||latest.decision!=='NEEDS_HUMAN_REVIEW'||latest.image_url!==p.image_url)throw Error('Current defer review not proven');
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const old={status:p.status,copySha:sha(p.copy),imageUrl:p.image_url,imageQuality:p.image_quality_status,sourceReview:latest.id};
 const after={status:'archived',reason:'same_family_soup_editorial_question_as_20261103_published;current_scene_raw_cooked_separation_unresolved;prior_safe_image_already_published',publishedPostId:published,publishedCopySha:sha(u.copy),noPublish:true,noDelete:true};
 const update=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND title=? AND approved_at IS NULL AND approved_by IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'已封存：與2026/11/03已發布家常湯提問主題實質重疊，且新圖生熟分區證據不足；保留原稿及圖像供歷史稽核。',now,pending,p.updated_at,p.image_url,p.title);
 const log=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','已發布實質重複主題安全封存（非核准發布）','貼文',?,?,?,'' WHERE changes()=1",audit,pending,JSON.stringify(old),JSON.stringify(after));
 const result=await run(update+';\n'+log);
 if(result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1)throw Error('CAS update/audit not confirmed');
 const back=await first('SELECT id,status,review_note,approved_at,approved_by,scheduled_at,published_at,image_url,proposed_scheduled_at FROM social_posts WHERE id=?',pending);
 if(back?.status!=='archived'||back.approved_at||back.approved_by||back.scheduled_at||back.published_at||back.proposed_scheduled_at||back.image_url!==p.image_url)throw Error('Archive readback mismatch');
 record.updated=true;record.readback=true;record.archiveAudit=audit;record.sourceReview=latest.id;record.publishedReceiptId=published;
}catch(e){record.blocked=String(e.message||e)}
record.counts=(await run('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
record.quality=(await run("SELECT image_quality_status,COUNT(*) count FROM social_posts WHERE status='pending_review' GROUP BY image_quality_status"))[0]?.results||[];
fs.writeFileSync('home-soup-archive-result.json',JSON.stringify(record,null,2)+'\n');
console.log('HOME_SOUP_ARCHIVE_RESULT',JSON.stringify(record));
