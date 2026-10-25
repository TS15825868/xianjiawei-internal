import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {lineHandoffApi} from '../src/line-handoff.js';
const base='https://internal.example/api/line-handoff';
const eventId='01JABCDEFGH123456789ABCDEF';
const owner=async()=>({email:'owner@example.test',role:'owner',active:1});
const sales=async()=>({email:'sales@example.test',role:'sales',active:1});
function request(url=base,method='GET',{origin=true,confirm=true,contentType='application/json'}={}){
 return new Request(url,{method,headers:{
  ...(origin?{'origin':'https://internal.example'}:{}),
  ...(method==='POST'?{'content-type':contentType}:{})
 },...(method==='POST'?{body:JSON.stringify({confirmManual:confirm})}:{})});
}
function fixture(){
 const receipt=new Map([[eventId,{event_id:eventId,event_type:'message',
 received_at:'2026-10-26T00:00:00Z',handling_status:'unhandled',event_json:'SUPER_PRIVATE'}]]);
 let claims=[],readCalls=0,writeCalls=0;
 const db={prepare(sql){
  assert.ok(!/event_json|replyToken|userId|message\\.text|SELECT\s+\*/i.test(sql),
   'API must never request customer private text or raw LINE tokens');
  let params=[];
  return{bind(...args){params=args;return this},
   async all(){
    readCalls++;
    assert.ok(sql.startsWith('SELECT r.event_id,'));
    const [limit,offset]=params;
    return {results:[...receipt.values()].filter(x=>x.handling_status==='unhandled')
     .map(x=>({...x,
       claim_id:claims.find(c=>c.event_id===x.event_id&&c.status==='claimed')?.claim_id||null,
       claimed_by:claims.find(c=>c.event_id===x.event_id&&c.status==='claimed')?.actor_email||null,
       claimed_at:claims.find(c=>c.event_id===x.event_id&&c.status==='claimed')?.claimed_at||null
      })).slice(offset,offset+limit)};
   },
   async run(){
    writeCalls++;
    if(sql.startsWith('INSERT OR IGNORE')){
     const [claim_id,idEmail,at,id]=params;
     if(!receipt.has(id)||claims.some(c=>c.event_id===id&&c.status==='claimed'))
      return {success:true,meta:{changes:0}};
     claims.push({claim_id,event_id:id,actor_email:idEmail,claimed_at:at,status:'claimed'});
     return{success:true,meta:{changes:1}};
    }
    if(sql.startsWith('UPDATE xjw_line_handoff_claims')){
     const [at,id,email,role]=params;
     const match=claims.find(c=>c.event_id===id&&c.status==='claimed'&&(c.actor_email===email||['owner','admin'].includes(role)));
     if(!match)return{success:true,meta:{changes:0}};
     match.status='released';match.released_at=at;
     return{success:true,meta:{changes:1}};
    }
    throw Error('unexpected mutation');
   }};
 }};
 return {db,receipt,claims,get reads(){return readCalls},get writes(){return writeCalls}};
}
test('all unauthenticated, inactive, non-customer-service roles fail before any D1 query',async()=>{
 const f=fixture(),env={DB:f.db};
 assert.equal((await lineHandoffApi(request(),env,{})).status,503);
 assert.equal((await lineHandoffApi(request(),env,{authenticate:async()=>{throw Error('auth secret')}})).status,401);
 for(const role of ['content','viewer','warehouse','accounting']){
  const r=await lineHandoffApi(request(),env,{authenticate:async()=>({role,active:1})});
  assert.equal(r.status,403,role);
 }
 assert.equal((await lineHandoffApi(request(),env,{authenticate:async()=>({role:'owner',active:0})})).status,403);
 assert.equal(f.reads,0);assert.equal(f.writes,0);
});
test('staff get only event metadata; never source, content or reply token',async()=>{
 const f=fixture();
 const response=await lineHandoffApi(request(),{DB:f.db},{authenticate:sales}),text=await response.text();
 const json=JSON.parse(text);
 assert.equal(response.status,200);
 assert.equal(json.items[0].eventId,eventId);
 assert.equal(json.items[0].assigned,false);
 assert.equal(json.readOnly,true);assert.equal(json.sent,false);
 assert.ok(!text.includes('SUPER_PRIVATE'));
 assert.ok(!text.includes('messageText'));
 assert.equal(f.reads,1);assert.equal(f.writes,0);
});
test('manual claim is atomic, second operator cannot steal claim',async()=>{
 const f=fixture(),env={DB:f.db};
 const first=await lineHandoffApi(request(base+'/'+eventId+'/claim','POST'),env,{authenticate:sales});
 assert.equal(first.status,200);assert.equal((await first.json()).customerReplySent,false);
 const repeat=await lineHandoffApi(request(base+'/'+eventId+'/claim','POST'),env,{authenticate:owner});
 assert.equal(repeat.status,409);
 assert.equal(f.claims.filter(x=>x.status==='claimed').length,1);
 assert.equal(f.claims[0].actor_email,'sales@example.test');
});
test('release restricted to assignee or owner/admin and preserves history',async()=>{
 const f=fixture(),env={DB:f.db};
 const claim=()=>request(base+'/'+eventId+'/claim','POST');
 const release=()=>request(base+'/'+eventId+'/release','POST');
 assert.equal((await lineHandoffApi(claim(),env,{authenticate:sales})).status,200);
 const other={email:'other@example.test',role:'sales',active:1};
 assert.equal((await lineHandoffApi(release(),env,{authenticate:async()=>other})).status,409);
 assert.equal((await lineHandoffApi(release(),env,{authenticate:owner})).status,200);
 assert.equal(f.claims[0].status,'released');
 assert.equal((await lineHandoffApi(claim(),env,{authenticate:sales})).status,200);
 assert.equal(f.claims.length,2,'Historical claim attempt retained');
});
test('POST cannot be used as a cross-origin request or silently via automation',async()=>{
 const f=fixture(),url=base+'/'+eventId+'/claim',env={DB:f.db};
 assert.equal((await lineHandoffApi(request(url,'POST',{origin:false}),env,{authenticate:owner})).status,403);
 assert.equal((await lineHandoffApi(request(url,'POST',{confirm:false}),env,{authenticate:owner})).status,400);
 assert.equal((await lineHandoffApi(request(url,'POST',{contentType:'text/plain'}),env,{authenticate:owner})).status,400);
 assert.equal(f.writes,0);
});
test('invalid route and unsupported method do not call D1',async()=>{
 const f=fixture(),env={DB:f.db};
 assert.equal((await lineHandoffApi(request(base+'/bad/event'),env,{authenticate:owner})).status,404);
 assert.equal((await lineHandoffApi(request(base,'POST'),env,{authenticate:owner})).status,405);
 assert.equal((await lineHandoffApi(request(base+'/'+eventId+'/claim','GET'),env,{authenticate:owner})).status,405);
 assert.equal(f.reads,0);assert.equal(f.writes,0);
});
test('database missing or failed writes cannot be reported as claimed',async()=>{
 const env={DB:{prepare(){return {bind(){return{run:async()=>{throw Error('private DB error')}}}}}}};
 const r=await lineHandoffApi(request(base+'/'+eventId+'/claim','POST'),env,{authenticate:owner});
 assert.equal(r.status,503);const t=await r.text();
 assert.ok(!t.includes('private DB error'));assert.equal(JSON.parse(t).sent,false);
 assert.equal((await lineHandoffApi(request(),{}, {authenticate:owner})).status,503);
});

test('full internal production route preserves Cloudflare Access instead of public bypass',()=>{
 const source=readFileSync(new URL('../src/full-system-entry.js',import.meta.url),'utf8');
 assert.match(source,/lineHandoffApi\(request,env,\{authenticate:verifyFastAccess\}\)/);
 assert.match(source,/if\(maintenance&&\['POST','PUT','PATCH','DELETE'\]/);
});
