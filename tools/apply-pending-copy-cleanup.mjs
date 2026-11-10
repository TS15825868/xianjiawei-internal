// 仙加味｜只修正 D1 未綁定外部發布的待審對客措辭。
// Full-batch CAS + source readback; no AI approval, no status promotion, no publication.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createD1Transport} from './d1-http-transport.mjs';
const require=createRequire(import.meta.url),{fingerprint}=require('./metricool-free-evidence.cjs');
const file=process.env.CLEANUP_REQUEST_FILE;
if(!/^ops\/post-copy-cleanup-batches\/[a-zA-Z0-9_-]+\.json$/.test(file||''))
  throw Error('One approved pending-only batch request required');
const batch=JSON.parse(fs.readFileSync(file,'utf8'));
if(batch.schema!=='xjw-unlinked-pending-copy-cleanup-v1'||
   batch.allowHumanApproval!==false||batch.allowSchedule!==false||batch.allowPublication!==false||
   !/^[A-Za-z0-9_-]{8,80}$/.test(batch.batch_id||'')||
   !Array.isArray(batch.items)||batch.items.length<1||batch.items.length>50)
  throw Error('Unsafe or oversized copy-only batch');
const ids=new Set();
for(const x of batch.items){
  if(!/^[A-Za-z0-9_-]+$/.test(x.id||'')||ids.has(x.id)||!String(x.expected_copy||'').includes('正式包裝')||
     !String(x.old_phrase||'').includes('正式包裝')||!String(x.replacement||'').trim()||
     !String(x.expected_updated_at||'').trim()||!String(x.expected_image_url||'').startsWith('https://'))
    throw Error('Batch item lacks safe original lease or expected wording');
  ids.add(x.id);
  if(x.expected_copy.split(x.old_phrase).length!==2)throw Error('Original wording is not unique');
}
const config=fs.readFileSync('wrangler.jsonc','utf8');
const dbid=config.match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const execute=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbid});
const q=v=>v===null||v===undefined?'NULL':"'"+String(v).replaceAll("'","''")+"'";
async function selectOne(sql){const r=await execute(sql);return r[0]?.results?.[0]||null;}
const prepared=[];
for(const item of batch.items){
  const row=await selectOne('SELECT * FROM social_posts WHERE id='+q(item.id)+' LIMIT 1');
  if(!row||row.status!=='pending_review'||row.published_at||row.scheduled_at||row.approved_by||row.approved_at)
    throw Error('Pending post changed release state; entire preflight stopped');
  if(row.image_url!==item.expected_image_url)throw Error('Image source lease changed; entire preflight stopped');
  const links=await selectOne('SELECT COUNT(*) AS total FROM social_metricool_sync WHERE post_id='+q(item.id));
  const deliveries=await selectOne('SELECT COUNT(*) AS total FROM social_publish_deliveries WHERE post_id='+q(item.id));
  if(!links||!deliveries||Number(links.total)!==0||Number(deliveries.total)!==0)
    throw Error('External mapping or delivery exists; nothing should be modified');
  const revised=item.expected_copy.replace(item.old_phrase,item.replacement);
  if(revised===item.expected_copy||revised.includes('正式包裝')||/(治療|改善疾病|預防疾病|保證療效)/.test(revised)||
     !/(仙加味|龜鹿|鹿茸)/.test(revised))throw Error('Revised public copy failed brand/compliance preflight');
  const note='待審文案措辭已修正：'+batch.batch_id+':'+item.id+'；須重新核對16項現版證據';
  const already=row.copy===revised&&row.review_note===note&&row.image_approved===0;
  if(!already&&(row.copy!==item.expected_copy||row.updated_at!==item.expected_updated_at))
    throw Error('Source copy/version changed; no old data is allowed to overwrite main');
  prepared.push({item,row,revised,note,already});
}
const receipt={schema:'xjw-pending-copy-batch-receipt-v1',batch:batch.batch_id,
  startedAt:new Date().toISOString(),attempted:prepared.length,verified:0,complete:false,
  approved:0,scheduled:0,published:0,records:[]};
const receiptPath='/tmp/pending-copy-cleanup-result.json';
function checkpoint(){fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');}
checkpoint();
try{
  for(const {item,row,revised,note,already} of prepared){
    let state=already?'already_applied_verified':'changed_and_verified';
    let nextTime=row.updated_at;
    if(!already){
      nextTime=new Date().toISOString();
      const sql=`UPDATE social_posts
SET copy=${q(revised)},review_note=${q(note)},updated_at=${q(nextTime)},
    image_approved=0,proposed_scheduled_at=NULL
WHERE id=${q(item.id)} AND status='pending_review' AND copy=${q(item.expected_copy)}
  AND updated_at=${q(item.expected_updated_at)} AND image_url=${q(item.expected_image_url)}
  AND approved_by IS NULL AND approved_at IS NULL AND published_at IS NULL AND scheduled_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=${q(item.id)})
  AND NOT EXISTS(SELECT 1 FROM social_publish_deliveries WHERE post_id=${q(item.id)})`;
      const out=await execute(sql);
      if(Number(out[0]?.meta?.changes)!==1)throw Error('Compare-and-set did not update exactly one current row');
    }
    const after=await selectOne('SELECT * FROM social_posts WHERE id='+q(item.id)+' LIMIT 1');
    if(!after||after.copy!==revised||after.review_note!==note||after.updated_at!==nextTime||
       after.image_url!==row.image_url||after.status!=='pending_review'||after.image_approved!==0||
       after.approved_by||after.approved_at||after.scheduled_at||after.published_at||
       after.proposed_scheduled_at!==null)
      throw Error('Post copy failed exact D1 readback');
    const exceptions=new Set(['copy','review_note','updated_at','image_approved','proposed_scheduled_at']);
    for(const field of Object.keys(row))if(!exceptions.has(field)&&JSON.stringify(row[field])!==JSON.stringify(after[field]))
      throw Error('Unexpected D1 field changed: '+field);
    receipt.records.push({id:item.id,result:state,priorFingerprint:fingerprint(row),
      currentFingerprint:fingerprint(after),updatedAt:after.updated_at});
    receipt.verified++;
    checkpoint();
  }
  receipt.complete=true;receipt.finishedAt=new Date().toISOString();checkpoint();
  console.log('VERIFIED_PENDING_COPY_BATCH',JSON.stringify({batch:batch.batch_id,count:receipt.verified,
    results:receipt.records.map(r=>({id:r.id,result:r.result})),approved:0,published:0}));
}catch(error){
  receipt.error=String(error?.message||'batch failed').slice(0,250);
  checkpoint();throw error;
}
