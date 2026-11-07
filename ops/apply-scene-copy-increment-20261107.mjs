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
const config=JSON.parse(fs.readFileSync('ops/scene-copy-increment-20261107.json'));const results=[];
for(const item of config.items){try{
const row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(item.id).first();if(row.copy!==item.expectedCopy||row.image_url!==item.expectedUrl||row.status!=='pending_review'||row.approved_by||row.scheduled_at||row.published_at)throw Error('Current data differs; preserved');
const now=new Date().toISOString(),audit='AUD-'+crypto.randomUUID();const saved=await DB.batch([DB.prepare("UPDATE social_posts SET title=?,copy=?,review_note='文案動作與主題精準修復；舊審核版本失效，待受影響項目重新審核；不核准不發布',updated_at=? WHERE id=? AND updated_at=? AND copy=? AND status='pending_review' AND approved_by IS NULL AND scheduled_at IS NULL AND published_at IS NULL AND NOT EXISTS(SELECT 1 FROM social_metricool_sync WHERE post_id=social_posts.id)").bind(item.title,item.copy,now,item.id,row.updated_at,item.expectedCopy),DB.prepare("INSERT INTO audit_logs(id,actor_email,action,entity_type,entity_id,before_json,after_json,ip) SELECT ?,'chatgpt-work:AI','文案動作及重複角度修復（待審）','貼文',?,?,?,'' WHERE changes()=1").bind(audit,item.id,JSON.stringify({title:row.title,copy:row.copy}),JSON.stringify({title:item.title,copy:item.copy,humanApproved:false}))]);if(saved[0]?.meta?.changes!==1)throw Error('CAS not written');const back=await DB.prepare('SELECT title,copy,status,approved_by,scheduled_at FROM social_posts WHERE id=?').bind(item.id).first();if(back.copy!==item.copy||back.title!==item.title||back.status!=='pending_review'||back.approved_by||back.scheduled_at)throw Error('Readback failed');results.push({id:item.id,state:'copy_repaired_read_back',humanApproved:false});
}catch(e){results.push({id:item.id,state:'blocked_preserved',reason:e.message});}}
fs.writeFileSync('scene-copy-increment-results.json',JSON.stringify({results,AIApprovalsAdded:0,published:0},null,2));console.log(results);
