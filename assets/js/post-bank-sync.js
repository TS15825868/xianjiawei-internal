(()=>{
'use strict';
const VERSION='post-bank-sync-current-capabilities';
const PRODUCT_IMAGE_AUTHORITY='products-v3';
const PUBLIC_ORIGIN='https://ts15825868.github.io';
const SITE='https://ts15825868.github.io/xianjiawei/';
const EXPORT_URL=`${SITE}post-bank-export.html?authority=current`;
const SOURCE_PREFIX='公開母庫:';
const PAGE_SIZE=60;
const WRITE_CONCURRENCY=4;
const ALLOWED_PLATFORMS=new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);
function toast(message,error=false){const root=document.getElementById('toastRoot');if(!root){if(error)console.error(message);return}const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),6200)}
async function api(path,options={}){const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);return data}
function listItems(data){return Array.isArray(data)?data:(data?.items||data?.results||data?.records||[])}
async function allExisting(){const output=[];let offset=0,total=Infinity;while(offset<total&&offset<5000){const data=await api(`/posts?limit=${PAGE_SIZE}&offset=${offset}`),items=listItems(data);output.push(...items);total=Number(data?.total??data?.count??(items.length<PAGE_SIZE?output.length:Infinity));if(!items.length||items.length<PAGE_SIZE)break;offset+=items.length}return output}
function sourceId(post){const source=String(post?.image_source||''),match=source.match(/(?:公開母庫|公開500母庫|公開發布中心):([^|]+)/);return match?match[1].trim():''}
function titleOf(post){return String(post?.title||'').trim()}
function existingIdentity(existing){const existingIds=new Set(),legacyTitles=new Set();for(const post of existing||[]){const id=sourceId(post);if(id)existingIds.add(id);else{const title=titleOf(post);if(title)legacyTitles.add(title)}}return{existingIds,legacyTitles}}
function missingPosts(active,existing){const {existingIds,legacyTitles}=existingIdentity(existing);return active.filter(post=>{const id=String(post?.id||'').trim(),title=titleOf(post);if(id&&existingIds.has(id))return false;if(title&&legacyTitles.has(title))return false;return true})}
function platforms(value){const list=Array.isArray(value)?value:[];const safe=[...new Set(list.map(v=>String(v||'').trim()).filter(v=>ALLOWED_PLATFORMS.has(v)))];return safe.length?safe:['Facebook','Instagram']}
function protectedPost(post){return post?.status==='published'||post?.status==='archived'||post?.prevent_republish===true||post?.do_not_republish===true||/published.*locked/i.test(String(post?.image_status||''))}
function campaignHold(post){return post?.campaign_hold===true||Boolean(post?.hold_until)||String(post?.status||'')==='campaign_hold'}
function needsGeneration(post){const status=String(post?.image_status||''),mode=String(post?.candidate_generation_mode||post?.regeneration_mode||'');return status==='needs_generation'||status==='replace-required'||post?.requires_image_generation===true||/chatgpt.*required|chatgpt_handoff/i.test(mode)||!String(post?.image_url||'').trim()}
function absoluteImage(value){const text=String(value||'').trim();if(!text)return'';if(/^https:\/\//i.test(text)||/^data:image\//i.test(text))return text;return `${SITE}${text.replace(/^\//,'')}`}
function marker(post,requires){const refs=(post?.product_refs||[]).map(v=>String(v||'').trim()).filter(Boolean).join(',');return `${SOURCE_PREFIX}${post.id}|${requires?'needs-generation':String(post.image_status||'candidate')}|${refs}`.slice(0,480)}
function payload(post){const requires=needsGeneration(post),image=requires?'':absoluteImage(post.image_url);return{title:String(post.title||'仙加味貼文').slice(0,180),headline:String(post.headline||'').slice(0,300),copy:String(post.copy||'').slice(0,10000),category:String(post.category||'日常節奏').slice(0,80),platforms:platforms(post.platforms),image_url:image,image_alt:String(post.image_alt||post.title||'仙加味待審核候選圖').slice(0,300),image_source:marker(post,requires),image_width:Number(post.image_width||0)||0,image_height:Number(post.image_height||0)||0,image_bytes:Number(post.image_bytes||0)||0,image_quality_status:requires?'needs-generation':'unknown'}}
function validateExport(data){
 if(!data||data.schema!=='xjw-post-bank-export-v1')throw new Error('目前貼文母庫 exporter schema 不符合正式契約');
 if(!String(data.runtime||'').trim()||!/export/i.test(String(data.runtime)))throw new Error('目前貼文母庫 exporter 缺少能力識別');
 if(data.retired_assets_removed!==true)throw new Error('目前貼文母庫尚未確認退役錯圖已移除，停止同步。');
 const authority=`${data.product_image_authority||''} ${data.product_image_version||''}`;
 if(!/products-v3/i.test(authority)||/products-v2/i.test(authority))throw new Error('目前貼文母庫沒有維持 products-v3 正式產品圖權威');
 const caps=data.capabilities||{};
 for(const key of ['current_post_count','post_count_matches_current_catalog','unique_post_ids','products_v3_authority','products_v2_forbidden','regeneration_clears_old_image'])if(caps[key]!==true)throw new Error(`目前貼文母庫 exporter 缺少安全能力：${key}`);
 const posts=Array.isArray(data.posts)?data.posts:[];
 if(posts.length<1)throw new Error('目前貼文母庫沒有可同步內容');
 if(Number(data.post_count||posts.length)!==posts.length)throw new Error(`目前母庫宣告數量與實際不一致：${data.post_count}/${posts.length}`);
 const ids=posts.map(post=>String(post?.id||'').trim());
 if(ids.some(id=>!id)||new Set(ids).size!==posts.length)throw new Error('目前貼文母庫存在空白或重複ID，已停止同步避免資料互相覆蓋。');
 for(const post of posts){const image=String(post?.image_url||'').trim();if(/\/images\/products-v2\//i.test(image))throw new Error(`${post.id} 仍帶 products-v2 舊產品圖`);if(needsGeneration(post)&&image)throw new Error(`${post.id} 需重生成但仍帶舊錯圖`)}
 return data;
}
function loadBank(){return new Promise((resolve,reject)=>{let done=false;const iframe=document.createElement('iframe');iframe.hidden=true;iframe.title='仙加味目前貼文母庫安全匯出';const cleanup=()=>{window.removeEventListener('message',onMessage);iframe.remove()};const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('貼文母庫重建逾時，請稍後再試。'))},90000);function onMessage(event){if(done||event.origin!==PUBLIC_ORIGIN||event.data?.schema!=='xjw-post-bank-export-v1')return;done=true;clearTimeout(timer);cleanup();if(event.data.error)return reject(new Error(event.data.error));try{resolve(validateExport(event.data))}catch(error){reject(error)}}window.addEventListener('message',onMessage);iframe.src=EXPORT_URL;document.body.appendChild(iframe)})}
async function runPool(items,worker,onProgress){let index=0,done=0;const errors=[];async function runner(){while(true){const current=index++;if(current>=items.length)return;try{await worker(items[current],current)}catch(error){errors.push({item:items[current],error})}done++;onProgress?.(done,items.length)}}await Promise.all(Array.from({length:Math.min(WRITE_CONCURRENCY,items.length||1)},runner));return errors}
async function sync(button){
 if(button.dataset.busy==='1')return;
 if(!window.confirm('同步目前正式貼文母庫？系統會依目前母庫實際張數驗證ID唯一、products-v3產品圖權威、退役錯圖已移除與需重生成貼文不得沿用舊圖；不核准、不排程、不自動發布。'))return;
 button.dataset.busy='1';button.disabled=true;const original=button.textContent;button.textContent='重建目前母庫…';
 try{
  const [bank,existing]=await Promise.all([loadBank(),allExisting()]);
  const protectedCount=bank.posts.filter(protectedPost).length,holdCount=bank.posts.filter(p=>!protectedPost(p)&&campaignHold(p)).length,active=bank.posts.filter(p=>!protectedPost(p)&&!campaignHold(p)),missing=missingPosts(active,existing);
  if(!missing.length){toast(`目前母庫 ${bank.posts.length} 篇已同步：現有${existing.length}篇；已發布鎖定${protectedCount}篇、活動冷卻${holdCount}篇均維持保護。`);return}
  let created=0,pending=0,generation=0;
  const errors=await runPool(missing,async post=>{const requires=needsGeneration(post),createdPost=await api('/posts',{method:'POST',body:JSON.stringify(payload(post))});created++;if(requires){generation++;return}await api(`/posts/${encodeURIComponent(createdPost.id)}/regeneration-ready`,{method:'POST',body:JSON.stringify({mode:'all'})});pending++},(done,total)=>{button.textContent=`同步中 ${done}/${total}`});
  const failed=errors.length;toast(`目前母庫 ${bank.posts.length} 篇同步：新增${created}篇（待審核${pending}、需重生成草稿${generation}），略過已存在${active.length-missing.length}篇、已發布鎖定${protectedCount}篇、活動冷卻${holdCount}篇${failed?`；失敗${failed}篇`:''}。`,failed>0);
  document.dispatchEvent(new CustomEvent('xjw-post-bank-synced',{detail:{bankCount:bank.posts.length,created,pending,generation,failed,protectedCount,holdCount,exportRuntime:bank.runtime,retiredAssetsRemoved:true,productImageAuthority:PRODUCT_IMAGE_AUTHORITY}}));document.querySelector('[data-refresh]')?.click();
 }catch(error){toast(error?.message||String(error),true)}finally{button.dataset.busy='0';button.disabled=false;button.textContent=original}
}
function install(){const actions=document.querySelector('.publish-header-actions');if(!actions||actions.querySelector('[data-sync-post-bank]'))return;const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.syncPostBank='1';button.textContent='同步目前母庫';button.addEventListener('click',()=>sync(button));const add=actions.querySelector('[data-add-post]');actions.insertBefore(button,add||null)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.XJWPostBankSync=Object.freeze({version:VERSION,productImageAuthority:PRODUCT_IMAGE_AUTHORITY,exportUrl:EXPORT_URL,loadBank,validateExport,allExisting,sourceId,existingIdentity,missingPosts,needsGeneration,protectedPost,campaignHold,payload});
})();
