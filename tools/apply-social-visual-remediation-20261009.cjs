'use strict';
const fs=require('fs');
const manifest=JSON.parse(fs.readFileSync('ops/social-visual-remediation-20261009.json','utf8'));
const q=v=>"'"+String(v??'').replace(/'/g,"''")+"'";
const statuses="status IN ('draft','pending_review')";
const sql=[];
const ids=new Set();
for(const item of manifest.items){
  if(ids.has(item.id))throw Error('duplicate id: '+item.id);
  ids.add(item.id);
  if(!/^[A-Za-z0-9_-]+$/.test(item.id))throw Error('unsafe post id');
  if(!/^[A-Za-z0-9_.-]+$/.test(item.expectedFilename))throw Error('unsafe filename');
  const where="id="+q(item.id)+" AND "+statuses+" AND image_url LIKE "+q('%/'+item.expectedFilename);
  const why=item.action==='archive'?'已下架產品或同主題新版已發佈，封存舊貼文，不刪歷史資料':'舊產品DM拼框／缺乏實際生活情境，退回草稿並等待唯一新版圖片';
  const common="image_approved=0,approved_by=NULL,approved_at=NULL,scheduled_at=NULL,proposed_scheduled_at=NULL,rejection_reason="+q(why)+",review_note="+q('2026-10-09 圖片全庫巡檢：'+why)+",updated_at=datetime('now')";
  if(item.action==='archive'){
    sql.push("UPDATE social_posts SET status='archived', "+common+" WHERE "+where+";");
  }else if(item.action==='regenerate'){
    sql.push("UPDATE social_posts SET status='draft', image_url=NULL,image_quality_status='needs_regeneration',image_width=0,image_height=0,image_bytes=0, "+common+" WHERE "+where+";");
  }else throw Error('unknown action: '+item.action);
}
sql.push("UPDATE social_posts SET status='archived',review_note='2026-10-09 舊版DM已被新版正式已發佈圖取代，避免重複發布',updated_at=datetime('now') WHERE id='XJW-CONV-chat-gao-storage' AND status='draft' AND COALESCE(image_url,'')='';");
sql.push("UPDATE social_posts SET copy=REPLACE(copy,'龜鹿膠這項老工藝做到今天','熬膠這項老工藝延續到今天'),review_note='2026-10-09：已下架品公開文案替換為工藝主題，須人工審核後才可發佈',updated_at=datetime('now') WHERE id='XJW-CONV-brand-third-generation-note' AND status='draft' AND copy LIKE '%龜鹿膠這項老工藝做到今天%';");
fs.writeFileSync('/tmp/social-visual-remediation-20261009.sql',sql.join('\n')+'\n');
console.log('Prepared audited conditional D1 updates:',manifest.items.length,'plus one copy correction.');
