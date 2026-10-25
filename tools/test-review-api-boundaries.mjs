import fs from 'node:fs';
import assert from 'node:assert/strict';

// Execute the production gate with isolated auth, storage and publisher adapters.
// No credentials, production database or external network are used.
let source=fs.readFileSync(new URL('../src/publishing-review-gate-entry.js',import.meta.url),'utf8');
source=source.replace("import app from './flexible-publish-entry.js';",`const app={fetch:async request=>new URL(request.url).pathname==='/api/me'?Response.json({email:'reviewer@example.com',role:'owner'}):(globalThis.__reviewTest.forwarded++,Response.json({ok:true}))};`);
source=source.replace("import {enqueueMetricool,metricoolOwns,metricoolImmediate} from './metricool-sync.js';",'const enqueueMetricool=async()=>({ok:true}),metricoolOwns=async()=>Boolean(globalThis.__reviewTest.externalLink),metricoolImmediate=async()=>{throw Error("unexpected publish")};');
source=source.replace("import {imageHash,recordAiReview} from './ai-quality-review.js';",'const imageHash=()=>"isolated",recordAiReview=()=>{throw Error("unexpected AI write")};');
const {default:gate,REQUIRED_CHECKS,fingerprint}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const state={forwarded:0,writes:[],externalLink:null,casFail:false,row:{id:'ISOLATED',title:'萬華日常',headline:'店裡的一天',copy:'分享今天的生活',category:'品牌',status:'draft',image_url:'https://example.invalid/unique.png',image_alt:'萬華店裡的一天',image_width:1200,image_height:1200,image_quality_status:'ok'},review:null};
globalThis.__reviewTest=state;
const env={DB:{
  exec:async()=>({}),
  prepare(sql){return{
    args:[],bind(...args){this.args=args;return this},
    async first(){if(sql.includes('FROM social_metricool_sync'))return state.externalLink;return sql.includes('social_post_review_gates')?state.review:state.row},
    async all(){return{results:[]}},
    async run(){
      state.writes.push(sql);
      if(state.casFail&&sql.startsWith('UPDATE social_posts'))return {meta:{changes:0}};
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
// Every linked external slot, including a completed post, requires reconciliation.
for(const externalState of ['scheduled','awaiting_verification','unknown','published']){
  state.externalLink={metricool_id:399616481,state:externalState};
  const writes=state.writes.length;
  assert.equal((await post('regeneration-start',{mode:'image'})).status,409);
  assert.equal((await post('regeneration-ready',{mode:'image'})).status,409);
  assert.equal(state.writes.length,writes);
}
state.externalLink=null;
state.row.published_at='2026-10-21T01:00:00.000Z';
const publishedWrites=state.writes.length;
assert.equal((await post('regeneration-start',{mode:'image'})).status,409);
assert.equal((await post('regeneration-ready',{mode:'image'})).status,409);
assert.equal(state.writes.length,publishedWrites);
state.row.published_at=null;
state.casFail=true;
const beforeCas=state.writes.length;
assert.equal((await post('regeneration-start',{mode:'image'})).status,409);
assert.equal(state.row.status,'approved');
assert.equal(state.writes.length,beforeCas+1);
assert.match(state.writes.at(-1),/published_at IS NULL/);
state.casFail=false;
assert.equal((await post('regeneration-start',{mode:'image'})).status,200);assert.equal(state.row.status,'draft');assert.equal(state.row.approved_by,null);assert.equal(state.row.scheduled_at,null);
assert.equal((await post('regeneration-ready',{mode:'image'})).status,200);assert.equal(state.row.status,'pending_review');assert.equal(state.row.image_approved,0);
state.row.status='scheduled';
assert.equal((await post('regeneration-ready',{mode:'image'})).status,409);

async function editPost(method='PUT'){return gate.fetch(new Request('https://isolated.invalid/api/posts/ISOLATED',{method,headers:{'content-type':'application/json'},body:JSON.stringify({copy:'isolated safe edit'})}),env,{})}
for(const historicalStatus of ['published','archived','manual_required']){
 state.row={...state.row,status:historicalStatus,published_at:historicalStatus==='published'?'2026-10-20T08:00:00Z':null};
 const count=state.writes.length,forwarded=state.forwarded;
 for(const method of ['PUT','PATCH'])assert.equal((await editPost(method)).status,409);
 assert.equal(state.writes.length,count);
 assert.equal(state.forwarded,forwarded);
}
state.row={...state.row,status:'draft',published_at:'2026-10-20T08:00:00Z'};
const historicWrites=state.writes.length;
assert.equal((await post('status',{status:'pending_review'})).status,409);
assert.equal((await post('status',{status:'draft'})).status,409);
assert.equal((await editPost()).status,409);
assert.equal(state.writes.length,historicWrites);
state.row={...state.row,status:'pending_review',published_at:'2026-10-20T08:00:00Z'};
assert.equal((await post('status',{status:'approved',review_checklist:Object.fromEntries(REQUIRED_CHECKS.map(k=>[k,true])),copy_image_match:true})).status,409);
assert.equal(state.writes.length,historicWrites);
state.row={...state.row,status:'draft',published_at:null};
state.externalLink={metricool_id:99,state:'scheduled'};
assert.equal((await post('status',{status:'pending_review'})).status,409);
state.externalLink=null;
state.casFail=true;
assert.equal((await post('status',{status:'pending_review'})).status,409);
assert.equal(state.row.status,'draft');
state.casFail=false;
assert.equal((await post('status',{status:'pending_review'})).status,200);
assert.equal(state.row.status,'pending_review');
console.log('PASS historical publish guard rejects status/edit/reapproval; live draft submission is CAS-verified');

delete globalThis.__reviewTest;
console.log('PASS production API gate in isolation: direct draft approval, missing human checklist, unreviewed scheduling/publishing and stale fingerprints blocked; reviewed immediate publish bypasses future schedule; regeneration returns pending; no production/network writes');

// Partial platform publication is irreversible history, not an editable draft.
let flexibleSource=fs.readFileSync(new URL('../src/flexible-publish-entry.js',import.meta.url),'utf8');
flexibleSource=flexibleSource.replace("import app from './authority-entry.js';",
  "const app={fetch:async()=>Response.json({email:'reviewer@example.com',role:'owner'})};");
flexibleSource=flexibleSource.replace("import { publishPostById, publisherConfiguration } from './social-publisher.js';",
  "const publishPostById=async()=>{throw Error('No external sends in test')};const publisherConfiguration=()=>({platforms:{}});");
flexibleSource=flexibleSource.replace("import { validatePostPayload } from './product-authority.js';",
  "const validatePostPayload=()=>[];");
const manualStart=flexibleSource.indexOf('async function setManualRequired(');
const manualEnd=flexibleSource.indexOf('async function changeManualRequiredStatus(',manualStart);
assert.ok(manualStart>=0&&manualEnd>manualStart);
assert.doesNotMatch(flexibleSource.slice(manualStart,manualEnd),/published_at=NULL/,
  'A partial handoff must preserve previously published_at');
const {changeManualRequiredStatus}=await import('data:text/javascript;base64,'+Buffer.from(flexibleSource).toString('base64'));

async function manualDraftScenario({publishedAt=null,receiptStatus='manual_required',receiptAt=null,remoteId=''}={}){
 let row={id:'TEST-PARTIAL',status:'manual_required',published_at:publishedAt,approved_by:'reviewer@example.com',image_approved:1};
 const deliveries=[{platform:'facebook',status:receiptStatus,published_at:receiptAt,remote_id:remoteId}];
 const writes=[],db={prepare(sql){
  return {bind(){return this},async first(){return row},async all(){return{results:deliveries}},
    async run(){
      writes.push(sql);
      if(sql.includes("UPDATE social_posts SET")){
        assert.match(sql,/AND status='manual_required'/);
        assert.match(sql,/published_at IS NULL AND NOT EXISTS/);
        assert.match(sql,/d.status='published'/);
        if(row.published_at||deliveries.some(d=>d.status==='published'||d.published_at||d.remote_id))
          return{meta:{changes:0}};
        row={...row,status:'draft',approved_by:null,image_approved:0};
      }
      return{meta:{changes:1}};
    }
  };
 }};
 const request=new Request('https://isolated.invalid/api/posts/TEST-PARTIAL/status',
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({status:'draft'})});
 const response=await changeManualRequiredStatus(request,{DB:db},{},row.id);
 return {response,row,writes};
}
for(const fixture of [
 {receiptStatus:'published',remoteId:'existing-remote'},
 {receiptStatus:'manual_required',receiptAt:'2026-10-23T09:00:00Z'},
 {receiptStatus:'manual_required',remoteId:'existing-remote'},
 {publishedAt:'2026-10-23T09:00:00Z'}
]){
 const outcome=await manualDraftScenario(fixture);
 assert.equal(outcome.response.status,409);
 assert.equal(outcome.row.status,'manual_required');
 assert.equal(outcome.writes.length,0,'Failed duplicate-replay guard must not mutate records');
}
const safeManual=await manualDraftScenario();
assert.equal(safeManual.response.status,200);
assert.equal(safeManual.row.status,'draft');
assert.ok(safeManual.writes.some(sql=>sql.includes('NOT EXISTS')));
console.log('PASS partial platform publication remains immutable; only an unposted manual handoff can return to draft');
