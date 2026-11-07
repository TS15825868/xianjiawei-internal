// Archive an unverifiable ingredient-list advertisement, retain original and safely hold its linked draft.
// No assertion that old or new label is wrong: current source-version disagreement remains unresolved.
import fs from 'node:fs';import crypto from 'node:crypto';
const req=JSON.parse(fs.readFileSync('ops/request-hold-180cc-label-conflict-20261107.json','utf8'));
const id='XJW-0663bdeb-49aa-46bf-8a41-95a14486f425',remoteId=413610836,uuid='-7982498099912555116';
if(req.scope!=='unresolved-real-package-label-order-and-remote-draft-hold'||req.id!==id||req.archiveAuthorized!==true||req.publishAuthorized!==false||req.deleteExternal!==false)throw Error('Unsafe request');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!acct||!token||!db)throw Error('D1 auth missing');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...p){let i=0;const out=s.replace(/\?/g,()=>quote(p[i++]));if(i!==p.length)throw Error('SQL arg mismatch');return out}
async function q(s){const url='https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query';const r=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 remote call failed '+JSON.stringify(j.errors||[]).slice(0,170));return j.result}
async function one(s,...p){return(await q(sql(s,...p)))[0]?.results?.[0]||null}
const result={id,metricoolId:remoteId,remoteStillDraft:true,remoteAutoPublish:false,archive:false,readback:false,approval:false,publish:false,remoteDeleted:false};
try{
 const [p,l,rv]=await Promise.all([
 one('SELECT * FROM social_posts WHERE id=?',id),
 one('SELECT * FROM social_metricool_sync WHERE post_id=?',id),
 one('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',id)]);
 if(!p||p.status!=='pending_review'||p.title!=='龜鹿飲180cc鋁袋裡，有哪些成分？'||sha(String(p.copy||''))!=='3d8997a9be9a150838dba84ebdee690cf95f6674a139bc5eabd77a22c709ef39'||p.approved_at||p.approved_by||p.published_at||p.scheduled_at||Number(p.image_approved||0)!==0)throw Error('Current source edition or safety state changed');
 const e=JSON.parse(rv?.evidence_json||'{}');
 if(rv?.decision!=='NEEDS_HUMAN_REVIEW'||rv.image_url!==p.image_url||rv.image_sha256!=='be6c09f2537a703a255e9f82de511c70ce233d7c5403d4cd42f222e3e02e4a52'||e.checks?.specification?.result!=='DEFER'||!e.risk?.uncertainties?.includes('current_label_version_conflict'))throw Error('Current ingredient-version conflict proof absent');
 if(!l||Number(l.metricool_id)!==remoteId||String(l.uuid)!==uuid||l.state!=='pending_review'||Number(l.attempts||0)!==0)throw Error('Linked draft no longer controlled');
 const remote=JSON.parse(l.template_json||'{}');
 if(remote.id!==remoteId||remote.uuid!==uuid||remote.draft!==true||remote.autoPublish!==false||remote.text!==p.copy||remote.providers?.length!==3||remote.providers.some(x=>x.status!=='PENDING'))throw Error('Exact stopped remote draft no longer proven');
 if(await one('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',id))throw Error('Publishing delivery already exists');
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const hold=sql("UPDATE social_metricool_sync SET state='cancel_required',last_error=?,updated_at=? WHERE post_id=? AND metricool_id=? AND uuid=? AND state='pending_review' AND COALESCE(attempts,0)=0",'180cc真實標示與最新成分順序版本衝突未確認；原草稿停發保留，禁止對客發布',now,id,remoteId,uuid);
 const archive=sql("UPDATE social_posts SET status='archived',proposed_scheduled_at=NULL,review_note=?,updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND approved_at IS NULL AND approved_by IS NULL AND published_at IS NULL AND scheduled_at IS NULL AND EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id AND metricool_id=? AND uuid=? AND state='cancel_required')",'已封存待確認：180cc真實鋁袋標示與主檔成分順序存在版本差異；未確認前不宣稱成分，保留原始文案/圖片/證據；Metricool遠端仍草稿停發。',now,id,p.updated_at,p.image_url,remoteId,uuid);
 const log=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','真實180cc標示版本待核證候選安全封存（非退定/核准/發布）','貼文',?,?,?,'' WHERE changes()=1",audit,id,JSON.stringify({postStatus:p.status,remoteState:l.state}),JSON.stringify({postStatus:'archived',remoteState:'cancel_required',labelConflictUnresolved:true,copyPreserved:true,externalDraftDeleted:false}));
 const wr=await q([hold,archive,log].join(';\n'));if(wr.some(x=>x.meta?.changes!==1))throw Error('D1 CAS/archive/audit changes mismatch');
 const [pb,lb]=await Promise.all([one('SELECT status,approved_by,approved_at,published_at,scheduled_at,image_url FROM social_posts WHERE id=?',id),one('SELECT metricool_id,uuid,state FROM social_metricool_sync WHERE post_id=?',id)]);
 if(pb?.status!=='archived'||pb.approved_by||pb.approved_at||pb.published_at||pb.scheduled_at||pb.image_url!==p.image_url||Number(lb?.metricool_id)!==remoteId||String(lb?.uuid)!==uuid||lb.state!=='cancel_required')throw Error('Post and sync D1 readback mismatch');
 result.archive=true;result.readback=true;result.auditId=audit;
}catch(error){result.blocker=String(error.message||error)}
result.counts=(await q('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
fs.writeFileSync('180cc-conflict-safe-archive-result.json',JSON.stringify(result,null,2)+'\n');
console.log('180CC_CONFLICT_SAFE_ARCHIVE',JSON.stringify(result));
