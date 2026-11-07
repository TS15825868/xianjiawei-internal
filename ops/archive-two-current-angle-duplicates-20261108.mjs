// Archive only current evidence-confirmed overlapping editorial angles. Keep every picture, caption, and audit.
import fs from 'node:fs';
import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-two-current-angle-duplicates-20261108.json','utf8'));
const groups=[
 {archive:{id:'XJW-CONV-chat-old-methods',title:'有些老方法，為什麼到現在還有人在做？',copySha:'c561311039aa774d6f81682963ff28c8c5af4569e2a990736e16f8986b1f593f',imageSha:'1bdee3f0a396a8928196ffd57996fcc581479ca2d77154a3fb22e02bd63be105',path:'/assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-old-methods-audit-v1.jpg'},keep:{id:'XJW-CONV-chat-craft-years',title:'一件事情做久了，還會覺得新鮮嗎？',copySha:'b67fc553b8a6b75a1ad4be572381bdd58027e44e4ff1e025cb277cb5666c33d5',imageSha:'504c4a3873aef3f7a18b513f01179e495e8000e3f2954a17d8c24425da4165d0',path:'/assets/post-images/2026-10-10/formal-production/XJW-CONV-chat-craft-years-scene-v3.jpg'},angle:'家族傳統工藝持續保存、累積經驗並整理成今天可理解的作法。老方法稿未提供比具體鹿角與熬膠工藝稿更獨立的實質內容。'},
 {archive:{id:'XJW-CONV-chat-brand-not-only-product',title:'為什麼有些貼文不放產品？',copySha:'5a3eb12c8d0ae260a9f61be4257ce2c084605b3d2541bd27360ee62af0ba5174',imageSha:'a148b548444905e5b8f10b45680cd8c99462f7440baeb72741d4ac3fede6938e',path:'/assets/post-images/2026-10-09/quality-upgrade/XJW-CONV-chat-brand-not-only-product.jpg'},keep:{id:'XJW-CONV-chat-ask-boss-topic',title:'今天如果不聊產品，你想跟小老闆聊什麼？',copySha:'1d35cfb13185197bc0348ec7b18590c35e7302e30506ebe80ef10e65147861f3',imageSha:'a7ac0e6b871ad2fa7abca873b2db8f289f58b22ba87b8a965317cb1f1ed494f9',path:'/assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-ask-boss-topic-audit-v1.jpg'},angle:'兩篇都以為何品牌社群不只介紹產品、而改聊料理/萬華/舊家習慣為核心；保留具有具體互動行動的提問稿，不重發同一非產品主題理由。'}
];
if(req.scope!=='two-current-inventory-editorial-overlap'||req.allowArchive!==true||req.allowPublication!==false||req.ids?.join('|')!==groups.map(x=>x.archive.id).join('|'))throw Error('Unsafe request scope');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!acct||!token||!db)throw Error('Missing D1 credentials');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const out=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL arg count');return out;}
async function exec(s){const res=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const body=await res.json();if(!res.ok||!body.success||!Array.isArray(body.result)||body.result.some(x=>x.success===false))throw Error('D1 query failed '+JSON.stringify(body.errors||[]).slice(0,180));return body.result;}
async function first(s,...v){return(await exec(sql(s,...v)))[0]?.results?.[0]||null;}
const results=[];
for(const pair of groups){
 let result={id:pair.archive.id,retained:pair.keep.id,archived:false,readback:false,approved:false,published:false};
 try{
  const current=await Promise.all([first('SELECT * FROM social_posts WHERE id=?',pair.archive.id),first('SELECT * FROM social_posts WHERE id=?',pair.keep.id)]);
  for(let i=0;i<2;i++){
   const p=current[i],e=i===0?pair.archive:pair.keep;
   if(!p||p.status!=='pending_review'||p.title!==e.title||sha(p.copy||'')!==e.copySha||!p.image_url.endsWith(e.path)||p.approved_by||p.approved_at||p.published_at||p.scheduled_at||Number(p.image_approved||0)!==0)throw Error('Current post source changed or approved '+e.id);
   const r=await first('SELECT decision,image_url,image_sha256 FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',e.id);
   if(r?.decision!=='NEEDS_HUMAN_REVIEW'||r.image_url!==p.image_url||r.image_sha256!==e.imageSha)throw Error('Current AI image evidence mismatch '+e.id);
   const source=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!source.ok)throw Error('Source image no longer accessible '+e.id);
   if(sha(Buffer.from(await source.arrayBuffer()))!==e.imageSha)throw Error('Raw image SHA no longer valid '+e.id);
  }
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',pair.archive.id))throw Error('Pending external linked Metricool draft must be reviewed and held first');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',pair.archive.id))throw Error('Existing publication deliveries need separate review');
  const now=new Date().toISOString(),auditId='AUD-'+crypto.randomUUID(),p=current[0];
  const update=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND title=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'編輯去重封存：'+pair.angle+' 保留原圖、文案及舊審核記錄；較具體獨立版本 '+pair.keep.id+' 繼續待審；未核准、未發布。',now,p.id,p.updated_at,p.title,p.image_url);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','同批次實質角度重複稿安全封存','貼文',?,?,?,'' WHERE changes()=1",auditId,p.id,JSON.stringify({status:p.status,title:p.title,copySha:pair.archive.copySha,imageSha:pair.archive.imageSha}),JSON.stringify({status:'archived',retainedActivePost:pair.keep.id,reason:pair.angle,approval:false,publishing:false}));
  const writes=await exec(update+';\n'+audit);
  if(writes[0]?.meta?.changes!==1||writes[1]?.meta?.changes!==1)throw Error('D1 CAS update/audit changes mismatch');
  const back=await first('SELECT status,image_url,approved_by,approved_at,published_at,scheduled_at,proposed_scheduled_at FROM social_posts WHERE id=?',p.id);
  if(back?.status!=='archived'||back.image_url!==p.image_url||back.approved_by||back.approved_at||back.published_at||back.scheduled_at||back.proposed_scheduled_at)throw Error('Archived row readback mismatch');
  result.archived=true;result.readback=true;result.auditId=auditId;
 }catch(error){result.blocker=String(error.message||error)}
 results.push(result);
}
const counts=(await exec('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
const out={schema:req.scope,results,counts,approvals:0,schedules:0,publications:0};
fs.writeFileSync('two-current-angle-duplicates-results.json',JSON.stringify(out,null,2)+'\n');
console.log('TWO_CURRENT_ANGLE_ARCHIVES',JSON.stringify(out));
