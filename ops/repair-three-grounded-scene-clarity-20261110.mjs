// Two source-grounded, per-version scene-location consistency updates. Preserve DEFER and original media.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const {fingerprint}=createRequire(import.meta.url)('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-three-grounded-scene-clarity-20261110.json','utf8'));
const ids=["XJW-CONV-chat-recipe-or-feel","XJW-CONV-cny-fridge-clean","XJW-CONV-chat-last-bowl"];
if(req.scope!=='xjw-three-grounded-current-scene-clarity-20261110-v1'||
 req.authorizeFix!==true||req.authorizeApproval!==false||req.authorizePublish!==false||
 req.items?.length!==3||req.items.some((x,i)=>x.id!==ids[i]||!['copy','image_alt'].includes(x.field)||!x.evidence||x.evidence.length<90))throw Error('Unsafe scope');
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!token||!account||!db)throw Error('Missing Cloudflare credentials');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
const q=x=>x===null||x===undefined?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
function sql(s,...v){let i=0;const result=s.replace(/\?/g,()=>q(v[i++]));if(i!==v.length)throw Error('SQL bind count mismatch');return result}
async function query(s){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',
 {method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(45000)});
 const j=await r.json();
 if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))
  throw Error('D1 API failure '+JSON.stringify(j.errors||[]).slice(0,180));
 return j.result;
}
async function first(s,...v){return(await query(sql(s,...v)))[0]?.results?.[0]||null}
const results=[];
for(const fix of req.items){
 const out={id:fix.id,field:fix.field,updated:false,readback:false,approved:false,published:false};
 try{
  const p=await first('SELECT * FROM social_posts WHERE id=?',fix.id);
  if(!p||p.status!=='pending_review'||p.title!==fix.expectedTitle||p.copy!==fix.expectedCopy||
   p.image_url!==fix.expectedImageUrl||p.image_alt!==fix.expectedImageAlt||
   !['clear','passed'].includes(p.image_quality_status)||p.approved_by||p.approved_at||
   p.published_at||p.scheduled_at||Number(p.image_approved||0)!==0)throw Error('Live source no longer matches preimage');
  const prior=await first('SELECT * FROM social_post_quality_reviews WHERE post_id=? ORDER BY reviewed_at DESC LIMIT 1',p.id);
  if(!prior||prior.decision!=='NEEDS_HUMAN_REVIEW'||prior.image_url!==p.image_url||
   prior.content_fingerprint!==fingerprint(p)||!prior.image_sha256)throw Error('Current-bound AI review missing or stale');
  const evidence=JSON.parse(prior.evidence_json||'{}');
  if(evidence.content_fingerprint!==prior.content_fingerprint||evidence.image_sha256!==prior.image_sha256||
   evidence.checks?.duplicate?.result!=='DEFER')throw Error('Existing duplicate blocking proof inconsistent');
  const actor=await first('SELECT email,role,active FROM profiles WHERE email=?',prior.authorized_by);
  if(!actor?.active||!['admin','owner'].includes(actor.role))throw Error('Existing reviewer authorization unverified');
  if(await first('SELECT post_id FROM social_metricool_sync WHERE post_id=? LIMIT 1',p.id))throw Error('Metricool mapping exists; coordinate remote independently');
  if(await first('SELECT post_id FROM social_publish_deliveries WHERE post_id=? LIMIT 1',p.id))throw Error('Past deliveries exist; skip');
  const response=await fetch(p.image_url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok||sha(Buffer.from(await response.arrayBuffer()))!==prior.image_sha256)throw Error('Original image bytes not as previously reviewed');
  if(p[fix.field]===fix.nextValue)throw Error('No actual change');
  if(fix.field!=='copy'||!fix.nextValue.includes('仙加味小老闆')||!fix.nextValue.includes('小鹿和小烏龜')||!fix.nextValue.includes('\n\n')||fix.nextValue.length<fix.expectedCopy.length+36)throw Error('Copy is not grounded original-scene revision');
  if(fix.field==='image_alt'&&(!fix.nextValue.includes('木質收納櫃')||
    !fix.nextValue.includes('30cc小玻璃裸罐')||!fix.nextValue.includes('180cc鋁袋')||
    fix.nextValue.includes('居家收納櫃')))throw Error('ALT is not grounded revision');
  const now=new Date().toISOString(),updated={...p,[fix.field]:fix.nextValue};
  const newFingerprint=fingerprint(updated);
  const review={...evidence,review_scope:'20261110-three-grounded-scene-clarity-v1',reviewed_at:now,
   content_fingerprint:newFingerprint,inherited_from_review_id:prior.id,requested_decision:'defer',post_id:p.id,
   checks:{...evidence.checks,
    [fix.check]:{result:'PASS',evidence:fix.evidence},
    duplicate:{result:'DEFER',evidence:'只修正原圖場景位置及動作說明的一致性；跨平台歷史圖片15筆私人快取映射、3筆公開來源及舊輪播子圖未全部確認，絕不把現行獨立原圖與文案差異當成完整去重PASS。'}},
   publication:{...evidence.publication,approved:false,auto_publish:false,auto_schedule:false}};
  const body=JSON.stringify(review),reviewId='AI-DEFER-'+sha(body),auditId='AUD-'+crypto.randomUUID();
  const update=fix.field==='copy'
   ?sql("UPDATE social_posts SET copy=?,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",fix.nextValue,'AI審核：已修正圖片所在場景描述，仍待完整歷史去重',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt)
   :sql("UPDATE social_posts SET image_alt=?,review_note=?,updated_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND image_alt=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(image_approved,0)=0",fix.nextValue,'AI審核：已修正收納場景ALT，仍待正式產品與完整歷史去重',now,p.id,p.updated_at,p.title,p.copy,p.image_url,p.image_alt);
  const insert=sql("INSERT INTO social_post_quality_reviews(id,post_id,reviewer_type,decision,content_fingerprint,image_url,image_sha256,evidence_json,model,policy_version,authorized_by,reviewed_at,old_status,new_status) SELECT ?,?,'AI','NEEDS_HUMAN_REVIEW',?,?,?,?,?,?,?,?, 'pending_review','pending_review' WHERE changes()=1 AND EXISTS(SELECT 1 FROM social_posts WHERE id=? AND status='pending_review' AND updated_at=? AND image_url=?)",reviewId,p.id,newFingerprint,p.image_url,prior.image_sha256,body,prior.model||'ChatGPT',prior.policy_version||'2026-10-31-ai-deferral-only-v1',actor.email,now,p.id,now,p.image_url);
  const audit=sql("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','精準修正圖片場景與文案位置描述（不核准不發文）','貼文',?,?,?,'' WHERE changes()=1",auditId,p.id,JSON.stringify({review:prior.id,field:fix.field,oldTextSha:sha(p[fix.field])}),JSON.stringify({review:reviewId,newTextSha:sha(fix.nextValue),duplicate:'DEFER',approved:false}));
  const writes=await query([update,insert,audit].join(';\n'));
  if(writes.length!==3||writes.some(x=>x.meta?.changes!==1))throw Error('CAS/evidence/audit counts unexpected; stop to inspect');
  const [back,rb]=await Promise.all([first('SELECT status,copy,image_alt,image_url,approved_by,approved_at,scheduled_at,published_at,updated_at FROM social_posts WHERE id=?',p.id),first('SELECT decision,content_fingerprint,image_sha256,evidence_json FROM social_post_quality_reviews WHERE id=?',reviewId)]);
  const proof=JSON.parse(rb?.evidence_json||'{}');
  if(back?.status!=='pending_review'||back[fix.field]!==fix.nextValue||back.image_url!==p.image_url||
    back.approved_by||back.approved_at||back.scheduled_at||back.published_at||
    rb?.decision!=='NEEDS_HUMAN_REVIEW'||rb.content_fingerprint!==newFingerprint||
    rb.image_sha256!==prior.image_sha256||proof.checks?.duplicate?.result!=='DEFER')throw Error('D1 readback mismatch');
  Object.assign(out,{updated:true,readback:true,reviewId,originalImageSha:prior.image_sha256});
 }catch(err){out.blocker=String(err?.message||err).slice(0,450)}
 results.push(out);
}
const counts=(await query('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status'))[0]?.results||[];
const report={scope:req.scope,results,counts,updated:results.filter(x=>x.updated&&x.readback).length,blocked:results.filter(x=>x.blocker).length,approvals:0,scheduled:0,published:0};
fs.writeFileSync('three-grounded-scene-clarity-result.json',JSON.stringify(report,null,2)+'\n');
console.log('THREE_GROUNDED_SCENE_CLARITY '+JSON.stringify(report));
if(report.blocked)process.exitCode=1;
