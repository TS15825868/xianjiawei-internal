// Cloudflare D1 REST transport for verified bulk AI evidence imports.
// One HTTP request per SQL command; NEVER retry writes with unknown outcomes.
export function createD1Transport({token,accountId,databaseId,fetchImpl=globalThis.fetch,timeoutMs=25000}={}) {
  if(!token||!accountId||!databaseId||!/^[a-f0-9-]{20,}$/i.test(databaseId)||typeof fetchImpl!=='function')
    throw Error('Cloudflare D1 credentials, database ID or transport unavailable');
  const url='https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(accountId)+'/d1/database/'+encodeURIComponent(databaseId)+'/query';
  return async function execute(sql){
    if(typeof sql!=='string'||!sql.trim()||sql.length>2000000)
      throw Error('Invalid D1 SQL request');
    let response;
    try {
      response=await fetchImpl(url,{
        method:'POST',
        headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({sql}),
        redirect:'error',
        signal:AbortSignal.timeout(timeoutMs)
      });
    } catch {
      // A timeout after a write can be ambiguous. No automatic retry.
      throw Error('D1 transport failed or timed out; reconcile before retry');
    }
    if(!response.ok)throw Error('D1 remote HTTP '+response.status+'; no automatic retry');
    let payload;
    try { payload=await response.json(); }
    catch { throw Error('D1 returned malformed JSON; reconcile before retry'); }
    if(payload?.success!==true||!Array.isArray(payload.result)||
      payload.result.length===0||payload.result.some(x=>x?.success===false))
      throw Error('D1 command did not return verified success; reconcile before retry');
    return payload.result;
  };
}
