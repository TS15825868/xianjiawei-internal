// Strict project-bound host/user pairs. Never accept a connection-string
// sslmode parameter in place of CA verification, or arbitrary Supabase tenants.
// Render Free has IPv4-only egress: it must use Supabase's shared session pooler.
const PROJECT='iphexhvjhsmelbgwzhhr';
const DIRECT_HOST=`db.${PROJECT}.supabase.co`;
// Project metadata verifies region ap-northeast-1 (Tokyo).
// Copy the exact session pooler hostname from Supabase Connect; do not guess INDEX.
const SHARED_POOLER=/^aws-[0-9]+-ap-northeast-1\.pooler\.supabase\.com$/;
export function socialTlsOptions(config){
 const direct=config?.host===DIRECT_HOST;
 const sharedPooler=typeof config?.host==='string'&&SHARED_POOLER.test(config.host);
 const expectedUser=sharedPooler?`xjw_social_worker.${PROJECT}`:'xjw_social_worker';
 // Shared session pooler uses 5432. Supabase recommends 6543 transaction
 // pooler for ephemeral Edge Functions. This opt-in is isolated to the Edge
 // receiver: n8n's long-lived Render process must continue using 5432.
 const transaction=sharedPooler&&Number(config?.port)===6543;
 const edgeTransaction=transaction&&config?.runtime==='edge'&&
   config?.poolMode==='transaction';
 const portAllowed=Number(config?.port)===5432||edgeTransaction;
 // The shared session pooler normally presents a public-trust certificate.
 // A project-specific database CA can fail to validate that DIFFERENT chain.
 // Strict opt-in system trust is allowed ONLY on this project's known regional
 // pooler with ordinary Node CA + hostname verification still enabled.
 const systemTrust=sharedPooler&&config?.trustStore==='system'&&
   (config?.ca===undefined||config.ca===null);
 const pinnedTrust=typeof config?.ca==='string'&&
   config.ca.includes('-----BEGIN CERTIFICATE-----')&&
   (config?.trustStore===undefined||config.trustStore==='pinned');
 const ipv4Only=typeof process!=='undefined'&&Boolean(process.env?.RENDER_SERVICE_ID);
 if(!config || (!direct&&!sharedPooler) ||
    config.user!==expectedUser || !portAllowed ||
    (transaction&&(ipv4Only||!edgeTransaction)) ||
    (config?.runtime==='edge'&&config?.poolMode==='transaction'&&!transaction) ||
    (direct&&ipv4Only) ||
    typeof config.password!=='string'||!config.password ||
    (!systemTrust&&!pinnedTrust))
    throw Error('Dedicated verified TLS configuration required');
 return {host:config.host,port:Number(config.port),database:'postgres',user:config.user,
  password:config.password,
  ssl:{...(pinnedTrust?{ca:config.ca}:{}),rejectUnauthorized:true,
   servername:config.host,minVersion:'TLSv1.2'},max:1,
  connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:15000,
  application_name:transaction?'xjw-social-edge-receipt':'xjw-social-suggestion-backup'};
}
