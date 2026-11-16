// Independent B2B CRM delivery. Existing LINE retail order endpoint is never used.
export const businessInquiryCrmSchema = `
CREATE TABLE IF NOT EXISTS business_inquiry_crm_delivery (
  inquiry_id TEXT PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('retry','sending','sent','held')),
  attempts INTEGER NOT NULL DEFAULT 0,
  claim TEXT,
  lease_until INTEGER,
  next_attempt_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  sent_at TEXT
);
`;
const encoder = new TextEncoder();
const maxAttempts = 8;
const leaseMs = 60000;
const scope = 'xjw-b2b-crm-v1';
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2,'0')).join('');
const safeEndpoint = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'script.google.com' &&
      !parsed.port && !parsed.username && !parsed.password && !parsed.search && !parsed.hash &&
      /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.pathname) ? parsed.href : null;
  } catch { return null; }
};
const contentRedirect = url => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'script.googleusercontent.com' &&
      !parsed.port && !parsed.username && !parsed.password && parsed.pathname === '/macros/echo' ? parsed.href : null;
  } catch { return null; }
};
function payloadFor(row) {
  return { id: row.id, source: row.source, receivedAt: row.received_at, origin: row.origin,
    category: row.category, businessContact: row.business_contact, details: row.details };
}
async function send(row, endpoint, secret, now, transport) {
  const payload = JSON.stringify(payloadFor(row));
  const timestamp = String(now);
  const key = await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC',key,encoder.encode(scope+'\n'+timestamp+'\n'+payload)));
  try {
    let response = await transport(endpoint,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(10000),
      headers:{'content-type':'application/json'},body:JSON.stringify({timestamp,payload,signature})});
    if ([302,303].includes(response.status)) {
      const next = contentRedirect(response.headers.get('location'));
      if (!next) return 'unsafe_redirect';
      // Google ContentService redirects to an output URL. Never forward the signed POST body.
      response = await transport(next,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000)});
    }
    if (!response.ok) return 'http_failure';
    const ack = await response.json();
    if (ack?.id !== row.id || ack?.version !== scope) return 'invalid_ack';
    if (ack.ok === true && typeof ack.duplicate === 'boolean') return 'sent';
    return ack.error === 'id_conflict' ? 'id_conflict' : 'receiver_rejected';
  } catch { return 'transport_unknown'; }
}
export async function deliverBusinessInquiryCrm(env, {transport=fetch, now=Date.now, limit=3}={}) {
  const endpoint=safeEndpoint(env.XJW_B2B_CRM_URL);
  const secret=env.XJW_B2B_CRM_SECRET;
  if(env.XJW_B2B_CRM_ENABLED !== 'true' || env.XJW_B2B_INTAKE_ENABLED !== 'true' ||
     !endpoint || typeof secret !== 'string' || secret.length < 32 || !env.DB) return {enabled:false,processed:0};
  const db=env.DB;
  const at=now();
  // Exhausted interrupted attempts must not remain permanently marked sending.
  await db.prepare("UPDATE business_inquiry_crm_delivery SET state='held',claim=NULL,lease_until=NULL,last_error='retry_limit' WHERE state='sending' AND lease_until<=? AND attempts>=?").bind(at,maxAttempts).run();
  const {results=[]}=await db.prepare(
    "SELECT b.id,b.source,b.received_at,b.origin,b.category,b.business_contact,b.details FROM business_inquiries b "+
    "LEFT JOIN business_inquiry_crm_delivery d ON d.inquiry_id=b.id "+
    "WHERE d.inquiry_id IS NULL OR (d.attempts<? AND ((d.state='retry' AND d.next_attempt_at<=?) OR (d.state='sending' AND d.lease_until<=?))) "+
    "ORDER BY b.received_at,b.id LIMIT ?"
  ).bind(maxAttempts,at,at,Math.max(1,Math.min(3,Number(limit)||3))).all();
  let processed=0;
  for(const row of results){
    const start=now(),claim=crypto.randomUUID();
    const claimed=await db.prepare(
      "INSERT INTO business_inquiry_crm_delivery (inquiry_id,state,attempts,claim,lease_until) VALUES (?,'sending',1,?,?) "+
      "ON CONFLICT(inquiry_id) DO UPDATE SET state='sending',attempts=attempts+1,claim=excluded.claim,lease_until=excluded.lease_until "+
      "WHERE attempts<? AND ((state='retry' AND next_attempt_at<=?) OR (state='sending' AND lease_until<=?)) RETURNING attempts"
    ).bind(row.id,claim,start+leaseMs,maxAttempts,start,start).first();
    if(!claimed) continue;
    const result=await send(row,endpoint,secret,start,transport);
    const done=now();
    const status=result==='sent'?'sent':result==='id_conflict'||result==='unsafe_redirect'||claimed.attempts>=maxAttempts?'held':'retry';
    const backoff=Math.min(6*3600000,15*60000*2**(claimed.attempts-1));
    await db.prepare("UPDATE business_inquiry_crm_delivery SET state=?,claim=NULL,lease_until=NULL,next_attempt_at=?,last_error=?,sent_at=? WHERE inquiry_id=? AND state='sending' AND claim=?")
      .bind(status,status==='retry'?done+backoff:0,result==='sent'?null:result,result==='sent'?new Date(done).toISOString():null,row.id,claim).run();
    processed++;
  }
  return {enabled:true,processed};
}
