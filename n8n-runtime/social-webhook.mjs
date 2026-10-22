// Portable WebCrypto receiver. No customer reply or model call exists here.
export async function verifiedEnvelope(request,config){
 const url=new URL(request.url);
 if(!config?.appSecret||!config?.verifyToken)throw Error('configuration_missing');
 if(request.method==='GET'){
  const challenge=url.searchParams.get('hub.challenge');
  if(url.searchParams.get('hub.mode')!=='subscribe'||url.searchParams.get('hub.verify_token')!==config.verifyToken||!/^\d{1,100}$/.test(challenge||''))throw Error('verification_rejected');
  return {challenge};
 }
 if(request.method!=='POST')throw Error('method_rejected');
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('format_rejected');
 const reader=request.body?.getReader();if(!reader)throw Error('format_rejected');
 const chunks=[];let size=0;
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536){await reader.cancel();throw Error('payload_too_large')}chunks.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 const signature=request.headers.get('x-hub-signature-256');
 if(!/^sha256=[a-f0-9]{64}$/.test(signature||''))throw Error('signature_rejected');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(config.appSecret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const sig=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
 if(!await crypto.subtle.verify('HMAC',key,sig,bytes))throw Error('signature_rejected');
 let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))}catch{throw Error('format_rejected')}
 const platform={page:'facebook',instagram:'instagram',threads:'threads'}[body?.object];
 if(!platform||!Array.isArray(body.entry)||!body.entry.length||body.entry.length>100)throw Error('format_rejected');
 if(body.entry.some(e=>!/^\d+$/.test(e?.id||'')||!config.allowedAccounts?.[platform]?.includes(e.id)))throw Error('account_rejected');
 // Signed payload is private queue input, never proof of current thread state.
 // Official API history must be fetched before the policy makes a suggestion.
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
 return {platform,digest,accounts:[...new Set(body.entry.map(e=>e.id))],payload:body};
}
export async function receiveWebhook(request,config,db){
 const envelope=await verifiedEnvelope(request,config);
 if(envelope.challenge)return new Response(envelope.challenge,{headers:{'cache-control':'no-store'}});
 if(typeof db?.query!=='function')throw Error('storage_unavailable');
 // A single SQL statement makes all references durable before acknowledging.
 await db.query(`INSERT INTO xjw_social.webhook_inbox(event_hash,platform,account_id,payload)
  SELECT $1,$2,unnest($3::text[]),$4::jsonb ON CONFLICT DO NOTHING`,[envelope.digest,envelope.platform,envelope.accounts,JSON.stringify(envelope.payload)]);
 return Response.json({accepted:true,mode:'manual_receipt_only',sent:false},{headers:{'cache-control':'no-store'}});
}
