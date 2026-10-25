import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifySocialWorkerTls,connectPgTlsClient} from './social-tls-preflight.mjs';
const config={
 host:'aws-0-ap-northeast-1.pooler.supabase.com',port:5432,
 user:'xjw_social_worker.iphexhvjhsmelbgwzhhr',password:'fixture-only',
 ca:'-----BEGIN CERTIFICATE-----\nfixture'
};
const verified={
 effective_role:'xjw_social_worker',tls_enabled:true,tls_version:'TLSv1.3',
 superuser:false,bypass_rls:false,can_read_control:true,can_read_work_queues:true,
 inbox_write_ready:true,comment_write_ready:true,reply_write_ready:true,
 human_takeover_rpc_ready:true,no_direct_human_override:true,no_delete_privilege:true,
 no_truncate_privilege:true,no_platform_control_admin:true,
 can_enable_platform:false,no_platform_control_update:true,can_delete_comment:false,
 platform_rows_expected:true,all_send_flags_off:true,all_tables_rls_enabled:true
};
function mockProbe(row=verified){
 const queries=[],options=[];
 let closed=0;
 const connect=async opts=>{
  options.push(opts);
  return {async query(sql){
    queries.push(sql);
    if(sql==='BEGIN READ ONLY'||sql==='ROLLBACK')return {rows:[]};
    if(/SELECT current_user AS effective_role/.test(sql))return {rows:[row]};
    throw Error('Unexpected query');
   },async end(){closed++;}
  };
 };
 return {connect,queries,options,get closed(){return closed;}};
}
test('operator probe authenticates through strict TLS and SELECT-only transaction',async()=>{
 const x=mockProbe();
 assert.deepEqual(await verifySocialWorkerTls({config,connect:x.connect}),
   {ok:true,tlsVerified:true,roleVerified:true,sendFlagsOff:true});
 assert.equal(x.options.length,1);
 assert.equal(x.options[0].ssl.rejectUnauthorized,true);
 assert.equal(x.options[0].max,1);
 assert.equal(x.queries[0],'BEGIN READ ONLY');
 assert.equal(x.queries.at(-1),'ROLLBACK');
 assert.ok(x.queries[1].includes('FROM pg_stat_ssl'));
 assert.ok(x.queries[1].includes('pg_roles'));
 assert.ok(x.queries[1].includes('platform_control'));
 for(const field of ['inbox_write_ready','comment_write_ready','reply_write_ready','no_delete_privilege','no_truncate_privilege','no_platform_control_admin','can_read_work_queues','no_platform_control_update'])
  assert.ok(x.queries[1].includes(field));
 assert.ok(x.queries.every(q=>q==='BEGIN READ ONLY'||q==='ROLLBACK'||q.startsWith('SELECT current_user AS effective_role,')));
 assert.equal(x.closed,1);
});
test('no trust in TLS version, wrong role, RLS bypass, disabled RLS or release flags',async()=>{
 for(const change of [
  {tls_enabled:false},{tls_version:'TLSv1.1'},{effective_role:'postgres'},
  {superuser:true},{bypass_rls:true},{can_read_control:false},
  {can_read_work_queues:false},{can_read_work_queues:null},
  {inbox_write_ready:false},{comment_write_ready:false},
  {human_takeover_rpc_ready:false},{no_direct_human_override:false},
  {reply_write_ready:false},{no_delete_privilege:false},
  {no_truncate_privilege:false},{no_truncate_privilege:null},
  {no_platform_control_admin:false},{no_platform_control_admin:null},
  {can_enable_platform:true},{no_platform_control_update:false},{no_platform_control_update:null},{can_delete_comment:true},
  {platform_rows_expected:false},{all_send_flags_off:false},
  {all_tables_rls_enabled:false},
 ]){
  const x=mockProbe({...verified,...change});
  await assert.rejects(verifySocialWorkerTls({config,connect:x.connect}),
    /Actual role, TLS, RLS/);
  assert.deepEqual(x.queries.slice(0,1),['BEGIN READ ONLY']);
  assert.equal(x.queries.at(-1),'ROLLBACK');
  assert.equal(x.closed,1);
 }
});
test('invalid project, role, missing CA and pooler port fail before opening socket',async()=>{
 for(const invalid of [
  {...config,host:'db.other.supabase.co'},
  {...config,user:'postgres.iphexhvjhsmelbgwzhhr'},
  {...config,ca:''},{...config,port:6543},{...config,password:''},
 ]){
  await assert.rejects(verifySocialWorkerTls({config:invalid,
   connect:()=>assert.fail('must not open socket')}),/Dedicated verified TLS/);
 }
});
test('connection errors close the private connection and never log or send',async()=>{
 let ended=0;
 const connect=async()=>({query:async sql=>{
  if(sql==='BEGIN READ ONLY')return {};
  if(sql==='ROLLBACK')return {};
  throw Error('simulated protected connection error');
 },end:async()=>{ended++;}});
 await assert.rejects(verifySocialWorkerTls({config,connect}),/simulated protected/);
 assert.equal(ended,1);
});

