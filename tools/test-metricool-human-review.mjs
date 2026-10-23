import assert from 'node:assert/strict';
import {gateState,fingerprint,REQUIRED_CHECKS} from '../src/publishing-review-gate-entry.js';
import {nextMetricoolSlot,metricoolBody,metricoolConfiguration,syncMetricool,requiresDatedSchedule,enqueueMetricool,metricoolScheduleCapacity} from '../src/metricool-sync.js';
const row={id:'SAFE-TEST',title:'仙加味',headline:'萬華日常',copy:'仙加味的日常工藝',category:'品牌',image_url:'https://example.com/a.jpg',image_alt:'萬華日常',image_source:'情境',image_width:1254,image_height:1254,image_quality_status:'ok',approved_by:'human@example.com'};
let gate={post_id:row.id,content_fingerprint:await fingerprint(row),checklist_json:JSON.stringify(Object.fromEntries(REQUIRED_CHECKS.map(x=>[x,true]))),copy_image_match:1,reviewed_by:'human@example.com',reviewed_at:new Date().toISOString()};
const env={DB:{exec:async()=>({}),prepare:()=>({bind:()=>({first:async()=>gate})})}};
assert.equal((await gateState(env,row)).ok,true);
gate={...gate,reviewed_by:'chatgpt:owner-delegated-reviewed'};assert.equal((await gateState(env,row)).ok,false);
gate={...gate,reviewed_by:'human@example.com',checklist_json:'{}'};assert.equal((await gateState(env,row)).ok,false);
gate={...gate,checklist_json:JSON.stringify(Object.fromEntries(REQUIRED_CHECKS.map(x=>[x,true])))};assert.equal((await gateState(env,{...row,copy:'版本已變更'})).ok,false);
assert.equal((await gateState(env,{...row,approved_by:null})).ok,false);
assert.equal(nextMetricoolSlot(new Date('2026-10-13T10:00:00Z')),'2026-10-14T01:00:00.000Z');
assert.equal(nextMetricoolSlot(new Date('2026-10-13T10:00:00Z'),['2026-10-14T10:00:00+08:00']),'2026-10-16T01:00:00.000Z');
const body=metricoolBody(row,{uuid:'stable-uuid',metricool_id:1,template_json:'{"twitterData":{"type":"POST"}}'},'2026-10-16T10:00:00+08:00');
assert.equal(body.uuid,'stable-uuid');assert.equal(body.publicationDate.dateTime,'2026-10-16T10:00:00');assert.equal(body.twitterData,undefined);assert.equal(body.instagramData.autoPublish,true);assert.deepEqual(body.providers.map(p=>p.network),['facebook','instagram','threads']);
assert.equal(metricoolConfiguration({}).enabled,false);
let unboundQueries=0;
const unbound={METRICOOL_API_TOKEN:'unit-test-not-a-real-credential',DB:{prepare:sql=>({run:async()=>({}),first:async()=>null,all:async()=>{unboundQueries++;throw Error('Must not discover before existing UUIDs are bound')}})}};
assert.equal((await syncMetricool(unbound,{})).blocked,'METRICOOL_EXISTING_UUID_BOOTSTRAP_REQUIRED');
assert.equal(unboundQueries,0);
const nativeFetch=globalThis.fetch;
async function simulate(link,{gateOK=true,now='2026-10-13T12:00:00Z'}={}){
  const writes=[],calls=[];
  const scheduledRow={...row,status:'scheduled'};
  const db={prepare:sql=>{const statement={bind(...args){this.args=args;return this},async first(){if(sql.includes('social_metricool_control'))return{setting_value:'20261013-eight-recovery'};if(sql.includes('FROM social_posts'))return scheduledRow;throw Error(sql)},async all(){if(sql.includes('LEFT JOIN'))return{results:[]};if(sql.includes('SELECT * FROM social_metricool_sync'))return{results:['scheduled','queued','blocked_config','awaiting_work'].includes(link.state)?[link]:[]};throw Error(sql)},async run(){writes.push({sql,args:this.args});return{meta:{changes:1}}}};return statement}};
  globalThis.fetch=async()=>{calls.push(1);throw Error('Free Worker must never call Metricool')};
  try{await syncMetricool({DB:db,METRICOOL_API_TOKEN:'ignored'}, {gateState:async()=>({ok:gateOK,reason:'test invalid review'}),fingerprint:async()=>link.content_fingerprint},new Date(now));return{writes,calls}}finally{globalThis.fetch=nativeFetch}
}
const baseLink={post_id:row.id,metricool_id:1,uuid:'stable-uuid',state:'scheduled',content_fingerprint:'fp',publication_at:'2026-11-06T10:00:00+08:00',attempts:0};
const future=await simulate(baseLink);assert.equal(future.calls.length,0);assert.equal(future.writes.filter(x=>x.sql.startsWith('UPDATE')).length,0);
const elapsed=await simulate(baseLink,{now:'2026-11-07T00:00:00Z'});assert(elapsed.writes.some(x=>x.args?.includes('awaiting_verification')));assert.equal(elapsed.calls.length,0);assert(!elapsed.writes.some(x=>x.sql.includes("SET status='published'")));
const invalid=await simulate(baseLink,{gateOK:false});assert(invalid.writes.some(x=>x.args?.includes('cancel_required')));assert.equal(invalid.calls.length,0);
const queued=await simulate({...baseLink,state:'blocked_config'});assert(queued.writes.some(x=>x.args?.includes('awaiting_work')));
const unknown=await simulate({...baseLink,state:'unknown'});assert.equal(unknown.calls.length,0);assert.equal(unknown.writes.filter(x=>x.sql.startsWith('UPDATE')).length,0);
assert.equal(metricoolConfiguration({METRICOOL_API_TOKEN:'ignored'}).serverApiEnabled,false);
assert.equal(metricoolConfiguration().monthlyPublishedPlatformLimit,20);
console.log('PASS: free plan never calls server API; existing schedules unchanged; elapsed dates await verification, not success; invalid review needs cancellation; unknown writes never retry; AI cannot approve');
assert.equal(requiresDatedSchedule({...row,title:'元宵，一起把湯圓搓好'}),true);
assert.equal(requiresDatedSchedule(row),false);
const festivalDB={prepare:sql=>({bind(){return this},run:async()=>({}),first:async()=>null,all:async()=>{throw Error('Seasonal post must not reserve an arbitrary weekday')}})};
const festival=await enqueueMetricool({DB:festivalDB},{...row,status:'approved',title:'除夕，替家人留一個位置'},{gateState:async()=>({ok:true}),fingerprint:async()=> 'fp'},new Date('2026-10-14T00:00:00Z'));
assert.equal(festival.ok,false);assert.match(festival.error,/節慶/);
console.log('PASS holiday posts without explicit dates cannot enter ordinary October slots');

