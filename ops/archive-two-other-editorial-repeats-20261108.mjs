// Safe archive of two confirmed editorial angle repeats, not a bulk status reset.
// Preserve source, images and review history. Verify present AI/image SHA, published proof, D1 CAS and readback.
import fs from 'node:fs';
import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-two-other-repeated-editorial-angles-20261108.json','utf8'));
if(req.scope!=='two-deduplicated-food-intro-and-soup-angles'||req.archiveAuthorized!==true||req.approveAuthorized!==false||req.publishAuthorized!==false)throw Error('Unsafe archive request');
const items=[
 {id:'XJW-CONV-chat-simple-soup',title:'一鍋湯，其實不用放得很複雜',copySha:'10d4e2e6685e34cdd330f757766804e8f6ee64944a7a9fcaa467c6be64854346',imageSha:'aeee6148d25dc04e8ca0f07d1dddcd0b6b7c42a215e86f6866fae35fbd569fe9',imageSuffix:'/assets/post-images/2026-10-09/quality-upgrade/XJW-CONV-chat-simple-soup-scene-v2.jpg',kind:'publishedD1',publishedId:'XJW-20913aa0-9cfb-49f0-acae-15005a51bbaa',terms:['雞腿','排骨','食材'],why:'已發布11/03家常湯以雞湯與排骨湯作互動提問；此篇重新用雞腿/排骨問最常搭配哪些食材，實質料理選材角度重疊。'},
 {id:'XJW-CAND-20270309',title:'在家認識龜鹿膏，從100g罐裝開始',copySha:'939a6246f0c0e49409dcc5e69bf64b3925c78152f0907c2d71148f3027d3d5de',imageSha:'c19e4fcd03799606b29d1e4745bebca9088e5fde471c3a536c498778b06bdac7',imageSuffix:'/media/social-candidates/20261106/XJW-CAND-20270309-v2.webp',kind:'publishedIG',publishedId:'4012639510524863731_78424002938',terms:['龜鹿膏','100g','標示'],why:'IG 2026/10/21已介紹龜鹿膏100g罐裝、使用方式、保存標示；新稿仍以在桌面介紹100g規格及依標示取用作同一商品入門角度，換季及換場景不足以視為新內容。'}
];
if(req.ids?.join('|')!==items.map(x=>x.id).join('|'))throw Error('Request IDs mismatch');
const historic=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8'));
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('Cloudflare credentials unavailable');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const t=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('SQL arg mismatch');return t}
async function query(s){
 const url='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';
 const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 API failed '+JSON.stringify(j.errors||[]).slice(0,200));
 return j.result;
}
async function one(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
for(const spec of items){
 const res={postId:spec.id,archived:false,readback:false,approval:false,publishing:false,source:spec.publishedId};
 try{
  let sourceURL='';
  if(spec.kind==='publishedD1'){
   const published=await one('SELECT id, status, copy, published_at FROM social_posts WHERE id=?',spec.publishedId);
   if(published?.status!=='published'||!published.published_at||!['雞腿','香菇','排骨湯'].every(w=>published.copy.includes(w)))throw Error('Published soup source not verifiable');
  }else{
   const published=historic.records.instagram.find(x=>x.postId===spec.publishedId);
   if(!published||!published.permalink?.startsWith('https://www.instagram.com/p/')||!published.content.includes('龜鹿膏')||!published.content.includes('100g')||!published.content.includes('保存'))throw Error('Published 100g jar source not verifiable');
   sourceURL=published.permalink;
  }
  const p=await one('SELECT * FROM social_posts WHERE id=?',spec.id);
  if(!p||p.status!=='pending_review'||p.title!==spec.title||sha(p.copy||'')!==spec.copySha||!p.image_url.endsWith(spec.imageSuffix)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0||!spec.terms.every(w=>p.copy.includes(w)))throw Error('Current original post changed or already approved');
  const prev=await one('SELECT id,decision,image_url,image_sha256 FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',spec.id);
  if(prev?.decision!=='NEEDS_HUMAN_REVIEW'||prev.image_url!==p.image_url||prev.image_sha256!==spec.imageSha)throw Error('Current AI/image evidence changed');
  if(await one('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',spec.id))throw Error('Remote Metricool draft requires separate cancel-hold handling');
  if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',spec.id))throw Error('Delivery already exists');
  const pic=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
  if(!pic.ok||sha(Buffer.from(await pic.arrayBuffer()))!==spec.imageSha)throw Error('Real present image SHA changed');
  const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
  const change=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND title=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'已封存：'+spec.why+(sourceURL?' 已發文來源：'+sourceURL:'')+'；原圖原文審核保留，不發布、不刪除。',now,spec.id,p.updated_at,p.title,p.image_url);
  const log=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','已發同角度重複稿精準封存（原始證據保留）','貼文',?,?,?,'' WHERE changes()=1",audit,spec.id,JSON.stringify({status:p.status,contentHash:spec.copySha,imageHash:spec.imageSha}),JSON.stringify({status:'archived',publishedSource:spec.publishedId,sourceURL,reason:spec.why,noApproval:true,noPublish:true}));
  const writes=await query(change+';\n'+log);
  if(writes[0]?.meta?.changes!==1||writes[1]?.meta?.changes!==1)throw Error('D1 CAS/audit mutation did not match');
  const back=await one('SELECT status,image_url,approved_by,approved_at,published_at,scheduled_at,proposed_scheduled_at FROM social_posts WHERE id=?',spec.id);
  if(back?.status!=='archived'||back.image_url!==p.image_url||back.approved_by||back.approved_at||back.published_at||back.scheduled_at||back.proposed_scheduled_at)throw Error('D1 archive readback mismatch');
  Object.assign(res,{archived:true,readback:true,audit});
 }catch(e){res.blocker=String(e.message||e)}
 results.push(res);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status'))[0]?.results||[];
const report={schema:req.scope,checkedAt:new Date().toISOString(),results,counts,newAIApproval:0,newHumanApproval:0,newSchedules:0,newPublications:0,noExternalDeletes:true};
fs.writeFileSync('two-other-editorial-duplicates-results.json',JSON.stringify(report,null,2)+'\n');
console.log('TWO_OTHER_EDITORIAL_ARCHIVES',JSON.stringify(report));
