import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {recordAiReview} from '../src/ai-quality-review.js';
import {fingerprint,productMatchErrors,duplicatePostErrors,isWeatherPost} from '../src/publishing-review-gate-entry.js';

const path=process.env.AI_REVIEW_FILE;
if(!/^ops\/ai-quality-evidence\/[A-Za-z0-9_-]+\.json$/.test(path||''))throw Error('Require one safe AI evidence file');
const payload=JSON.parse(fs.readFileSync(path,'utf8'));
if(!Array.isArray(payload.items)||!payload.items.length||payload.items.length>5)throw Error('Require 1–5 independently inspected reviews');
if(new Set(payload.items.map(x=>x.post_id)).size!==payload.items.length)throw Error('Duplicate post in review batch');
const quote=value=>value==null?'NULL':typeof value==='number'&&Number.isFinite(value)?String(value):"'"+String(value).replaceAll("'","''")+"'";
function execute(sql){
  const text=execFileSync('npx',['--no-install','wrangler','d1','execute','xianjiawei-internal-db','--remote','--json','--command',sql],{encoding:'utf8',maxBuffer:16*1024*1024});
  const results=JSON.parse(text);if(!Array.isArray(results)||results.some(r=>r.success===false))throw Error('D1 query failed');
  return results;
}
function statement(sql){return {values:[],bind(...values){this.values=values;return this},sql(){let i=0;const rendered=sql.replace(/\?/g,()=>{if(i>=this.values.length)throw Error('Missing SQL binding');return quote(this.values[i++])});if(i!==this.values.length)throw Error('Excess SQL binding');return rendered},async run(){return execute(this.sql())[0]},async first(){return execute(this.sql())[0]?.results?.[0]||null},async all(){return execute(this.sql())[0]}}}
const DB={prepare:statement,async batch(statements){return execute(statements.map(s=>s.sql()).join(';\n'))}};
const env={DB};
const profile=await DB.prepare('SELECT email,role,active FROM profiles WHERE email=?').bind(payload.authorized_by).first();
if(!profile?.active||!['owner','admin'].includes(profile.role))throw Error('Authorizing profile is not an active manager');
const results=[];
for(const proof of payload.items){
  const row=await DB.prepare('SELECT * FROM social_posts WHERE id=?').bind(proof.post_id).first();
  if(!row)throw Error('Review post missing');
  const result=await recordAiReview(env,row,proof,profile,{fingerprint,productMatchErrors,duplicatePostErrors,isWeatherPost});
  const saved=await DB.prepare('SELECT id,status,approved_by,image_approved,scheduled_at FROM social_posts WHERE id=?').bind(row.id).first();
  if(saved.status!==result.status||saved.scheduled_at)throw Error('AI evidence readback failed or unexpected schedule');
  results.push({post_id:row.id,...result});
}
fs.writeFileSync('ai-review-result.json',JSON.stringify({results,scheduledByImport:0,publishedByImport:0},null,2)+'\n');
console.log('Verified AI evidence imports:',results.map(x=>({post_id:x.post_id,decision:x.decision,status:x.status})));
