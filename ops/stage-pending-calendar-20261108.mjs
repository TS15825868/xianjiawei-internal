import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
const req=JSON.parse(fs.readFileSync('ops/request-stage-pending-calendar-20261108.json','utf8'));
if(req.schema!=='xjw-pending-calendar-proposed-only-20261108'||req.authorizeProposedOnly!==true||req.approve!==false||req.schedule!==false||req.publish!==false||req.items.length!==29)throw Error('Unauthorized operation');
const acct=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN,db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!acct||!token||!db)throw Error('D1 credential unavailable');
const qt=x=>x==null?'NULL':"'"+String(x).replaceAll("'","''")+"'";
const sql=(s,...a)=>{let i=0;const v=s.replace(/\?/g,()=>qt(a[i++]));if(i!==a.length)throw Error('Bind count');return v};
async function query(s){const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+acct+'/d1/database/'+db+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql:s}),signal:AbortSignal.timeout(40000)});const j=await r.json();if(!r.ok||!j.success||!Array.isArray(j.result)||j.result.some(x=>x.success===false))throw Error('D1 response '+JSON.stringify(j.errors||[]).slice(0,240));return j.result}
async function rows(s){return(await query(s)).flatMap(x=>x.results||[])}
const posts=await rows("SELECT * FROM social_posts WHERE status IN ('pending_review','approved','scheduled') ORDER BY id");
const reviews=await rows("SELECT r.post_id,r.decision,r.content_fingerprint,r.image_url FROM social_post_quality_reviews r JOIN (SELECT post_id,MAX(reviewed_at) AS mx FROM social_post_quality_reviews GROUP BY post_id) m ON m.post_id=r.post_id AND m.mx=r.reviewed_at");
const byId=new Map(posts.map(x=>[x.id,x])), byReview=new Map(reviews.map(x=>[x.post_id,x]));
const day=s=>String(s||'').slice(0,10),wk=d=>{const t=new Date(d+'T00:00:00Z');t.setUTCDate(t.getUTCDate()-(t.getUTCDay()+6)%7);return t.toISOString().slice(0,10)};
const dates=new Set(),weeks=new Map();
const occupy=(d,id)=>{dates.add(d);const w=wk(d);if(!weeks.has(w))weeks.set(w,new Set());weeks.get(w).add(id)};
for(const p of posts){const d=day(p.scheduled_at||p.proposed_scheduled_at);if(d>='2026-11-09')occupy(d,'D1:'+p.id)}
for(const m of req.externalMetricoolDrafts)occupy(m.date,'Metricool:'+m.id);
const done=[],blocked=[];
for(const item of req.items){
 const p=byId.get(item.id),r=byReview.get(item.id),old=p?.proposed_scheduled_at||null;
 let reason=!p?'row_not_found':p.status!=='pending_review'?'status_changed':p.title!==item.title?'title_changed':p.updated_at!==item.expectedUpdatedAt?'version_changed':old!==item.expectedProposed?'candidate_changed':p.approved_by||p.approved_at||p.scheduled_at||p.published_at?'already_approved_or_sent':!p.image_url||!['clear','passed'].includes(p.image_quality_status)?'image_not_clear':!r||r.decision!=='NEEDS_HUMAN_REVIEW'||r.image_url!==p.image_url||r.content_fingerprint!==fingerprint(p)?'current_ai_evidence_changed':null;
 const d=day(item.proposedAt);
 if(!reason&&item.proposedAt&&(d<'2026-11-09'||dates.has(d)||(weeks.get(wk(d))?.size||0)>=item.maxWeekly))reason='calendar_collision';
 if(!reason&&item.maxWeekly===2&&item.proposedAt&&![2,5].includes(new Date(d+'T00:00:00Z').getUTCDay()))reason='non_regular_weekday';
 if(reason){blocked.push({id:item.id,reason});continue}
 try{
  const stmt=sql("UPDATE social_posts SET proposed_scheduled_at=? WHERE id=? AND status='pending_review' AND updated_at=? AND title=? AND copy=? AND image_url=? AND approved_by IS NULL AND approved_at IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND COALESCE(proposed_scheduled_at,'')=COALESCE(?,'')",item.proposedAt,item.id,p.updated_at,p.title,p.copy,p.image_url,old);
  const change=(await query(stmt))[0];
  if(Number(change?.meta?.changes)!==1){blocked.push({id:item.id,reason:'d1_cas_no_change'});continue}
  const back=(await rows(sql("SELECT status,copy,image_url,updated_at,proposed_scheduled_at,approved_by,approved_at,scheduled_at,published_at FROM social_posts WHERE id=?",item.id)))[0];
  if(!back||back.status!=='pending_review'||back.copy!==p.copy||back.image_url!==p.image_url||back.proposed_scheduled_at!==item.proposedAt||back.approved_by||back.approved_at||back.scheduled_at||back.published_at){blocked.push({id:item.id,reason:'d1_readback_mismatch'});continue}
  done.push({id:item.id,proposed:item.proposedAt});
  if(item.proposedAt)occupy(d,'New:'+item.id);
 }catch(e){blocked.push({id:item.id,reason:String(e.message||e).slice(0,220)})}
}
const counts=await rows("SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status ORDER BY status");
const props=await rows("SELECT SUM(CASE WHEN proposed_scheduled_at>='2026-11-09' THEN 1 ELSE 0 END) AS future, SUM(CASE WHEN proposed_scheduled_at<'2026-11-09' AND TRIM(COALESCE(proposed_scheduled_at,''))<>'' THEN 1 ELSE 0 END) AS stale FROM social_posts WHERE status='pending_review'");
const out={totalChanges:done.length,done,blocked,held:req.holds,counts,proposals:props[0]||{},AI_APPROVED:0,scheduled:0,publishedNew:0,noPublicSend:true};
fs.writeFileSync('stage-pending-calendar-result.json',JSON.stringify(out,null,2)+'\n');
console.log('XJW_STAGE_PENDING_CALENDAR '+JSON.stringify(out));
if(blocked.length)process.exitCode=1;
