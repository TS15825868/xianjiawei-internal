import fs from 'node:fs';
import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-archive-nearclone-30cc-20261107.json','utf8'));
const lose='XJW-CONV-chat-30-bare-jar',keep='XJW-CONV-chat-30-vs-180';
if(req.scope!=='visual-nearclone-and-repeated-jar-pouch-choice'||req.archive!==lose||req.keep!==keep||req.archiveAuthorized!==true||req.publicationAuthorized!==false)throw Error('Unsafe request');
const exp={
 'XJW-CONV-chat-30-bare-jar':{title:'今天只看一個小細節：裸罐',copy:'55820e5c13ec8f05b6f2f593c87e58d3e4e14154c19fa1744a0e5019b61b5ecf',sha:'6d2400848e25ab014b02ffacf8d4857c9e01878d4ea1963c2061c32ca67ece02',file:'XJW-CONV-chat-30-bare-jar-scene-v1.jpg'},
 'XJW-CONV-chat-30-vs-180':{title:'30cc跟180cc，怎麼選？',copy:'2a496e49e85666bb69228986acfc1a496ea6cd2137527600bc1b6e8c5c610048',sha:'823e2833d9826e6d1bede2c8612ade6473ef9cd5aa695094fcf02ab6154dac32',file:'XJW-CONV-chat-30-vs-180-scene-v1.jpg'}
};
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!db)throw Error('D1 credentials missing');
const quot=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...a){let i=0;const out=s.replace(/\?/g,()=>quot(a[i++]));if(i!==a.length)throw Error('SQL bindings mismatch');return out}
async function query(s){const u='https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query';const r=await fetch(u,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const b=await r.json();if(!r.ok||!b.success||!Array.isArray(b.result)||b.result.some(x=>x.success===false))throw Error('D1 failure');return b.result}
async function first(s,...a){return(await query(sql(s,...a)))[0]?.results?.[0]||null}
function sha(s){return crypto.createHash('sha256').update(s).digest('hex')}
const result={scope:req.scope,archive:lose,keep,archived:false,readback:false,publication:false,humanApproval:false};
try{
 const rows=await Promise.all([first('SELECT * FROM social_posts WHERE id=?',lose),first('SELECT * FROM social_posts WHERE id=?',keep)]);
 for(let i=0;i<2;i++){const p=rows[i],id=i?keep:lose,e=exp[id];if(!p||p.status!=='pending_review'||p.title!==e.title||sha(p.copy||'')!==e.copy||!p.image_url.endsWith('/'+e.file)||p.approved_by||p.approved_at||p.scheduled_at||p.published_at||Number(p.image_approved||0)!==0)throw Error('Changed or authorized source row: '+id);
  const ai=await first('SELECT id,decision,image_url,image_sha256 FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',id);
  if(ai?.decision!=='NEEDS_HUMAN_REVIEW'||ai.image_url!==p.image_url||ai.image_sha256!==e.sha)throw Error('Latest image review differs: '+id);
  const picture=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});if(!picture.ok)throw Error('Image missing: '+id);
  const raw=Buffer.from(await picture.arrayBuffer());if(sha(raw)!==e.sha)throw Error('Image SHA changed: '+id);
 }
 if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',lose))throw Error('Has remote draft');
 if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',lose))throw Error('Has delivery record');
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const u=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id) AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=social_posts.id)",'已封存：與30cc/180cc選擇稿構圖高度近似且重複罐裝/鋁袋偏好問題；原圖原文與審核證據保留。',now,lose,rows[0].updated_at,rows[0].image_url);
 const l=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','30cc候選構圖與提問重複安全封存（非核准）','貼文',?,?,?,'' WHERE changes()=1",audit,lose,JSON.stringify({status:'pending_review',sha:exp[lose].sha}),JSON.stringify({status:'archived',retained:keep,dhashHamming:11,noApproval:true}));
 const saved=await query(u+';\n'+l);
 if(saved[0]?.meta?.changes!==1||saved[1]?.meta?.changes!==1)throw Error('D1 CAS/audit mismatch');
 const back=await first('SELECT status,image_url,approved_by,approved_at,scheduled_at,published_at,proposed_scheduled_at FROM social_posts WHERE id=?',lose);
 if(back?.status!=='archived'||back.image_url!==rows[0].image_url||back.approved_by||back.approved_at||back.scheduled_at||back.published_at||back.proposed_scheduled_at)throw Error('D1 readback mismatch');
 result.archived=true;result.readback=true;result.audit=audit;
}catch(e){result.blocked=String(e.message||e)}
result.counts=(await query('SELECT status,COUNT(*) count FROM social_posts GROUP BY status'))[0]?.results||[];
fs.writeFileSync('nearclone-30cc-result.json',JSON.stringify(result,null,2)+'\n');
console.log('NEARCLONE_30CC_RESULT',JSON.stringify(result));
