(()=>{
  const PARAM='xjw_import';
  const SOURCE_PREFIX='公開發布中心:';
  const toast=(message,error=false)=>{const root=document.getElementById('toastRoot');if(!root){if(error)alert(message);return}const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),5200)};
  function fromBase64Url(value){const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);const binary=atob(padded);const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));return new TextDecoder().decode(bytes)}
  function readPayload(){const value=new URL(location.href).searchParams.get(PARAM);if(!value)return null;try{const data=JSON.parse(fromBase64Url(value));if(data?.schema!=='xjw-public-to-erp-v1')throw new Error('交接格式版本不符');const sourceId=String(data.source_post_id||'').trim();if(!sourceId||sourceId.length>100)throw new Error('公開貼文ID不正確');return{...data,source_post_id:sourceId}}catch(error){throw new Error(`公開發布中心交接資料無法讀取：${error.message||error}`)}}
  async function api(path,options={}){const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});const text=await response.text();if((response.headers.get('content-type')||'').includes('text/html')||/^\s*<!doctype html/i.test(text))throw new Error('Cloudflare Access 登入尚未完成，請重新整理後再試。');let data={};try{data=text?JSON.parse(text):{}}catch{data={message:text}}if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);return data}
  function safePlatforms(value){const allowed=new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);const list=Array.isArray(value)?value:[];const output=[...new Set(list.map(item=>String(item||'').trim()).filter(item=>allowed.has(item)))];return output.length?output:['Facebook','Instagram']}
  function svgDataUrl(svg){const text=String(svg||'');if(!text.trim())return'';const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return `data:image/svg+xml;base64,${btoa(binary)}`}
  function cleanImage(payload){const svg=String(payload?.candidate_svg||'');if(svg.trim())return svgDataUrl(svg);const url=String(payload?.image_url||'').trim();return /^https:\/\//i.test(url)?url:''}
  function removeImportParam(){const url=new URL(location.href);url.searchParams.delete(PARAM);history.replaceState(null,'',`${url.pathname}${url.search}${url.hash||'#posts'}`)}
  function sourceMarker(payload){return `${SOURCE_PREFIX}${payload.source_post_id}`}
  async function waitForApi(){let lastError=null;for(let attempt=0;attempt<12;attempt+=1){try{return await api('/me')}catch(error){lastError=error;await new Promise(resolve=>setTimeout(resolve,500))}}throw lastError||new Error('ERP尚未完成登入')}
  async function importDraft(payload){
    await waitForApi();const marker=sourceMarker(payload);const posts=await api('/posts');const existing=(Array.isArray(posts)?posts:[]).find(post=>String(post.image_source||'').startsWith(marker));
    if(existing){removeImportParam();location.hash='#posts';toast(`這篇公開貼文已匯入 ERP：${existing.title||existing.id}`);return existing}
    const imageUrl=cleanImage(payload);const hasTransferredSvg=/^data:image\/svg\+xml;base64,/i.test(imageUrl);
    const created=await api('/posts',{method:'POST',body:JSON.stringify({title:String(payload.title||'仙加味貼文').slice(0,180),headline:String(payload.headline||'').slice(0,300),copy:String(payload.copy||'').slice(0,10000),category:String(payload.category||'日常節奏').slice(0,80),platforms:safePlatforms(payload.platforms),image_url:imageUrl,image_alt:String(payload.image_alt||payload.title||'仙加味貼文候選圖').slice(0,300),image_source:marker,image_width:0,image_height:0,image_bytes:0,image_quality_status:'unknown'})});
    removeImportParam();location.hash='#posts';
    const imageNote=hasTransferredSvg?' runtime SVG候選已安全帶入；按審核通過前會自動轉成 JPEG。':payload.local_image_requires_upload?' 公開頁使用的是本機替換圖，請在 ERP 用「從手機／平板／電腦上傳圖片」補上。':imageUrl&&/\.svg(?:[?#]|$)/i.test(imageUrl)?' 候選 SVG 已帶入；按審核通過前會自動轉成 JPEG。':imageUrl?' 候選圖已帶入。':' 尚未有候選圖，請先生成或上傳圖片。';
    toast(`已匯入 ERP 草稿：${created.title||created.id}。${imageNote}`);setTimeout(()=>window.dispatchEvent(new Event('hashchange')),180);return created
  }
  async function start(){let payload;try{payload=readPayload()}catch(error){toast(error.message||String(error),true);removeImportParam();return}if(!payload)return;toast('正在把公開發布中心貼文安全匯入 ERP 草稿…');try{await importDraft(payload)}catch(error){toast(error.message||String(error),true)}}
  window.XJWPublicPostImport={version:'2026-08-08-v3-runtime-svg',readPayload,importDraft,svgDataUrl};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,250),{once:true});else setTimeout(start,250)
})();
