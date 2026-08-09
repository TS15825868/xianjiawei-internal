(()=>{
  'use strict';
  const VERSION='2026-08-10-post-bank-sync-v2-source-id-safe';
  const PUBLIC_ORIGIN='https://ts15825868.github.io';
  const SITE='https://ts15825868.github.io/xianjiawei/';
  const EXPORT_URL=`${SITE}post-bank-export.html?v=20260809-export-v1`;
  const SOURCE_PREFIX='公開500母庫:';
  const PAGE_SIZE=60;
  const WRITE_CONCURRENCY=4;
  const ALLOWED_PLATFORMS=new Set(['Facebook','Instagram','LINE OA','LINE OA 廣播','LINE VOOM','Google 商家']);

  function toast(message,error=false){
    const root=document.getElementById('toastRoot');if(!root){if(error)console.error(message);return}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),6200);
  }
  async function api(path,options={}){
    const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...options,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
    const raw=await response.text();let data={};try{data=raw?JSON.parse(raw):{}}catch{data={message:raw}}
    if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);
    return data;
  }
  function listItems(data){return Array.isArray(data)?data:(data?.items||data?.results||data?.records||[])}
  async function allExisting(){
    const output=[];let offset=0,total=Infinity;
    while(offset<total&&offset<1200){
      const data=await api(`/posts?limit=${PAGE_SIZE}&offset=${offset}`),items=listItems(data);output.push(...items);
      total=Number(data?.total??data?.count??(items.length<PAGE_SIZE?output.length:Infinity));
      if(!items.length||items.length<PAGE_SIZE)break;offset+=items.length;
    }
    return output;
  }
  function sourceId(post){
    const source=String(post?.image_source||''),match=source.match(/(?:公開500母庫|公開發布中心):([^|]+)/);return match?match[1].trim():'';
  }
  function titleOf(post){return String(post?.title||'').trim()}
  function existingIdentity(existing){
    const existingIds=new Set();
    const legacyTitles=new Set();
    for(const post of existing||[]){
      const id=sourceId(post);
      if(id)existingIds.add(id);
      else{const title=titleOf(post);if(title)legacyTitles.add(title)}
    }
    return{existingIds,legacyTitles};
  }
  function missingPosts(active,existing){
    const {existingIds,legacyTitles}=existingIdentity(existing);
    return active.filter(post=>{
      const id=String(post?.id||'').trim(),title=titleOf(post);
      if(id&&existingIds.has(id))return false;
      // 舊系統資料沒有母庫source id時才用標題作相容去重；母庫內不同ID即使同標題仍應各自保留。
      if(title&&legacyTitles.has(title))return false;
      return true;
    });
  }
  function platforms(value){const list=Array.isArray(value)?value:[];const safe=[...new Set(list.map(v=>String(v||'').trim()).filter(v=>ALLOWED_PLATFORMS.has(v)))];return safe.length?safe:['Facebook','Instagram']}
  function protectedPost(post){return post?.status==='published'||post?.status==='archived'||post?.prevent_republish===true||post?.do_not_republish===true||/published.*locked/i.test(String(post?.image_status||''))}
  function campaignHold(post){return post?.campaign_hold===true||Boolean(post?.hold_until)||String(post?.status||'')==='campaign_hold'}
  function needsGeneration(post){const status=String(post?.image_status||''),mode=String(post?.candidate_generation_mode||post?.regeneration_mode||'');return status==='needs_generation'||post?.requires_image_generation===true||/chatgpt-.*-required|chatgpt_handoff/.test(mode)||!String(post?.image_url||'').trim()}
  function absoluteImage(value){const text=String(value||'').trim();if(!text)return'';if(/^https:\/\//i.test(text)||/^data:image\//i.test(text))return text;return `${SITE}${text.replace(/^\//,'')}`}
  function marker(post,requires){const refs=(post?.product_refs||[]).map(v=>String(v||'').trim()).filter(Boolean).join(',');return `${SOURCE_PREFIX}${post.id}|${requires?'needs-generation':String(post.image_status||'candidate')}|${refs}`.slice(0,480)}
  function payload(post){
    const requires=needsGeneration(post),image=requires?'':absoluteImage(post.image_url);
    return{title:String(post.title||'仙加味貼文').slice(0,180),headline:String(post.headline||'').slice(0,300),copy:String(post.copy||'').slice(0,10000),category:String(post.category||'日常節奏').slice(0,80),platforms:platforms(post.platforms),image_url:image,image_alt:String(post.image_alt||post.title||'仙加味待審核候選圖').slice(0,300),image_source:marker(post,requires),image_width:Number(post.image_width||0)||0,image_height:Number(post.image_height||0)||0,image_bytes:Number(post.image_bytes||0)||0,image_quality_status:requires?'needs-generation':'unknown'};
  }
  function loadBank(){
    return new Promise((resolve,reject)=>{
      let done=false;const iframe=document.createElement('iframe');iframe.hidden=true;iframe.title='仙加味500篇母庫安全匯出';
      const cleanup=()=>{window.removeEventListener('message',onMessage);iframe.remove()};
      const timer=setTimeout(()=>{if(done)return;done=true;cleanup();reject(new Error('500篇母庫重建逾時，請稍後再試。'))},90000);
      function onMessage(event){
        if(done||event.origin!==PUBLIC_ORIGIN||event.data?.schema!=='xjw-post-bank-export-v1')return;
        done=true;clearTimeout(timer);cleanup();
        if(event.data.error)return reject(new Error(event.data.error));
        const posts=Array.isArray(event.data.posts)?event.data.posts:[];
        if(posts.length!==500)return reject(new Error(`母庫數量不正確：${posts.length}/500`));
        const ids=posts.map(post=>String(post?.id||'').trim());
        if(ids.some(id=>!id)||new Set(ids).size!==posts.length)return reject(new Error('500篇母庫存在空白或重複ID，已停止同步避免資料互相覆蓋。'));
        resolve(event.data);
      }
      window.addEventListener('message',onMessage);iframe.src=EXPORT_URL;document.body.appendChild(iframe);
    });
  }
  async function runPool(items,worker,onProgress){
    let index=0,done=0;const errors=[];
    async function runner(){while(true){const current=index++;if(current>=items.length)return;try{await worker(items[current],current)}catch(error){errors.push({item:items[current],error})}done++;onProgress?.(done,items.length)}}
    await Promise.all(Array.from({length:Math.min(WRITE_CONCURRENCY,items.length||1)},runner));return errors;
  }
  async function sync(button){
    if(button.dataset.busy==='1')return;
    if(!window.confirm('同步正式500篇母庫？系統會以母庫ID安全去重、略過已發布鎖定與活動冷卻；安全候選進待審核，需要重生成的只建立草稿，不會自動發布。'))return;
    button.dataset.busy='1';button.disabled=true;const original=button.textContent;button.textContent='重建500篇母庫…';
    try{
      const [bank,existing]=await Promise.all([loadBank(),allExisting()]);
      const protectedCount=bank.posts.filter(protectedPost).length,holdCount=bank.posts.filter(p=>!protectedPost(p)&&campaignHold(p)).length;
      const active=bank.posts.filter(p=>!protectedPost(p)&&!campaignHold(p));
      const missing=missingPosts(active,existing);
      if(!missing.length){toast(`母庫已同步完成：現有${existing.length}篇；已發布鎖定${protectedCount}篇、活動冷卻${holdCount}篇均維持保護。`);return}
      let created=0,pending=0,generation=0;
      const errors=await runPool(missing,async post=>{
        const requires=needsGeneration(post),createdPost=await api('/posts',{method:'POST',body:JSON.stringify(payload(post))});created++;
        if(requires){generation++;return}
        await api(`/posts/${encodeURIComponent(createdPost.id)}/regeneration-ready`,{method:'POST',body:JSON.stringify({mode:'all'})});pending++;
      },(done,total)=>{button.textContent=`同步中 ${done}/${total}`});
      const failed=errors.length;
      toast(`500篇母庫同步：新增${created}篇（待審核${pending}、需重生成草稿${generation}），略過已存在${active.length-missing.length}篇、已發布鎖定${protectedCount}篇、活動冷卻${holdCount}篇${failed?`；失敗${failed}篇`:''}。`,failed>0);
      document.dispatchEvent(new CustomEvent('xjw-post-bank-synced',{detail:{created,pending,generation,failed,protectedCount,holdCount}}));
      document.querySelector('[data-refresh]')?.click();
    }catch(error){toast(error?.message||String(error),true)}finally{button.dataset.busy='0';button.disabled=false;button.textContent=original}
  }
  function install(){
    const actions=document.querySelector('.publish-header-actions');if(!actions||actions.querySelector('[data-sync-post-bank]'))return;
    const button=document.createElement('button');button.type='button';button.className='btn';button.dataset.syncPostBank='1';button.textContent='同步500篇母庫';button.addEventListener('click',()=>sync(button));
    const add=actions.querySelector('[data-add-post]');actions.insertBefore(button,add||null);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.XJWPostBankSync=Object.freeze({version:VERSION,exportUrl:EXPORT_URL,loadBank,allExisting,sourceId,existingIdentity,missingPosts,needsGeneration,protectedPost,campaignHold,payload});
})();
