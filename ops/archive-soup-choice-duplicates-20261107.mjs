// Exact-current, evidence-backed safe archival of two chicken-vs-pork soup polls.
// Preserves photos, captions, review history. Does not grant approvals or publish.
import fs from 'node:fs';import crypto from 'node:crypto';
const request=JSON.parse(fs.readFileSync('ops/request-soup-choice-dedup-batch-20261107.json','utf8'));
const publishedId='XJW-20913aa0-9cfb-49f0-acae-15005a51bbaa';
const entries=[
 {id:'XJW-CONV-chat-deer-turtle-soup-choice',title:'今天讓小鹿跟小烏龜來選',copySha:'9bdde6e0321327a77d9b71247ed4441728d326aa27dcdbccd4acfda34597ae9b',imageSha:'9f116a7f1a991676a462b8ecc82a261f9b4b9236e391ad26fb7a3de34f8c4f0d',file:'XJW-CONV-chat-deer-turtle-soup-choice-safety-v1.png',term:'雞腿還是排骨'},
 {id:'XJW-CONV-cny-first-soup',title:'年假後第一鍋湯，你會選雞還是排骨？',copySha:'879b7e3b0879fc67cc62093e088200d4f1e3c933e1531dd1a7de077617426cfd',imageSha:'ca1aa0dbc6f4cc4d2935cb8cd2ef7e1a0a8792a4318ab01f4fcd05ca41962eb7',file:'XJW-CONV-cny-first-soup-safety-v1.png',term:'雞湯或排骨湯'}
];
if(request.scope!=='two-published-overlapping-chicken-pork-soup-polls'||request.archiveApproved!==true||request.publishApproved!==false||request.targets?.join('|')!==entries.map(x=>x.id).join('|'))throw Error('Unsafe or stale request');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];if(!token||!account||!db)throw Error('Missing D1 credentials');
const h=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(pattern,...v){let i=0;const s=pattern.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL bind count');return s;}
async function query(s){const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const x=await r.json();if(!r.ok||!x.success||!Array.isArray(x.result)||x.result.some(a=>a.success===false))throw Error('D1 API error '+JSON.stringify(x.errors||[]).slice(0,200));return x.result}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const out={schema:'xjw-two-duplicate-soup-polls-v1',base:'published-Nov3-three-platforms',results:[],noHumanApproval:true,noScheduling:true,noPublishing:true};
const pub=await first('SELECT id,status,title,copy,published_at FROM social_posts WHERE id=?',publishedId);
if(!pub||pub.status!=='published'||!pub.published_at||!pub.copy.includes('雞湯')||!pub.copy.includes('排骨湯'))throw Error('Published source unavailable, no posts touched');
for(const spec of entries){
 const result={id:spec.id,archive:false,readback:false,sourcePublishedId:publishedId};
 try{
  const p=await first('SELECT * FROM social_posts WHERE id=?',spec.id);
  if(!p||p.status!=='pending_review'||p.title!==spec.title||h(p.copy||'')!==spec.copySha||!p.copy.includes(spec.term)||!p.image_url.endsWith('/'+spec.file)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Current original post changed or already approved');
  const ai=await first('SELECT id,decision,image_sha256,image_url FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',spec.id);
  if(ai?.decision!=='NEEDS_HUMAN_REVIEW'||ai.image_sha256!==spec.imageSha||ai.image_url!==p.image_url)throw Error('Current AI evidence changed');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',spec.id))throw Error('Active Metricool remote linkage; cancel separately');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',spec.id))throw Error('Prior publication attempt exists');
  const f=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!f.ok)throw Error('Original picture not fetchable');if(h(Buffer.from(await f.arrayBuffer()))!==spec.imageSha)throw Error('Current picture bytes changed');
  const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
  const changed=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND title=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'已封存：核心投票雞湯或排骨湯與2026/11/03三平台已發布家常湯提問重疊，原稿、圖片及AI歷史保留，避免換句話重發。',now,spec.id,p.updated_at,p.title,p.image_url);
  const log=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','已發布同角度雞排骨湯投票去重安全封存','貼文',?,?,?,'' WHERE changes()=1",audit,spec.id,JSON.stringify({status:p.status,sourceSha:spec.imageSha,copySha:spec.copySha}),JSON.stringify({status:'archived',publishedId,published_at:pub.published_at,noApproval:true,noPublication:true}));
  const write=await query(changed+';\n'+log);
  if(write[0]?.meta?.changes!==1||write[1]?.meta?.changes!==1)throw Error('D1 version CAS or audit not written');
  const back=await first('SELECT status,image_url,approved_by,approved_at,scheduled_at,published_at,proposed_scheduled_at FROM social_posts WHERE id=?',spec.id);
  if(back?.status!=='archived'||back.image_url!==p.image_url||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||back.proposed_scheduled_at)throw Error('D1 readback failed');
  Object.assign(result,{archive:true,readback:true,auditId:audit});
 }catch(error){result.blocker=String(error.message||error)}out.results.push(result);
}
out.counts=(await query('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
out.quality=(await query("SELECT image_quality_status,COUNT(*) count FROM social_posts WHERE status='pending_review' GROUP BY image_quality_status"))[0]?.results||[];
fs.writeFileSync('two-soup-poll-dedup-results.json',JSON.stringify(out,null,2)+'\n');
console.log('TWO_SOUP_POLL_DEDUP',JSON.stringify(out));