assert.equal(metricoolConfiguration().humanReviewRequired,true);
assert.deepEqual(metricoolConfiguration().approvalModes,['HUMAN_APPROVED']);
assert.equal((await gateState(env,{...row,approved_by:'ai:model',review_note:'AI審核：AI_APPROVED；'})).ok,false);
assert.equal((await gateState(env,{...row,review_note:'AI審核：AI_APPROVED；'})).ok,false);


const duplicatedPost={...row,id:'fresh-approved',status:'approved',
 copy:'仙加味萬華的漢方飲食文化，以每天準備溫熱飲品的生活情境傳達給大家。'};
const archivedSibling={id:'older',copy:duplicatedPost.copy+'  ',image_url:'https://example.com/unrelated.jpg'};
const peers=[archivedSibling],writes=[];
const duplicateDb={prepare(sql){return{
 bind(){return this},
 async first(){return null},
 async all(){
  if(sql.includes('FROM social_posts WHERE id<>?'))return{results:peers};
  if(sql.includes('SELECT publication_at,state FROM social_metricool_sync'))return{results:[]};
  throw Error('Unexpected query '+sql);
 },
 async run(){writes.push(sql);return{meta:{changes:1}}}
}}};
const duplicateChecks={gateState:async()=>({ok:true}),fingerprint:async()=> 'new-fingerprint'};
const blockedCopy=await enqueueMetricool({DB:duplicateDb},duplicatedPost,duplicateChecks,new Date('2026-10-14T00:00:00Z'));
assert.equal(blockedCopy.ok,false);assert.match(blockedCopy.error,/重複/);
assert.equal(writes.filter(sql=>sql.includes('INSERT INTO social_metricool_sync')).length,0);
peers[0].copy='內容完全不同的先前貼文';
peers[0].image_url=duplicatedPost.image_url+'?v=earlier';
const blockedImage=await enqueueMetricool({DB:duplicateDb},duplicatedPost,duplicateChecks,new Date('2026-10-14T00:00:00Z'));
assert.equal(blockedImage.ok,false);assert.match(blockedImage.error,/重複/);
assert.equal(writes.filter(sql=>sql.includes('INSERT INTO social_metricool_sync')).length,0);
peers[0].image_url='https://example.com/unrelated.jpg';
const unique=await enqueueMetricool({DB:duplicateDb},duplicatedPost,duplicateChecks,new Date('2026-10-14T00:00:00Z'));
assert.equal(unique.ok,true);assert.equal(unique.queued,true);
assert.equal(unique.externalScheduled,false);
assert.equal(writes.filter(sql=>sql.includes('INSERT INTO social_metricool_sync')).length,1);
console.log('PASS changed post-approval sibling copy or image blocks duplicate enqueue; unique still awaits Work');

