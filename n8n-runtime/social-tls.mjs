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
 const sessionPooler=typeof config?.host==='string'&&SHARED_POOLER.test(config.host);
 const expectedUser=sessionPooler?`xjw_social_worker.${PROJECT}`:'xjw_social_worker';
 // Session pooler uses 5432; transaction pooler 6543 is not accepted.
 const ipv4Only=typeof process!=='undefined'&&Boolean(process.env?.RENDER_SERVICE_ID);
 if(!config || (!direct&&!sessionPooler) ||
    config.user!==expectedUser || Number(config.port)!==5432 ||
    (direct&&ipv4Only) ||
    typeof config.password!=='string'||!config.password ||
    typeof config.ca!=='string'||!config.ca.includes('-----BEGIN CERTIFICATE-----'))
    throw Error('Dedicated verified TLS configuration required');
 return {host:config.host,port:5432,database:'postgres',user:config.user,
  password:config.password,ssl:{ca:config.ca,rejectUnauthorized:true},max:1,
  connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:15000,
  application_name:'xjw-social-suggestion-backup'};
}
