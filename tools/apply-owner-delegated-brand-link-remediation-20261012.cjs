// One-time content-only remediation: brand link for verified pending lifestyle drafts; no approval, schedule, or publishing.
'use strict';
const fs=require('node:fs');
const crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('ops/owner-delegated-brand-link-remediation-20261012.json','utf8'));
const sha=s=>crypto.createHash('sha256').update(String(s||''),'utf8').digest('hex');
const quote=s=>"'"+String(s??'').replaceAll("'","''")+"'";
const clean=s=>String(s??'').trim();
const rows=path=>JSON.parse(fs.readFileSync(path,'utf8')).flatMap(x=>x.results||[]);
const byId=(list,id)=>list.find(x=>x.id===id);
const forbidden=/台興山產|龜鹿膠|龜鹿湯塊|治療|預防疾病|改善疾病|補氣|生津|關節卡卡|保證功效|人工審核|16項|待審核|貼文中心|Workflow|GitHub/i;
const hasBrand=/仙加味|龜鹿|鹿茸|30cc|180cc/;
if(manifest.items.length!==28||manifest.approvalAllowed||manifest.schedulingAllowed||manifest.publishingAllowed)throw Error('Unsafe or unexpected one-time content manifest');
const normalized=new Set(), newCopies=new Map();
function makeCopy(original,brandParagraph){
  const parts=String(original||'').trim().split(/\n\s*\n/);
  const index=parts.length>1&&/[？?]$/.test(parts[parts.length-1].trim())?parts.length-1:parts.length;
  parts.splice(index,0,brandParagraph);
  return parts.join('\n\n');
}
function preflight(before){
  if(before.length!==132)throw Error('Live library size changed from reviewed source');
  for(const item of manifest.items){
    if(normalized.has(item.postId))throw Error('Duplicate post in remediation');
    normalized.add(item.postId);
    const p=byId(before,item.postId);
    if(!p||p.status!=='pending_review'||p.scheduled_at||p.published_at||p.approved_at||p.approved_by||Number(p.image_approved)!==0)throw Error('No longer safe to edit pending post: '+item.postId);
    if(!clean(p.image_url)||sha(p.copy).slice(0,16)!==item.oldCopyHash||hasBrand.test(p.copy))throw Error('Content source lease failed: '+item.postId);
    if(!item.brandParagraph||item.brandParagraph.length<20||item.brandParagraph.length>130||!item.brandParagraph.includes('仙加味')||forbidden.test(item.brandParagraph))throw Error('Invalid authored brand link: '+item.postId);
    const newCopy=makeCopy(p.copy,item.brandParagraph);
    if(!newCopy.includes(item.brandParagraph)||newCopy.length>2500||forbidden.test(newCopy)||!hasBrand.test(newCopy))throw Error('Unsafe revised content: '+item.postId);
    newCopies.set(item.postId,newCopy);
  }
}
const mode=process.argv[2];
if(mode==='prepare'){
  const before=rows('/tmp/xjw-brand-link-before.json');
  preflight(before);
  const sql=[];
  for(const item of manifest.items){
    const p=byId(before,item.postId),newCopy=newCopies.get(item.postId);
    sql.push('UPDATE social_posts SET copy='+quote(newCopy)+",updated_at=datetime('now') WHERE id="+quote(item.postId)+" AND status='pending_review' AND copy="+quote(p.copy)+" AND updated_at="+quote(p.updated_at)+" AND image_url="+quote(p.image_url)+" AND scheduled_at IS NULL AND published_at IS NULL AND approved_at IS NULL AND image_approved=0;");
    sql.push("DELETE FROM social_post_review_gates WHERE post_id="+quote(item.postId)+" AND NOT EXISTS(SELECT 1 FROM social_posts WHERE id="+quote(item.postId)+" AND status='approved');");
  }
  fs.writeFileSync('/tmp/xjw-brand-link-apply.sql',sql.join('\n')+'\n');
  console.log('PASS content-only preflight',manifest.items.length,'distinct pending records, all old-copy leases match');
}else if(mode==='verify'){
  const before=rows('/tmp/xjw-brand-link-before.json'),after=rows('/tmp/xjw-brand-link-after.json');
  preflight(before);
  if(after.length!==132)throw Error('Unexpected library record count after update');
  const changed=new Set(manifest.items.map(x=>x.postId));
  for(const p of before){
    const a=byId(after,p.id);
    if(!a)throw Error('Post removed: '+p.id);
    if(!changed.has(p.id)){
      if(JSON.stringify(p)!==JSON.stringify(a))throw Error('Unrelated/historical post was changed: '+p.id);
      continue;
    }
    if(a.status!=='pending_review'||a.copy!==newCopies.get(p.id)||a.image_url!==p.image_url||Number(a.image_approved)!==0||a.scheduled_at||a.published_at||a.approved_at||a.approved_by)throw Error('Revised post not safely pending: '+p.id);
    for(const key of Object.keys(p)){
      if(key==='copy'||key==='updated_at')continue;
      if(JSON.stringify(p[key])!==JSON.stringify(a[key]))throw Error('Unrelated field changed: '+p.id+' '+key);
    }
  }
  const counts=Object.fromEntries([...new Set(after.map(x=>x.status))].map(status=>[status,after.filter(x=>x.status===status).length]));
  fs.writeFileSync('/tmp/xjw-brand-link-result.json',JSON.stringify({batch:manifest.batchId,contentUpdated:changed.size,postIds:[...changed],counts,approvedByThisBatch:0,scheduledByThisBatch:0,publishedByThisBatch:0,historicalPostsPreserved:true},null,2)+'\n');
  console.log('PASS verified',changed.size,'unique brand-linked pending copies, zero approvals/schedule/publications',JSON.stringify(counts));
}else throw Error('Expected prepare or verify');
