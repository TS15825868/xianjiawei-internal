import {recordAiDeferral} from '../src/ai-review-deferral.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);const {fingerprint}=require('../tools/metricool-free-evidence.cjs');
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
const quality=JSON.parse(fs.readFileSync('ops/visual-quality-increment-20261107.json'));const copies=JSON.parse(fs.readFileSync('ops/scene-copy-increment-20261107.json'));const ids=[...quality.items.map(x=>x.id),...copies.items.map(x=>x.id)];const results=[];
for(const id of ids){try{
 const row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(id).first();const prior=await DB.prepare("SELECT * FROM social_post_quality_reviews WHERE post_id=? AND json_extract(evidence_json,'$.review_scope')='20261106-full-resolution-visual-review-v2' ORDER BY reviewed_at DESC LIMIT 1").bind(id).first();if(!prior||row.image_url!==prior.image_url)throw Error('Source version mismatch');
 const e=JSON.parse(prior.evidence_json);const profile=await DB.prepare('SELECT email,role,active FROM profiles WHERE email=?').bind(prior.authorized_by).first();if(!profile?.active)throw Error('Inactive profile');
 const response=await fetch(row.image_url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('Media unavailable');if(crypto.createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')!==prior.image_sha256)throw Error('Image changed');
 const correction=copies.items.find(x=>x.id===id);if(correction){if(row.copy!==correction.copy||row.title!==correction.title)throw Error('Current copy changed');e.checks.action={result:'PASS',evidence:id.endsWith('0309')?'本輪已重新實看同一原尺寸圖：小老闆手掌朝向桌上龜鹿膏實物罐，符合新版介紹100g罐裝動作；閱讀標示改為讀者另行確認，未宣稱圖中正在閱讀。':'本輪已重新實看同一原尺寸圖：小老闆拿起透明食材袋並指向內容物，桌上籃子及分類收納位置可見；新版不再宣稱畫面可讀到期限標示。'};}
 e.review_scope='20261107-current-fingerprint-inherited-visual-delta';e.content_fingerprint=fingerprint(row);e.reviewed_at=new Date().toISOString();e.inherited_from_review_id=prior.id;e.requested_decision='defer';e.risk.uncertainties=['完整歷史構圖、語意與主題去重尚未完成；不把感知雜湊或文字分數當作最終通過'];e.checks.duplicate={result:'DEFER',evidence:'沿用已完成79篇SHA與感知雜湊篩選，最近圖像及文案候選保存在ops/visual-text-neighbors-20261107.json；仍有15來源未取得且完整實質去重未完成，不宣稱通過。'};
 const result=await recordAiDeferral({DB},row,e,profile,{fingerprint,ensureAiSchema:async()=>{}});const back=await DB.prepare('SELECT * FROM social_post_quality_reviews WHERE id=?').bind(result.review_id).first();if(back.content_fingerprint!==fingerprint(row)||back.image_sha256!==prior.image_sha256)throw Error('Readback mismatch');results.push({id,state:'current_version_delta_read_back',review_id:result.review_id,decision:back.decision});
}catch(error){results.push({id,state:'blocked_preserved',reason:error.message});}}
const counts=await DB.prepare('SELECT status,COUNT(*) AS count FROM social_posts GROUP BY status').all();const qualityCounts=await DB.prepare("SELECT image_quality_status,COUNT(*) AS count FROM social_posts WHERE status='pending_review' GROUP BY image_quality_status").all();fs.writeFileSync('review-delta-results.json',JSON.stringify({results,counts:counts.results,quality:qualityCounts.results,AIApprovalsAdded:0,published:0},null,2));
