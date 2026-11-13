import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readFormalFirstPost,FIRST_POST_ID} from '../src/social-first-post-bootstrap.js';
import {shouldKeepLineWarmAt} from '../src/production-entry.js';

const root=new URL('../',import.meta.url);
const source=path=>readFileSync(new URL(path,root),'utf8');

test('scheduler uses just one LINE warm path, every 5 minutes, alongside minute-level reviewed posts',()=>{
 const production=source('src/production-entry.js');
 const flexible=source('src/flexible-publish-entry.js');
 const full=source('src/full-system-entry.js');
 assert.equal((production.match(/ctx\.waitUntil\(keepLineWarm\(\)\)/g)||[]).length,1);
 assert.match(production,/if\(shouldKeepLineWarmAt\(scheduledAt\)\)ctx\.waitUntil\(keepLineWarm\(\)\)/);
 assert.match(flexible,/const ctl=new AbortController\(\),timer=setTimeout\(\(\)=>ctl\.abort\(\),15000\)/);
 assert.match(flexible,/finally\{clearTimeout\(timer\)\}/);
 assert.equal((flexible.match(/ctx\.waitUntil\(keepLineWarm\(\)\)/g)||[]).length,0);
 assert.match(production,/guarded\.checked===guarded\.quarantined/);
 assert.match(full,/getUTCMinutes\(\)%15===0/);
 assert.doesNotMatch(full,/ensureFormalFirstPost\(env\)/);
});
test('historical first post health never executes a D1 mutation',async()=>{
 let reads=0;
 const env={DB:{prepare(sql){
  assert.ok(/^SELECT /i.test(sql),'Historical health must never write D1');
  return{bind(id){assert.equal(id,FIRST_POST_ID);return this;},async first(){
   reads++;if(sql.includes('social_post_review_gates'))return{copy_image_match:1,reviewed_by:'staff'};
   return{id:FIRST_POST_ID,status:'published',published_at:'2026-09-04T01:00:00Z',scheduled_at:null,title:'正式歷史首篇',image_approved:1};
  }};
 }}};
 const result=await readFormalFirstPost(env);
 assert.equal(result.ok,true);assert.equal(result.exists,true);assert.equal(result.post.status,'published');
 assert.equal(result.post.scheduled_at,'');assert.equal(result.gate.ready,true);
 assert.equal(reads,2);
});
test('missing historical post does not trigger a backdated new post',async()=>{
 let operations=0;
 const env={DB:{prepare(sql){
  operations++;assert.ok(/^SELECT /i.test(sql));
  return{bind(){return this;},async first(){return null}};
 }}};
 const result=await readFormalFirstPost(env);
 assert.deepEqual([result.ok,result.exists,result.historicalOnly],[true,false,true]);
 assert.equal(operations,1);
});
test('D1 missing or failing never fabricates historical success',async()=>{
 assert.equal((await readFormalFirstPost({})).ok,false);
 const env={DB:{prepare(){throw Error('private connection details');}}};
 const r=await readFormalFirstPost(env);
 assert.equal(r.ok,false);
 assert.ok(!JSON.stringify(r).includes('private connection'));
});

test('every five minutes yields 12 heartbeat attempts hourly without switching off the publishing cron',()=>{
 const epoch=Date.parse('2026-10-26T00:00:00Z');
 const ticks=[];
 for(let minute=0;minute<60;minute++)if(shouldKeepLineWarmAt(epoch+minute*60000))ticks.push(minute);
 assert.deepEqual(ticks,[0,5,10,15,20,25,30,35,40,45,50,55]);
 for(const invalid of [NaN,undefined,0,Infinity])assert.equal(shouldKeepLineWarmAt(invalid),false);
});

test('formal cadence stays Tuesday and Friday 10:00 Taipei, with Sunday only optional',async()=>{
 const policy=JSON.parse(source('ops/social-publishing-cadence-current.json'));
 assert.equal(policy.weeklyCadence.normalPostsPerWeek,2);
 assert.equal(policy.weeklyCadence.specialWeekMaxPosts,3);
 assert.deepEqual(policy.weeklyCadence.slots,[{weekday:'Tuesday',time:'10:00'},{weekday:'Friday',time:'10:00'},{weekday:'Sunday',time:'10:00',optional:true}]);
 const {nextMetricoolSlot,metricoolConfiguration}=await import('../src/metricool-sync.js');
 assert.match(metricoolConfiguration().defaultPolicy,/週二／週五.*10:00/);
 assert.equal(nextMetricoolSlot(new Date('2026-11-13T01:59:00Z')),'2026-11-13T02:00:00.000Z');
 assert.equal(nextMetricoolSlot(new Date('2026-11-13T02:01:00Z')),'2026-11-17T02:00:00.000Z');
 assert.equal(nextMetricoolSlot(new Date('2026-11-13T02:01:00Z'),['2026-11-17T02:00:00.000Z']),'2026-11-20T02:00:00.000Z');
 for(const path of ['src/worker.js','src/flexible-publish-entry.js']){
   assert.doesNotMatch(source(path),/週一／週三／週五 09:00/);
   assert.match(source(path),/週二／週五 10:00/);
 }
});
