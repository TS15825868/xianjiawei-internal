import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publishPostById} from '../src/social-publisher.js';
const src=readFileSync(new URL('../src/flexible-publish-entry.js',import.meta.url),'utf8');
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
test('legacy manual status does not fabricate published or write remote IDs',()=>{
 assert.match(src,/if\(next==='published'\)return json\(\{error:/);
 assert.doesNotMatch(src,/async function completeManualDeliveries|status='published',published_at=COALESCE/);
 assert.doesNotMatch(src,/manualDeliveriesCompleted=await|manualDeliveriesCompleted\+\+/);
 assert.match(worker,/if\(next==='published'\)return json\(\{error:/);
});
test('immediate publisher delegates to canonical atomic D1 sender without rewriting platform selection',()=>{
 assert.match(src,/const result=await publishPostById\(env,id,new Date\(\)\)/);
 assert.doesNotMatch(src,/UPDATE social_posts SET platforms_json=\?/);
 assert.doesNotMatch(src,/for\(const platform of manualPlatforms\)await markManualDelivery/);
 assert.doesNotMatch(src,/async function markManualDelivery/);
 assert.match(src,/result\?\.manual_required\|\|manualPlatforms\.length/);
 assert.match(src,/return json\(\{\s*ok:false,id,status:/);
 assert.match(src,/manual\?409:502/);
});
test('uncertain remote delivery blocks rollback to draft, including a sending state',()=>{
 assert.match(src,/const anyRemoteEvidence=before\.published_at\|\|deliveries\.some/);
 assert.match(src,/Number\(d\.attempt_count\|\|0\)>0\|\|d\.last_attempt_at/);
 assert.match(src,/d\.status IN \('sending','retry','published'\)/);
 assert.match(src,/if\(changed\?\.success!==true\|\|Number\(changed\?\.meta\?\.changes\)!==1\)/);
});
test('staff-only per-platform readout counts published only when remote ID is present',()=>{
 assert.match(src,/published_platforms:platforms\.filter\(\(item\)=>item\.status==='published'&&clean\(item\.remote_id\)\)/);
 assert.match(src,/item\.status==='published'&&!clean\(item\.remote_id\)/);
});
test('the canonical sender preserves original multi-platform audience and puts uncertain writes in manual reconciliation',async()=>{
 const post={id:'P-FLEX-SAFE',status:'approved',headline:'安全測試',copy:'無客戶訊息',
  image_url:'https://assets.example.test/approved.webp',
  platforms_json:'["Facebook","LINE VOOM"]'};
 const deliveries=new Map(),mutations=[],beforeValue=post.platforms_json;
 const DB={prepare(sql){
  let args=[];
  return {bind(...v){args=v;return this},
   async first(){
    if(sql.includes('FROM social_metricool_sync'))return null;
    if(sql.includes('FROM social_posts'))return {...post};
    if(sql.includes('FROM social_publish_deliveries'))return deliveries.get(args[1])||null;
    throw Error('unexpected read');
   },
   async run(){
    mutations.push({sql,args});
    if(sql.startsWith('INSERT OR IGNORE INTO social_publish_deliveries')){
      if(deliveries.has(args[1]))return {success:true,meta:{changes:0}};
      deliveries.set(args[1],{status:'sending'});return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith('INSERT INTO social_publish_deliveries')){
      deliveries.set(args[1],{status:args[2],remote_id:args[5]});
      return {success:true,meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE social_posts SET')){
      post.status='manual_required';
      return {success:true,meta:{changes:1}};
    }
    throw Error('unexpected mutation');
   }
  };
 }};
 const oldFetch=globalThis.fetch;let count=0;
 globalThis.fetch=async()=>{count++;return new Response('{"id":"facebook-remote-001"}',{status:200})};
 try{
  const result=await publishPostById({DB,META_PAGE_ID:'123',META_INSTAGRAM_USER_ID:'456',META_PAGE_ACCESS_TOKEN:'local-fixture'},post.id);
  assert.equal(result.ok,false);
  assert.equal(result.manual_required,true);
  assert.equal(count,1);
  assert.equal(post.platforms_json,beforeValue);
  assert.equal(deliveries.get('Facebook').status,'published');
  assert.equal(deliveries.get('LINE VOOM').status,'manual_required');
  assert.equal(post.status,'manual_required');
  assert.ok(mutations.every(x=>!x.sql.includes('SET platforms_json=')));
 }finally{globalThis.fetch=oldFetch}
});
