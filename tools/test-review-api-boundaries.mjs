import fs from 'node:fs';
import assert from 'node:assert/strict';

// Execute the production gate with isolated auth, storage and publisher adapters.
// No credentials, production database or external network are used.
let source=fs.readFileSync(new URL('../src/publishing-review-gate-entry.js',import.meta.url),'utf8');
source=source.replace("import app from './flexible-publish-entry.js';",`const app={fetch:async request=>new URL(request.url).pathname==='/api/me'?Response.json({email:'reviewer@example.com',role:'owner'}):(globalThis.__reviewTest.forwarded++,Response.json({ok:true}))};`);
source=source.replace("import {enqueueMetricool,metricoolOwns,metricoolImmediate} from './metricool-sync.js';",'const enqueueMetricool=async()=>({ok:true}),metricoolOwns=async()=>false,metricoolImmediate=async()=>{throw Error("unexpected publish")};');
source=source.replace("import {imageHash,recordAiReview} from './ai-quality-review.js';",'const imageHash=()=>"isolated",recordAiReview=()=>{throw Error("unexpected AI write")};');
const {default:gate,REQUIRED_CHECKS,fingerprint}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const state={forwarded:0,writes:[],row:{id:'ISOLATED',title:'萬華日常',headline:'店裡的一天',copy:'分享今天的生活',category:'品牌',status:'draft',image_url:'https://example.invalid/unique.png',image_alt:'萬華店裡的一天',image_width:1200,image_height:1200,image_quality_status:'ok'},review:null};
globalThis.__reviewTest=state;
const env={DB:{
  exec:async()=>({}),
  prepare(sql){return{
    args:[],bind(...args){this.args=args;return this},
    async first(){return sql.includes('social_post_review_gates')?state.review:state.row},
    async all(){return{results:[]}},
    async run(){
      state.writes.push(sql);
      if(sql.includes("status='draft'"))state.row={...state.row,status:'draft',approved_by:null,scheduled_at:null,image_approved:0};
      if(sql.includes("status='pending_review'"))state.row={...state.row,status:'pending_review',approved_by:null,scheduled_at:null,image_approved:0};
      return{meta:{changes:1}};
    }
  }}
}};
async function post(path,body={}){return gate.fetch(new Request(`https://isolated.invalid/api/posts/ISOLATED/${path}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),env,{})}
for(const [path,body] of [['status',{status:'approved'}],['status',{status:'scheduled',scheduled_at:'2026-10-27T02:00:00Z'}],['publish-now',{}]]){assert.equal((await post(path,body)).status,409)}
state.row.status='pending_review';
assert.equal((await post('status',{status:'approved',review_checklist:{},copy_image_match:true})).status,409);
assert.equal(state.forwarded,0);assert.equal(state.writes.length,0);
state.row={...state.row,status:'approved',approved_by:'reviewer@example.com',scheduled_at:'2026-10-27T02:00:00Z'};
state.review={content_fingerprint:await fingerprint(state.row),checklist_json:JSON.stringify(Object.fromEntries(REQUIRED_CHECKS.map(key=>[key,true]))),copy_image_match:1,reviewed_by:'reviewer@example.com',reviewed_at:new Date().toISOString()};
// Immediate publishing must not depend on the future fixed schedule slot.
assert.equal((await post('publish-now')).status,200);assert.equal(state.forwarded,1);
state.row.copy='內容已修改';assert.equal((await post('publish-now')).status,409);assert.equal(state.forwarded,1);
assert.equal((await post('regeneration-start',{mode:'image'})).status,200);assert.equal(state.row.status,'draft');assert.equal(state.row.approved_by,null);assert.equal(state.row.scheduled_at,null);
assert.equal((await post('regeneration-ready',{mode:'image'})).status,200);assert.equal(state.row.status,'pending_review');assert.equal(state.row.image_approved,0);
delete globalThis.__reviewTest;
console.log('PASS production API gate in isolation: direct draft approval, missing human checklist, unreviewed scheduling/publishing and stale fingerprints blocked; reviewed immediate publish bypasses future schedule; regeneration returns pending; no production/network writes');
