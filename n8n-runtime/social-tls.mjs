// Explicit options prevent URI sslmode parameters from replacing CA verification.
export function socialTlsOptions(config){
 if(!config || !/^xjw_social_worker(?:\.[a-z0-9]+)?$/.test(config.user||'') ||
    !/^(?:[a-z0-9-]+\.)+supabase\.(?:co|com)$/.test(config.host||'') ||
    ![5432,6543].includes(Number(config.port)) || !config.password ||
    !String(config.ca||'').includes('-----BEGIN CERTIFICATE-----'))throw Error('Dedicated verified TLS configuration required');
 return {host:config.host,port:Number(config.port),database:'postgres',user:config.user,
  password:config.password,ssl:{ca:config.ca,rejectUnauthorized:true},max:1,
  connectionTimeoutMillis:8000,idleTimeoutMillis:10000,statement_timeout:15000,
  application_name:'xjw-social-suggestion-backup'};
}

