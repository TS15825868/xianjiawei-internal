import fs from 'node:fs';
const manifest=JSON.parse(fs.readFileSync('ops/post-image-review-remediation-20261009.json','utf8'));
const raw=JSON.parse(fs.readFileSync('/tmp/live-posts-for-visual-remediation.json','utf8'));
const rows=(Array.isArray(raw)?raw[0]?.results:raw?.results)||[];
const byId=new Map(rows.map(row=>[row.id,row]));
const quote=(value)=>"'"+String(value??'').replaceAll("'","''")+"'";
const commands=[],applied=[],skipped=[];
for(const [mode,items] of [['rework',manifest.rework],['archive',manifest.archive]]){
  for(const item of items){
    const row=byId.get(item.postId);
    if(!row||row.status!=='pending_review'||!String(row.image_url||'').endsWith('/'+item.expectedFilename)){
      skipped.push({postId:item.postId,reason:'Not current pending-review or source path changed'});continue;
    }
    const status=mode==='archive'?'archived':'draft';
    const quality=mode==='archive'?'retired':'needs_regeneration';
    const source=mode==='archive'?'下架品歷史封存，不再公開':'人工覆核不合格：'+item.reason+'；等待新情境圖';
    commands.push('UPDATE social_posts SET status='+quote(status)+',image_url=\'\',image_alt=\'\',image_source='+quote(source)+',image_quality_status='+quote(quality)+',image_width=0,image_height=0,image_bytes=0,image_approved=0,approved_by=NULL,approved_at=NULL,scheduled_at=NULL,proposed_scheduled_at=NULL,published_at=NULL,updated_at=datetime(\'now\') WHERE id='+quote(item.postId)+' AND status=\'pending_review\' AND image_url='+quote(row.image_url)+';');
    applied.push({id:item.postId,status:status,reason:item.reason});
  }
}
fs.writeFileSync('/tmp/remediate-images.sql',commands.join('\n')+'\n');
fs.writeFileSync('/tmp/remediate-report.json',JSON.stringify({applied,skipped},null,2));
console.log('Targeted only current pending-review posts:',applied.length,'skipped',skipped.length);
console.log(applied.map(x=>x.id+' -> '+x.status).join('\n'));
if(!commands.length)throw new Error('No matching live rows; refusing blanket updates');