test('explicit system-root TLS verifies the official shared session pooler hostname without using a mismatched project CA',async()=>{
 const safe={...config,ca:undefined,trustStore:'system'};
 const x=mockProbe();
 assert.deepEqual(await verifySocialWorkerTls({config:safe,connect:x.connect}),
  {ok:true,tlsVerified:true,roleVerified:true,sendFlagsOff:true});
 assert.equal(x.options[0].ssl.rejectUnauthorized,true);
 assert.equal(x.options[0].ssl.servername,config.host);
 assert.equal(x.options[0].ssl.minVersion,'TLSv1.2');
 assert.equal(Object.hasOwn(x.options[0].ssl,'ca'),false);
 assert.equal(x.closed,1);
});
test('system-root mode is never a TLS bypass, wrong host shortcut, or direct-DB override',async()=>{
 for(const bad of [
  {...config,ca:undefined,trustStore:'system',host:'evil.example'},
  {...config,ca:undefined,trustStore:'system',host:'db.iphexhvjhsmelbgwzhhr.supabase.co'},
  {...config,ca:undefined,trustStore:'system',port:6543},
  {...config,ca:undefined,trustStore:'system',user:'postgres.iphexhvjhsmelbgwzhhr'},
  {...config,ca:'fake',trustStore:'system'},
  {...config,ca:undefined,trustStore:'none'},
 ])await assert.rejects(verifySocialWorkerTls({config:bad,
  connect:()=>assert.fail('Unsafe configuration opened a socket')}),/Dedicated verified TLS/);
});


test('explicit Edge transaction pooler preflight uses one SELECT without unsafe session commands',async()=>{
 const x=mockProbe();
 const transaction={...config,port:6543,runtime:'edge',poolMode:'transaction',ca:undefined,trustStore:'system'};
 assert.deepEqual(await verifySocialWorkerTls({config:transaction,connect:x.connect}),
  {ok:true,tlsVerified:true,roleVerified:true,sendFlagsOff:true});
 assert.equal(x.options[0].port,6543);
 assert.equal(x.options[0].ssl.rejectUnauthorized,true);
 assert.equal(x.options[0].ssl.servername,config.host);
 assert.equal(Object.hasOwn(x.options[0].ssl,'ca'),false);
 assert.equal(x.queries.length,1);
 assert.ok(x.queries[0].startsWith('SELECT current_user AS effective_role,'));
 assert.equal(x.closed,1);
});
test('transaction pooler requires Edge-only explicit scope and fails before network',async()=>{
 for(const invalid of [
  {...config,port:6543},
  {...config,port:6543,poolMode:'transaction'},
  {...config,port:6543,runtime:'edge'},
  {...config,port:6543,runtime:'n8n',poolMode:'transaction'},
  {...config,port:6543,runtime:'edge',poolMode:'session'},
  {...config,port:5432,runtime:'edge',poolMode:'transaction'},
  {...config,port:6543,runtime:'edge',poolMode:'transaction',host:'aws-0-ap-southeast-1.pooler.supabase.com'},
  {...config,port:6543,runtime:'edge',poolMode:'transaction',user:'postgres.iphexhvjhsmelbgwzhhr'},
 ]){
  await assert.rejects(verifySocialWorkerTls({config:invalid,connect:()=>assert.fail('must not dial')}),/Dedicated verified TLS/);
 }
});

test('failed TLS or auth handshake retires the attempted pg client and keeps original failure',async()=>{
 for(const failClose of [false,true]){
  let closed=0;
  class FakeClient{
   constructor(options){assert.equal(options.ssl.rejectUnauthorized,true);}
   async connect(){throw Error('protected tls handshake failed');}
   async end(){closed++;if(failClose)throw Error('retire error');}
  }
  await assert.rejects(connectPgTlsClient(FakeClient,{ssl:{rejectUnauthorized:true}}),/protected tls handshake failed/);
  assert.equal(closed,1);
 }
});
test('successful protected driver connect remains open for the caller to verify and close',async()=>{
 let connected=0,closed=0;
 class FakeClient{
  async connect(){connected++;}
  async end(){closed++;}
 }
 const client=await connectPgTlsClient(FakeClient,{ssl:{rejectUnauthorized:true}});
 assert.equal(connected,1);
 assert.equal(closed,0);
 await client.end();
 assert.equal(closed,1);
});

test('worker preflight rejects TRUNCATE on every private ledger and INSERT/REFERENCES/TRIGGER on platform control',async()=>{
 const x=mockProbe();
 await verifySocialWorkerTls({config,connect:x.connect});
 const sql=x.queries.find(q=>q.startsWith('SELECT current_user AS effective_role,'));
 for(const table of ['webhook_inbox','comment_ledger','reply_ledger','platform_control'])
  assert.ok(sql.includes(`has_table_privilege(current_user,'xjw_social.${table}','TRUNCATE')`));
 for(const privilege of ['INSERT','REFERENCES','TRIGGER'])
  assert.ok(sql.includes(`has_table_privilege(current_user,'xjw_social.platform_control','${privilege}')`));
});

test('human takeover uses an execute-only scoped RPC, never direct ledger update',async()=>{
 const x=mockProbe();
 await verifySocialWorkerTls({config,connect:x.connect});
 const sql=x.queries.find(q=>q.includes('AS human_takeover_rpc_ready'));
 assert.ok(sql);
 assert.match(sql,/has_function_privilege\(current_user,'xjw_social\.mark_human_takeover\(text,text,text,text\)','EXECUTE'\)/);
 assert.match(sql,/NOT has_column_privilege\(current_user,'xjw_social\.comment_ledger','human_takeover','UPDATE'\)/);
 const {readFileSync}=await import('node:fs');
 const migration=readFileSync(new URL('../docs/n8n/revoke-direct-human-takeover-20261025.sql',import.meta.url),'utf8');
 assert.match(migration,/REVOKE UPDATE \(human_takeover\) ON xjw_social\.comment_ledger FROM xjw_social_worker/);
 assert.match(migration,/has_function_privilege/);
 assert.doesNotMatch(migration,/GRANT UPDATE|DISABLE ROW LEVEL SECURITY|DROP TABLE|DELETE FROM/i);
});
