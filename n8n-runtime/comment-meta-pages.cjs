// Fail-closed pagination primitive for official Meta readers. Does not certify
// platform-specific completeness, identity, or reply ownership by itself.
function createPageCollector({request,origin,maxPages=40,maxItems=2000}){
 if(typeof request!=='function'||!['https://graph.facebook.com','https://graph.instagram.com','https://graph.threads.net'].includes(origin))
  throw Error('Trusted Meta reader required');
 return Object.freeze({async collect(firstUrl){
  const start=new URL(firstUrl);
  if(start.origin!==origin||start.username||start.password||start.hash)throw Error('Invalid first page');
  const seen=new Set(),items=[],ids=new Set();let next=start.href,pages=0;
  while(next){
   const url=new URL(next);
   if(url.origin!==origin||url.username||url.password||url.hash||seen.has(url.href)||++pages>maxPages)
    throw Error('Incomplete or unsafe pagination');
   seen.add(url.href);
   // The request binding must attach protected credentials, enforce TLS, no
   // redirects and no automatic retry. Never follow untrusted paging domains.
   const page=await request({method:'GET',url:url.href,retries:0,followRedirects:false});
   if(page?.error||!Array.isArray(page?.data))throw Error('Incomplete official page');
   for(const item of page.data){
    if(!item||typeof item.id!=='string'||!item.id||ids.has(item.id))
     throw Error('Invalid or duplicate official item');
    ids.add(item.id);items.push(item);
    if(items.length>maxItems)throw Error('Pagination item limit');
   }
   next=page.paging?.next||null;
   if(next&&typeof next!=='string')throw Error('Invalid next page');
  }
  return Object.freeze({complete:true,pages,items});
 }});
}
module.exports={createPageCollector};
