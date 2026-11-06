import fs from 'node:fs';
import crypto from 'node:crypto';
const database=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const token=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
if(!database||!token||!account)throw Error('Missing credentials or unsafe approval config');
const quote=x=>x==null?'NULL':typeof x==='number'?String(x):"'"+String(x).replaceAll("'","''")+"'";
async function execute(sql){
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({sql}),signal:AbortSignal.timeout(45000)});
 const body=await response.json();if(!response.ok||!body.success||!Array.isArray(body.result)||body.result.some(x=>x.success===false))throw Error('D1 query failed; read back before retrying');return body.result;
}
function prepare(sql){return{values:[],bind(...values){this.values=values;return this},sql(){let i=0;const result=sql.replace(/\?/g,()=>quote(this.values[i++]));if(i!==this.values.length)throw Error('SQL parameter mismatch');return result},async run(){return(await execute(this.sql()))[0]},async first(){return(await execute(this.sql()))[0]?.results?.[0]||null},async all(){return(await execute(this.sql()))[0]}}}
const DB={prepare,async batch(statements){return execute(statements.map(x=>x.sql()).join(';\n'))}};
const config=JSON.parse(fs.readFileSync('ops/visual-quality-increment-20261107.json'));
const results=[];
for(const item of config.items){try{
 const row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(item.id).first();
 if(row.status!=='pending_review'||row.image_url!==item.url||row.approved_by||row.image_approved||row.scheduled_at||row.published_at)throw Error('Current version/state changed; preserved');
 const proof=await DB.prepare("SELECT * FROM social_post_quality_reviews WHERE post_id=? AND image_url=? AND image_sha256=? AND json_extract(evidence_json,'$.review_scope')='20261106-full-resolution-visual-review-v2' ORDER BY reviewed_at DESC LIMIT 1").bind(item.id,item.url,item.sha256).first();
 const e=JSON.parse(proof?.evidence_json||'{}');
 for(const key of ['brand','product','specification','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale'])if(e.checks?.[key]?.result!=='PASS')throw Error('Prior independent visual evidence missing: '+key);
 const res=await fetch(item.url);if(!res.ok)throw Error('Media unavailable');const bytes=await res.arrayBuffer();if(crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')!==item.sha256)throw Error('Media changed');
 if(row.image_quality_status!=='clear'){
 const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();
 const saved=await DB.batch([DB.prepare("UPDATE social_posts SET image_quality_status='clear',updated_at=? WHERE id=? AND updated_at=? AND status='pending_review' AND image_url=? AND image_quality_status='needs_review' AND approved_by IS NULL AND COALESCE(image_approved,0)=0 AND scheduled_at IS NULL AND published_at IS NULL").bind(now,item.id,row.updated_at,item.url),DB.prepare("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','獨立視覺證據釐清（非人工核准）','貼文',?,?,?,'' WHERE changes()=1").bind(audit,item.id,JSON.stringify({quality:row.image_quality_status}),JSON.stringify({quality:'clear',sourceReview:proof.id,sha256:item.sha256,humanApproved:false,dedupStillDeferred:true}))]);
 if(saved[0]?.meta?.changes!==1)throw Error('CAS changed; preserved');
 }
 const back=await DB.prepare('SELECT status,image_quality_status,image_approved,approved_by,scheduled_at FROM social_posts WHERE id=?').bind(item.id).first();if(back.image_quality_status!=='clear'||back.status!=='pending_review'||back.image_approved||back.approved_by||back.scheduled_at)throw Error('Readback mismatch');results.push({id:item.id,result:'quality_clear_read_back',sourceReview:proof.id,humanApproval:false});
 }catch(error){results.push({id:item.id,result:'blocked_preserved',reason:error.message});}}
const counts=await DB.prepare('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status').all();fs.writeFileSync('visual-quality-increment-results.json',JSON.stringify({results,counts:counts.results,AIApprovalsAdded:0,published:0},null,2));console.log(results);
