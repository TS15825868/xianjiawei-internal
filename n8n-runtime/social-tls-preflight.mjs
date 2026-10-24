// Operator-only read-only TLS acceptance check. Never a public endpoint.
// This verifies actual login to the existing private xjw_social schema, rather
// than mistaking a mocked CA/configuration unit test for production TLS success.
import {socialTlsOptions} from './social-tls.mjs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';

const CHECK=String.raw`SELECT current_user AS effective_role,
 s.ssl AS tls_enabled, s.version AS tls_version,
 p.rolsuper AS superuser, p.rolbypassrls AS bypass_rls,
 has_table_privilege(current_user,'xjw_social.webhook_inbox','INSERT') AND
 has_column_privilege(current_user,'xjw_social.webhook_inbox','status','UPDATE') AS inbox_write_ready,
 has_table_privilege(current_user,'xjw_social.comment_ledger','INSERT') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','status','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','decision','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','human_takeover','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','error_code','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','retry_state','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.comment_ledger','updated_at','UPDATE') AS comment_write_ready,
 has_table_privilege(current_user,'xjw_social.reply_ledger','INSERT') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','state','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','remote_reply_id','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','sent_at','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','error_code','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','retry_state','UPDATE') AND
 has_column_privilege(current_user,'xjw_social.reply_ledger','updated_at','UPDATE') AS reply_write_ready,
 NOT (has_table_privilege(current_user,'xjw_social.webhook_inbox','DELETE') OR
 has_table_privilege(current_user,'xjw_social.comment_ledger','DELETE') OR
 has_table_privilege(current_user,'xjw_social.reply_ledger','DELETE') OR
 has_table_privilege(current_user,'xjw_social.platform_control','DELETE')) AS no_delete_privilege,
 has_table_privilege(current_user,'xjw_social.platform_control','SELECT') AS can_read_control,
 has_table_privilege(current_user,'xjw_social.webhook_inbox','SELECT') AND
 has_table_privilege(current_user,'xjw_social.comment_ledger','SELECT') AND
 has_table_privilege(current_user,'xjw_social.reply_ledger','SELECT') AS can_read_work_queues,
 NOT has_any_column_privilege(current_user,'xjw_social.platform_control','UPDATE') AS no_platform_control_update,
 has_table_privilege(current_user,'xjw_social.platform_control','UPDATE') AS can_enable_platform,
 has_table_privilege(current_user,'xjw_social.comment_ledger','DELETE') AS can_delete_comment,
 (SELECT count(*) FROM xjw_social.platform_control)=3 AS platform_rows_expected,
 (SELECT count(*) FROM xjw_social.platform_control
   WHERE enabled OR e2e_verified OR overlap_verified)=0 AS all_send_flags_off,
 (SELECT count(*)=4 AND bool_and(c.relrowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='xjw_social'
    AND c.relname IN ('platform_control','comment_ledger','reply_ledger','webhook_inbox')) AS all_tables_rls_enabled
FROM pg_stat_ssl s JOIN pg_roles p ON p.rolname=current_user
WHERE s.pid=pg_backend_pid()`;

/**
 * @param {{config:object,connect:(options:object)=>Promise<{query:Function,end:Function}>}} deps
 * @returns {Promise<{ok:true,tlsVerified:true,roleVerified:true,sendFlagsOff:true}>}
 */
export async function verifySocialWorkerTls({config,connect}){
 const options=socialTlsOptions(config); // reject unverified host/user/CA before I/O
 if(typeof connect!=='function')throw Error('Trusted PostgreSQL connector required');
 let client,transactionStarted=false;
 try {
  client=await connect(options);
  if(typeof client?.query!=='function'||typeof client?.end!=='function')
    throw Error('Trusted PostgreSQL session required');
  // Shared transaction pooler does not retain session state across queries.
  // The CHECK below is a single read-only SELECT, and TLS/hostname is
  // verified by the connection options before the query. Do not issue BEGIN
  // or session SET commands through port 6543.
  if(options.port===5432){
   await client.query('BEGIN READ ONLY');
   transactionStarted=true;
  }
  const result=await client.query(CHECK);
  const row=result?.rows?.[0];
  if(result?.rows?.length!==1 || row?.effective_role!=='xjw_social_worker' ||
     row.tls_enabled!==true || !/^TLSv1\.[23]$/.test(row.tls_version||'') ||
     row.superuser!==false || row.bypass_rls!==false ||
     row.inbox_write_ready!==true || row.comment_write_ready!==true ||
     row.reply_write_ready!==true || row.no_delete_privilege!==true ||
     row.can_read_control!==true || row.can_read_work_queues!==true ||
     row.can_enable_platform!==false || row.no_platform_control_update!==true ||
     row.can_delete_comment!==false || row.platform_rows_expected!==true ||
     row.all_send_flags_off!==true || row.all_tables_rls_enabled!==true)
    throw Error('Actual role, TLS, RLS or fail-closed configuration unverified');
  return {ok:true,tlsVerified:true,roleVerified:true,sendFlagsOff:true};
 }finally{
  if(transactionStarted){try{await client.query('ROLLBACK');}catch{/* End still closes. */}}
  if(client?.end)await client.end();
 }
}

// Driver connection failures occur before verifySocialWorkerTls receives a
// client. Retire the attempted socket even when PostgreSQL TLS/auth fails.
export async function connectPgTlsClient(Client,options){
 const client=new Client(options);
 try{await client.connect();return client;}
 catch(error){
  try{await client.end();}catch{/* Preserve the original connection failure. */}
  throw error;
 }
}

async function main(){
 // The config must be supplied through a protected runtime environment, not
 // the repository, shell history, command-line flags or a public URL.
 const config=JSON.parse(process.env.XJW_SOCIAL_DB_CONFIG||'null');
 const pg=await import('pg');
 const Client=pg.default?.Client||pg.Client;
 return await verifySocialWorkerTls({config,connect:async options=>{
  return connectPgTlsClient(Client,options);
 }});
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 main().then(()=>console.log(JSON.stringify({ok:true,tls:true,role:'worker',mode:'read_only'})))
 .catch(()=>{console.error(JSON.stringify({ok:false,code:'worker_tls_not_verified'}));process.exitCode=1;});
}
