import test from 'node:test';
import assert from 'node:assert/strict';
import {createD1Transport} from './d1-http-transport.mjs';
const config={token:'private-token',accountId:'example-account',databaseId:'12345678-1234-1234-1234-123456789012'};
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
test('one bounded HTTP request with scoped token, no extra network calls',async()=>{
  let calls=0;
  const exec=createD1Transport({...config,fetchImpl:async(url,opt)=>{
    calls++;
    assert.match(url,/cloudflare\.com\/client\/v4\/accounts\/example-account\/d1\/database/);
    assert.equal(opt.headers.Authorization,'Bearer private-token');
    assert.equal(opt.method,'POST');
    assert.deepEqual(JSON.parse(opt.body),{sql:'SELECT 1'});
    return response({success:true,result:[{success:true,results:[{value:1}],meta:{changes:0}}]});
  }});
  assert.deepEqual((await exec('SELECT 1'))[0].results,[{value:1}]);
  assert.equal(calls,1);
});
test('multi-statement write results preserve CAS changes for callers',async()=>{
  const exec=createD1Transport({...config,fetchImpl:async()=>response({success:true,result:[
    {success:true,meta:{changes:1}}, {success:true,meta:{changes:1}}
  ]})});
  const rows=await exec("UPDATE social_posts SET status='pending_review'; INSERT INTO social_post_quality_reviews SELECT 1");
  assert.equal(rows.length,2);
  assert.equal(rows[0].meta.changes,1);
  assert.equal(rows[1].meta.changes,1);
});
test('failed inner SQL, failed top-level SQL and invalid response never succeed',async()=>{
  for(const payload of [{success:false,result:[{success:true}]},{success:true,result:[{success:false}]},{success:true,result:[]}]){
    const exec=createD1Transport({...config,fetchImpl:async()=>response(payload)});
    await assert.rejects(exec('SELECT 1'),/verified success/);
  }
});
test('HTTP denial and transport timeout do not retry writes or expose secrets',async()=>{
  let n=0;
  const exec=createD1Transport({...config,fetchImpl:async()=>{n++;return response({errors:['PRIVATE']},403)}});
  await assert.rejects(exec('UPDATE private SET secret=1'),err=>!err.message.includes('private-token')&&!err.message.includes('PRIVATE'));
  assert.equal(n,1);
  let tries=0;
  const timed=createD1Transport({...config,fetchImpl:async()=>{tries++;throw Error('secret timeout')}});
  await assert.rejects(timed('UPDATE a SET b=1'),/reconcile before retry/);
  assert.equal(tries,1);
});
test('missing credentials and blank SQL fail closed',async()=>{
  assert.throws(()=>createD1Transport({...config,token:''}),/unavailable/);
  const exec=createD1Transport({...config,fetchImpl:async()=>{assert.fail('fetch should not run')}});
  await assert.rejects(exec(' '),/Invalid D1 SQL/);
});