const quotaLinks=Array.from({length:6},(_,i)=>({publication_at:`2026-11-${String(2+i*3).padStart(2,'0')}T10:00:00+08:00`,state:'scheduled'}));
const enough=metricoolScheduleCapacity(quotaLinks.slice(0,5),'2026-11-22T10:00:00+08:00');
assert.equal(enough.ok,true);assert.equal(enough.withCandidate,18);
const full=metricoolScheduleCapacity(quotaLinks,'2026-11-22T10:00:00+08:00');
assert.equal(full.ok,false);assert.equal(full.reason,'local_free_quota_exceeded');assert.equal(full.withCandidate,21);
assert.equal(metricoolScheduleCapacity(quotaLinks,'2026-12-02T10:00:00+08:00').ok,true);
const collision=metricoolScheduleCapacity([{publication_at:'2026-10-26T09:00:00+08:00',state:'scheduled'}],'2026-10-26T10:00:00+08:00');
assert.equal(collision.slotConflict,true);
assert.equal(metricoolScheduleCapacity([{publication_at:'not-a-date',state:'unknown'}],'2026-10-26T10:00:00+08:00').ok,false);
const quotaTests=[];
const quotaDB={prepare(sql){return{
  bind(){return this},first:async()=>null,
  async all(){
   if(sql.includes('FROM social_posts WHERE id<>?'))return{results:[]};
   if(sql.includes('SELECT publication_at,state FROM social_metricool_sync'))return{results:quotaLinks};
   throw Error('Unexpected local quota SQL '+sql);
  },async run(){quotaTests.push(sql);return{meta:{changes:1}}}
}}};
const quotaBlocked=await enqueueMetricool({DB:quotaDB},
 {...row,id:'quota-verified',status:'approved',scheduled_at:'2026-11-22T10:00:00+08:00'},
 {gateState:async()=>({ok:true}),fingerprint:async()=> 'safe-fp'},
 new Date('2026-10-23T00:00:00Z'));
assert.equal(quotaBlocked.ok,false);assert.equal(quotaBlocked.code,'local_free_quota_exceeded');
assert.equal(quotaTests.filter(q=>q.includes('INSERT INTO social_metricool_sync')).length,0);
console.log('PASS Metricool: 20 published platform slots maximum, multi-network slots counted, same-day collisions detectable and fail closed; external counter must be verified');
