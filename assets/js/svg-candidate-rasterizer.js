(()=>{
  const PUBLIC_BASE='https://ts15825868.github.io/xianjiawei/';
  const RAW_BASE='https://raw.githubusercontent.com/TS15825868/xianjiawei/main/';
  const MAX_BYTES=700*1024;
  const TARGET_SIZE=1254;
  const processing=new Map();

  const toast=(message,error=false)=>{
    const root=document.getElementById('toastRoot');
    if(!root){if(error)alert(message);return;}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),4500);
  };
  const json=async(response)=>{const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{data={message:text};}if(!response.ok)throw new Error(data.error||data.detail||data.message||`HTTP ${response.status}`);return data;};
  const isSvg=(value='')=>/\.svg(?:[?#]|$)/i.test(String(value));
  const normalizeUrl=(value='')=>{
    const text=String(value||'').trim();
    if(/^https?:\/\//i.test(text))return text;
    return PUBLIC_BASE+text.replace(/^\/+/, '');
  };
  const rawUrl=(value='')=>normalizeUrl(value).replace(PUBLIC_BASE,RAW_BASE);
  const postIdFromButton=(button)=>button?.dataset?.id||button?.dataset?.postPublishNow||button?.closest('.xjw-row')?.querySelector('[data-post-view]')?.getAttribute('data-post-view')||'';

  async function getPost(id){return json(await fetch(`/api/posts/${encodeURIComponent(id)}`,{credentials:'same-origin',cache:'no-store'}));}
  async function patchPost(id,payload){return json(await fetch(`/api/posts/${encodeURIComponent(id)}`,{method:'PATCH',credentials:'same-origin',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}));}
  function canvasBlob(canvas,quality){return new Promise((resolve)=>canvas.toBlob(resolve,'image/jpeg',quality));}

  async function renderSvgToJpeg(url){
    const source=rawUrl(url);
    const response=await fetch(source,{mode:'cors',cache:'no-store'});
    if(!response.ok)throw new Error(`候選圖讀取失敗（HTTP ${response.status}）`);
    let svg=await response.text();
    svg=svg.replace(/href=(['"])(\.\.\/\.\.\/products-v3\/)/g,`href=$1${RAW_BASE}images/products-v3/`);
    svg=svg.replace(/href=(['"])(images\/products-v3\/)/g,`href=$1${RAW_BASE}$2`);
    const svgBlob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'});
    const objectUrl=URL.createObjectURL(svgBlob);
    try{
      const image=await new Promise((resolve,reject)=>{const node=new Image();node.crossOrigin='anonymous';node.onload=()=>resolve(node);node.onerror=()=>reject(new Error('候選SVG轉圖失敗，請重新生成或改用裝置上傳。'));node.src=objectUrl;});
      const canvas=document.createElement('canvas');canvas.width=TARGET_SIZE;canvas.height=TARGET_SIZE;
      const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#F7F4ED';ctx.fillRect(0,0,TARGET_SIZE,TARGET_SIZE);ctx.drawImage(image,0,0,TARGET_SIZE,TARGET_SIZE);
      let quality=0.92,blob=null;
      for(let i=0;i<6;i+=1){blob=await canvasBlob(canvas,quality);if(blob&&blob.size<=MAX_BYTES)break;quality=Math.max(0.68,quality-0.05);}
      if(!blob||blob.size>MAX_BYTES)throw new Error('候選圖轉JPEG後仍超過上傳限制。');
      return blob;
    }finally{URL.revokeObjectURL(objectUrl);}
  }
  async function upload(blob,id){
    const form=new FormData();form.append('file',blob,`${id}-approved-candidate.jpg`);form.append('width',String(TARGET_SIZE));form.append('height',String(TARGET_SIZE));
    return json(await fetch('/api/media-upload',{method:'POST',credentials:'same-origin',cache:'no-store',body:form}));
  }
  function rasterSourceLabel(post){
    const current=String(post?.image_source||'').trim();
    if(current.startsWith('公開發布中心:'))return `${current}｜正式原圖候選自動轉JPEG`;
    if(current)return `${current}｜自動轉JPEG`;
    return 'GitHub正式原圖合成候選｜自動轉JPEG';
  }
  async function ensureRaster(id){
    if(processing.has(id))return processing.get(id);
    const task=(async()=>{
      const post=await getPost(id);
      if(!isSvg(post.image_url))return {changed:false,post};
      toast('正在把正式原圖候選轉成可發布 JPEG…');
      const blob=await renderSvgToJpeg(post.image_url);
      const uploaded=await upload(blob,id);
      const patched=await patchPost(id,{image_url:uploaded.url,image_width:uploaded.width||TARGET_SIZE,image_height:uploaded.height||TARGET_SIZE,image_bytes:uploaded.bytes||blob.size,image_source:rasterSourceLabel(post),image_quality_status:'ok'});
      toast('候選圖已自動轉成 JPEG 並存入 ERP 媒體庫。');
      return {changed:true,post:patched,uploaded};
    })().finally(()=>processing.delete(id));
    processing.set(id,task);return task;
  }

  document.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-post-publish-now], [data-post-status="approved"], [data-manual-package]');
    if(!button||button.dataset.xjwRasterReady==='1')return;
    const id=postIdFromButton(button);if(!id)return;
    event.preventDefault();event.stopImmediatePropagation();button.disabled=true;
    try{
      await ensureRaster(id);
      button.dataset.xjwRasterReady='1';
      button.disabled=false;
      button.click();
    }catch(error){button.disabled=false;toast(error.message||String(error),true);}
  },true);

  window.XJWExactOriginalRasterizer={version:'2026-08-08-v2-source-preserved',ensureRaster,isSvg,rawUrl,rasterSourceLabel};
})();
