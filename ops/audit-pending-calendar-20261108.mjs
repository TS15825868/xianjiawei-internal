import fs from 'node:fs';
const req=JSON.parse(fs.readFileSync('ops/request-pending-calendar-audit-20261108.json','utf8'));
if(req.scope!=='pending-calendar-readonly-20261108'||req.noWrites!==true)throw Error('read-only only');
const account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const db=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
if(!account||!token||!db)throw Error('missing Cloudflare access');
async function query(sql){
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+account+'/d1/database/'+db+'/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(40000)});
 const j=await r.json();if(!r.ok||!j.success||j.result?.some(x=>x.success===false))throw Error('D1 read failure '+JSON.stringify(j.errors||[]).slice(0,300));return j.result?.flatMap(x=>x.results||[])||[];
}
const posts=await query("SELECT id,title,category,status,proposed_scheduled_at,scheduled_at,approved_by,approved_at,updated_at,image_url,image_quality_status,image_width,image_height FROM social_posts ORDER BY status,id");
const reviews=await query("SELECT post_id,decision,content_fingerprint,reviewed_at FROM social_post_quality_reviews ORDER BY reviewed_at DESC");
const last=new Map();for(const a of reviews)if(!last.has(a.post_id))last.set(a.post_id,a);
const pending=posts.filter(p=>p.status==='pending_review');
const proposed=pending.filter(p=>String(p.proposed_scheduled_at||'').trim());
const today='2026-11-08';
const st=Object.fromEntries([...new Set(posts.map(p=>p.status))].map(v=>[v,posts.filter(x=>x.status===v).length]));
const out={
 counts:st,total:posts.length,
 pending:pending.map(p=>({id:p.id,title:p.title,category:p.category,proposed:p.proposed_scheduled_at||null,status:p.status,image:!!p.image_url,quality:p.image_quality_status,review:last.get(p.id)?.decision||null,updated:p.updated_at})),
 missingProposal:pending.filter(p=>!String(p.proposed_scheduled_at||'').trim()).map(p=>p.id),
 pastProposal:proposed.filter(p=>String(p.proposed_scheduled_at||'').slice(0,10)<today).map(p=>({id:p.id,at:p.proposed_scheduled_at})),
 futureProposalCount:proposed.filter(p=>String(p.proposed_scheduled_at||'').slice(0,10)>=today).length,
 approvedPending:pending.filter(p=>p.approved_at||p.approved_by).map(p=>p.id),
 scheduleOrPublicationWithoutApproval:posts.filter(p=>['scheduled','approved'].includes(p.status)&&!(p.approved_at&&p.approved_by)).map(p=>p.id),
 numberWithLatestReview:pending.filter(p=>last.has(p.id)).length
};
fs.writeFileSync('pending-calendar-readonly-results.json',JSON.stringify(out,null,2)+'\n');
console.log('CURRENT_PENDING_CALENDAR_AUDIT '+JSON.stringify(out));
