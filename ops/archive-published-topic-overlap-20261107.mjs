// Archive only exact-current duplicate editorial angles independently observed on official published Instagram history.
// No ad, approval, scheduling, deletion or reposting. All changes must be read back.
import fs from 'node:fs';import crypto from 'node:crypto';
const cfg=JSON.parse(fs.readFileSync('ops/request-published-topic-archive-20261107.json','utf8'));
if(cfg.scope!=='published-ig-content-overlap-two-current-pending'||cfg.approve!==false||cfg.publish!==false||cfg.archiveAuthorization!==true||cfg.items.length!==2)throw Error('Unsafe request');
const expected={
 'XJW-CONV-chat-30-vs-180':{title:'30cc跟180cc，怎麼選？',copy:'2a496e49e85666bb69228986acfc1a496ea6cd2137527600bc1b6e8c5c610048',image:'823e2833d9826e6d1bede2c8612ade6473ef9cd5aa695094fcf02ab6154dac32',historic:'3987433427959660289_78424002938',pendingTerms:['30cc','180cc','鋁袋','小玻璃'],historicTerms:['30cc','180cc','鋁袋','怎麼選']},
 'XJW-CONV-chat-trial-first':{title:'想先了解，再決定也可以',copy:'fdf45d7dc56c9019da9fad6413e3a7e28c3a57f02a45f7a1ea0a8fb0f13c0708',image:'47fad428d814e3c20cdce1e4c617793c1977b30038ccaef88d4ff729f4464954',historic:'3957491164539558820_78424002938',pendingTerms:['第一次接觸','龜鹿飲','試喝','不一定要馬上決定'],historicTerms:['先試喝','再決定','試喝組','初次認識']}
};
const history=JSON.parse(fs.readFileSync('ops/metricool-instagram-threads-published-history-20261105.json','utf8')).records.instagram;
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('D1 secrets unavailable');
function sha(x){return crypto.createHash('sha256').update(x).digest('hex')}
const quote=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const out=s.replace(/\?/g,()=>quote(v[i++]));if(i!==v.length)throw Error('Bad bind count');return out}
async function run(s){const u='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 failure '+JSON.stringify(j.errors||[]).slice(0,120));return j.result}
async function one(s,...p){return(await run(sql(s,...p)))[0]?.results?.[0]||null}
const results=[];
for(const req of cfg.items){const id=req.id,e=expected[id],result={id,preserved:true,archived:false,readback:false,publication:false};try{
 if(!e||req.historic!==e.historic)throw Error('Unapproved target/history pairing');
 const hist=history.find(x=>x.postId===e.historic);
 if(!hist||!hist.permalink?.startsWith('https://www.instagram.com/p/')||!e.historicTerms.every(t=>hist.content.includes(t)))throw Error('Published historical source not verified');
 const p=await one('SELECT * FROM social_posts WHERE id=?',id);
 if(!p||p.status!=='pending_review'||p.title!==e.title||sha(p.copy||'')!==e.copy||p.approved_at||p.approved_by||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0||!e.pendingTerms.every(t=>p.copy.includes(t)))throw Error('Current pending copy/state changed');
 const ai=await one('SELECT id,decision,image_sha256,image_url FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',id);
 if(!ai||ai.decision!=='NEEDS_HUMAN_REVIEW'||ai.image_sha256!==e.image||ai.image_url!==p.image_url)throw Error('Latest original image evidence mismatch');
 const photo=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!photo.ok||sha(Buffer.from(await photo.arrayBuffer()))!==e.image)throw Error('Current exact image changed');
 if(await one('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',id))throw Error('Remote draft needs separate reconciliation');
 if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',id))throw Error('Delivery record exists');
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const upd=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'已封存：同主題已於Instagram發布；歷史貼文'+hist.permalink+'；保留本篇所有原圖與審核紀錄，不重複發文。',now,id,p.updated_at,p.image_url);
 const ins=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','已發布同主題貼文精準封存（非核准）','貼文',?,?,?,'' WHERE changes()=1",audit,id,JSON.stringify({status:'pending_review',image_sha256:e.image,copy_sha256:e.copy}),JSON.stringify({status:'archived',publishedSource:hist.permalink,sourceID:e.historic,approved:false,published:false}));
 const saved=await run(upd+';\n'+ins);if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('CAS/audit changes mismatch');
 const back=await one('SELECT status,image_url,approved_by,approved_at,published_at,scheduled_at,proposed_scheduled_at FROM social_posts WHERE id=?',id);
 if(back?.status!=='archived'||back.image_url!==p.image_url||back.approved_by||back.approved_at||back.published_at||back.scheduled_at||back.proposed_scheduled_at)throw Error('Archived version readback mismatch');
 Object.assign(result,{archived:true,readback:true,publishedSource:hist.permalink,audit});
 }catch(error){result.reason=String(error.message||error)}results.push(result)}
const counts=(await run('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
const report={scope:cfg.scope,results,counts,noAIApproval:true,noHumanApproval:true,noScheduling:true,noPublication:true};
fs.writeFileSync('published-topic-archive-results.json',JSON.stringify(report,null,2)+'\n');
console.log('PUBLISHED_TOPIC_ARCHIVE_RESULTS',JSON.stringify(report));
