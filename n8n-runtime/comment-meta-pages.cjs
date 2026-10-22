// Fail-closed pagination primitive for official Meta readers. Does not certify
// platform-specific completeness, identity, or reply ownership by itself.
function createPageCollector({request,origin,maxPages=40,maxItems=2000}){
 if(typeof request!=='function'||!['https://graph.facebook.com','https://graph.instagram.com','https://graph.threads.net'].includes(origin))
  throw Error('Trusted Meta reader required');
 if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100||
    !Number.isInteger(maxItems)||maxItems<1||maxItems>10000)throw Error('Invalid pagination bounds');
 function safeUrl(value){
  if(typeof value!=='string'||!value||value.trim()!==value)throw Error('Invalid page URL');
  let url;try{url=new URL(value);}catch{throw Error('Invalid page URL');}
  if(url.origin!==origin||url.protocol!=='https:'||url.username||url.password||url.hash)
   throw Error('Unsafe page URL');
  for(const key of url.searchParams.keys())if(/^(access_token|token|appsecret_proof)$/i.test(key))
   throw Error('Credential-bearing page URL');
  // Canonical query order catches loops with reordered parameters.
  url.searchParams.sort();return url;
 }
 return Object.freeze({async collect(firstUrl){
  const start=safeUrl(firstUrl);
  const seen=new Set(),items=[],ids=new Set();let next=start.href,pages=0;
  while(next){
   const url=safeUrl(next);
   if(url.pathname!==start.pathname||seen.has(url.href)||++pages>maxPages)
    throw Error('Incomplete or unsafe pagination');
   seen.add(url.href);
   // The request binding must attach protected credentials, enforce TLS, no
   // redirects and no automatic retry. Never follow untrusted paging domains.
   let page;const controller=new AbortController();let timer;
   try{page=await Promise.race([
    request({method:'GET',url:url.href,retries:0,followRedirects:false,timeoutMs:15000,signal:controller.signal}),
    new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Official page timeout'));},15000);})
   ]);}catch{throw Error('Official page unavailable');}finally{clearTimeout(timer);}
   if(page?.error||!Array.isArray(page?.data))throw Error('Incomplete official page');
   if(Object.hasOwn(page,'paging')){
    const p=page.paging;
    if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Invalid paging');
    if(Object.hasOwn(p,'next'))safeUrl(p.next);
    if(Object.hasOwn(p,'cursors')&&(!p.cursors||typeof p.cursors!=='object'||Array.isArray(p.cursors)||
     Object.values(p.cursors).some(v=>typeof v!=='string'||!v)))throw Error('Invalid cursors');
   }
   for(const item of page.data){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))
     throw Error('Invalid or duplicate official item');
    ids.add(item.id);items.push(item);
    if(items.length>maxItems)throw Error('Pagination item limit');
   }
   next=page.paging?.next??null;
  }
  return Object.freeze({complete:true,pages,items});
 }});
}
module.exports={createPageCollector};

