import fs from 'node:fs';
import {createD1Transport} from './d1-http-transport.mjs';
import {recordAiReview} from '../src/ai-quality-review.js';
import {fingerprint,productMatchErrors,duplicatePostErrors,isWeatherPost} from '../src/publishing-review-gate-entry.js';

const path=process.env.AI_REVIEW_FILE;
if(!/^ops\/ai-quality-evidence\/[A-Za-z0-9_-]+\.json$/.test(path||''))throw Error('Require one safe AI evidence file');
const payload=JSON.parse(fs.readFileSync(path,'utf8'));
if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>100)throw Error('Require 1–100 independently inspected, source-bound reviews');
if(new Set(payload.items.map(x=>x.post_id)).size!==payload.items.length)throw Error('Duplicate post in review batch');
const quote=value=>value==null?'NULL':typeof value==='number'&&Number.isFinite(value)?String(value):"'"+String(value).replaceAll("'","''")+"'";
const dbId=fs.readFileSync('wrangler.jsonc','utf8').match(/"database_id"\s*:\s*"([a-f0-9-]+)"/)?.[1];
const execute=createD1Transport({token:process.env.CLOUDFLARE_API_TOKEN,
  accountId:process.env.CLOUDFLARE_ACCOUNT_ID,databaseId:dbId});
function statement(sql){return {values:[],bind(...values){this.values=values;return this},sql(){let i=0;const rendered=sql.replace(/\?/g,()=>{if(i>=this.values.length)throw Error('Missing SQL binding');return quote(this.values[i++])});if(i!==this.values.length)throw Error('Excess SQL binding');return rendered},async run(){return (await execute(this.sql()))[0]},async first(){return (await execute(this.sql()))[0]?.results?.[0]||null},async all(){return (await execute(this.sql()))[0]}}}
const DB={prepare:statement,async batch(statements){return execute(statements.map(s=>s.sql()).join(';\n'))}};
const env={DB};
const profile=await DB.prepare('SELECT email,role,active FROM profiles WHERE email=?').bind(payload.authorized_by).first();
if(!profile?.active||!['owner','admin'].includes(profile.role))throw Error('Authorizing profile is not an active manager');
// Validate every source binding before the first D1 mutation; no 1–5 item cap.
// Per-item CAS in recordAiReview remains mandatory. Existing approvals stay protected.
const prepared=[];
for(const proof of payload.items){
  if(typeof proof?.post_id!=='string'||!proof.post_id.trim()||proof.reviewer_type!=='AI'||
     !String(proof.model||'').trim()||!/^[a-f0-9]{64}$/i.test(proof.image_sha256||''))
    throw Error('Batch contains invalid, unsourced AI evidence; nothing was imported');
  const row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(proof.post_id).first();
  if(!row||!['draft','pending_review'].includes(row.status)||row.published_at)
    throw Error('Batch contains missing, released or published post; nothing was imported');
  if(proof.content_fingerprint!==await fingerprint(row)||proof.image_url!==row.image_url)
    throw Error('Batch contains outdated post or image version; nothing was imported');
  prepared.push({row,proof});
}
const results=[];
const checkpoint=(complete,error=null)=>fs.writeFileSync('ai-review-result.json',JSON.stringify({
  attempted:prepared.length,confirmed:results.length,complete,error,
  results,scheduledByImport:0,publishedByImport:0
},null,2)+'\n');
checkpoint(false);
for(const {row,proof} of prepared){
  const result=await recordAiReview(env,row,proof,profile,{fingerprint,productMatchErrors,duplicatePostErrors,isWeatherPost});
  const saved=await DB.prepare('SELECT id,status,approved_by,approved_at,image_approved,scheduled_at,published_at FROM social_posts WHERE id=?').bind(row.id).first();
  const imported=await DB.prepare('SELECT id,post_id,decision,content_fingerprint,image_sha256 FROM social_post_quality_reviews WHERE id=?').bind(result.review_id).first();
  if(saved?.status!==result.status||saved?.approved_by||saved?.approved_at||saved?.scheduled_at||saved?.published_at||Number(saved?.image_approved)!==0||
     imported?.id!==result.review_id||imported?.post_id!==row.id||imported?.decision!==result.decision||
     imported?.content_fingerprint!==proof.content_fingerprint||imported?.image_sha256!==proof.image_sha256)
    throw Error('AI evidence or pending-only state failed exact D1 readback; stop without retry');
  results.push({post_id:row.id,...result});
  checkpoint(false);
}
checkpoint(true);
console.log('Verified AI evidence imports:',results.map(x=>({post_id:x.post_id,decision:x.decision,status:x.status})));
