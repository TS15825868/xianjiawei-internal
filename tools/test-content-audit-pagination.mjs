import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../assets/js/publishing-review-gate.js',import.meta.url),'utf8');
const isolate=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const functions=isolate('  function validateAudit(', '  function cardId(')+isolate('  async function auditIds(', '  function scheduleAudit(');
const rows=Array.from({length:83},(_,i)=>({id:`post-${i}`,ok:i%3!==0,errors:i%3===0?['image review required']:[]}));
let mode='normal',calls=[];
const ctx={Date,Set,Number,Error,encodeURIComponent,api:async path=>{
 calls.push(path); const u=new URL('https://example.test'+path);const offset=Number(u.searchParams.get('offset')||0);
 const ids=u.searchParams.get('ids');let items=ids?rows.filter(r=>ids.split(',').includes(r.id)):rows.slice(offset,offset+4);
 if(mode==='truncate')items=items.slice(0,1);
 const next=offset+items.length<rows.length?offset+items.length:null;
 return{items,total:items.length,problem_count:items.filter(r=>!r.ok).length,offset,library_total:rows.length,next_offset:mode==='stuck'?offset:next};
}};
vm.createContext(ctx);vm.runInContext(functions+';this.auditIds=auditIds;this.fullAudit=fullAudit;this.clearCache=()=>{fullAuditCache={at:0,result:null}}',ctx);
let result=await ctx.auditIds(rows.map(r=>r.id));assert.equal(result.total,83);assert.equal(calls.length,21);
assert.ok(calls.every(p=>new URL('https://example.test'+p).searchParams.get('ids').split(',').length<=4));
calls=[];result=await ctx.fullAudit();assert.equal(result.total,83);assert.equal(calls.length,21);assert.equal(result.problem_count,28);
await ctx.fullAudit();assert.equal(calls.length,21,'complete scan is cached without duplicate full-library calls');
ctx.clearCache();mode='stuck';await assert.rejects(()=>ctx.fullAudit(),/分頁不完整/);
mode='truncate';await assert.rejects(()=>ctx.auditIds(rows.slice(0,4).map(r=>r.id)),/結果不完整/);
console.log('PASS 83 posts across 21 bounded batches; complete cache; truncated and non-progressing responses fail closed');


// The production content-audit wrapper runs before the inner publication gate.
// Exercise its actual preflight function with the existing canonical role set.
// Mock all D1 and publication dependencies; never query real posts.
{
 const auditSource=fs.readFileSync(new URL('../src/publishing-content-audit-entry.js',import.meta.url),'utf8');
 const gateSource=fs.readFileSync(new URL('../src/publishing-review-gate-entry.js',import.meta.url),'utf8');
 const roleDeclaration=gateSource.split('\n').find(line=>line.startsWith('const REGENERATION_ROLES='));
 const start=auditSource.indexOf('async function enforceBeforeWrite(');
 const end=auditSource.indexOf('export default',start);
 assert.ok(roleDeclaration&&start>=0&&end>start);
 assert.ok(auditSource.includes("import { REGENERATION_ROLES } from './publishing-review-gate-entry.js';"));
 let auth,reads=0,scans=0,audits=0;
 const row={id:'isolated'};
 const sandbox={
  authorize:async()=>auth,
  postRow:async()=>{reads++;return row;},
  liveRows:async()=>{scans++;return [row];},
  auditOne:async()=>{audits++;return {ok:true};},
  clean:value=>String(value??'').trim(),
  json:(body,status=200)=>Response.json(body,{status})
 };
 vm.createContext(sandbox);
 vm.runInContext(roleDeclaration+'\n'+auditSource.slice(start,end)+'\nthis.preflight=enforceBeforeWrite;',sandbox);
 for(const role of ['viewer','sales','warehouse','accounting','unknown','',null]){
  auth=Response.json({role});
  assert.equal((await sandbox.preflight({}, {}, {}, row.id)).status,403);
 }
 auth=new Response('not JSON');
 assert.equal((await sandbox.preflight({}, {}, {}, row.id)).status,403);
 auth=Response.json({error:'unauthenticated'},{status:401});
 assert.equal((await sandbox.preflight({}, {}, {}, row.id)).status,401);
 assert.deepEqual([reads,scans,audits],[0,0,0]);
 for(const role of ['owner','admin','content']){
  auth=Response.json({role});
  assert.equal(await sandbox.preflight({}, {}, {}, row.id),null);
 }
 assert.deepEqual([reads,scans,audits],[3,3,3]);
 console.log('PASS unauthorized content-audit mutations stop before any post lookup or full-library scan; authorized audit unchanged');
}
