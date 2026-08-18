(()=>{
  const MAX_UPLOAD_BYTES=700*1024;
  const MAX_EDGE=1600;
  const $=(selector,root=document)=>root.querySelector(selector);
  const originalFetch=window.fetch.bind(window);

  function requestPath(input){
    try{
      if(typeof input==='string')return new URL(input,location.href).pathname;
      if(input&&input.url)return new URL(input.url,location.href).pathname;
    }catch{}
    return '';
  }

  function requestMethod(input,init){
    return String(init?.method||input?.method||'GET').toUpperCase();
  }

  // 後端既有更新流程會先把修改後貼文退回 draft。
  // 使用者規則是：圖文完整後必須自動回「待審核」，而不是停在草稿。
  // 這層只處理貼文儲存成功後的狀態銜接，不會自動核准／排程／發布。
  window.fetch=async function(input,init={}){
    const path=requestPath(input),method=requestMethod(input,init);
    const response=await originalFetch(input,init);
    const isPostWrite=(method==='POST'&&path==='/api/posts')||(method==='PUT'&&/^\/api\/posts\/[^/]+$/.test(path));
    if(!isPostWrite||!response.ok)return response;
    try{
      const saved=await response.clone().json();
      if(!saved?.id||saved.status!=='draft'||!String(saved.image_url||'').trim())return response;
      const hasCopy=Boolean(String(saved.copy||saved.headline||'').trim());
      const hasPlatforms=Array.isArray(saved.platforms)&&saved.platforms.length>0;
      if(!hasCopy||!hasPlatforms)return response;
      const reviewResponse=await originalFetch(`/api/posts/${encodeURIComponent(saved.id)}/status`,{
        method:'POST',
        credentials:'same-origin',
        cache:'no-store',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({status:'pending_review'})
      });
      if(reviewResponse.ok)return reviewResponse;
    }catch{}
    return response;
  };

  function showStatus(host,message,error=false){
    let node=host.querySelector('[data-device-upload-status]');
    if(!node){
      node=document.createElement('div');
      node.dataset.deviceUploadStatus='1';
      node.style.cssText='margin-top:8px;font-size:13px;line-height:1.5;color:#52606d;';
      host.appendChild(node);
    }
    node.textContent=message;
    node.style.color=error?'#b42318':'#52606d';
  }

  function loadImage(file){
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file);
      const image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('圖片讀取失敗，請換一張圖片再試。'));};
      image.src=url;
    });
  }

  function canvasBlob(canvas,type,quality){
    return new Promise((resolve)=>canvas.toBlob(resolve,type,quality));
  }

  async function prepareImage(file){
    if(!file||!String(file.type||'').startsWith('image/')) throw new Error('請選擇圖片檔。');
    const image=await loadImage(file);
    const sourceWidth=image.naturalWidth||image.width;
    const sourceHeight=image.naturalHeight||image.height;
    if(!sourceWidth||!sourceHeight) throw new Error('無法取得圖片尺寸。');

    let scale=Math.min(1,MAX_EDGE/Math.max(sourceWidth,sourceHeight));
    let width=Math.max(1,Math.round(sourceWidth*scale));
    let height=Math.max(1,Math.round(sourceHeight*scale));
    let quality=0.88;
    let blob=null;

    for(let pass=0;pass<7;pass+=1){
      const canvas=document.createElement('canvas');
      canvas.width=width;
      canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      ctx.fillStyle='#ffffff';
      ctx.fillRect(0,0,width,height);
      ctx.drawImage(image,0,0,width,height);
      blob=await canvasBlob(canvas,'image/jpeg',quality);
      if(blob&&blob.size<=MAX_UPLOAD_BYTES) break;
      quality=Math.max(0.66,quality-0.06);
      if(pass>=3){
        width=Math.max(900,Math.round(width*0.88));
        height=Math.max(900,Math.round(height*0.88));
      }
    }
    if(!blob) throw new Error('圖片轉換失敗。');
    if(blob.size>MAX_UPLOAD_BYTES) throw new Error('圖片仍然太大，請選擇較小的圖片。');
    return {blob,width,height,originalName:file.name||'image.jpg'};
  }

  async function uploadPrepared(prepared){
    const formData=new FormData();
    formData.append('file',prepared.blob,prepared.originalName.replace(/\.[^.]+$/,'')+'.jpg');
    formData.append('width',String(prepared.width));
    formData.append('height',String(prepared.height));
    const response=await fetch('/api/media-upload',{method:'POST',credentials:'same-origin',cache:'no-store',body:formData});
    const text=await response.text();
    let data={};
    try{data=text?JSON.parse(text):{};}catch{}
    if(!response.ok) throw new Error(data.error||`圖片上傳失敗（HTTP ${response.status}）`);
    return data;
  }

  function ensureHidden(form,name){
    let input=form.querySelector(`[name="${name}"]`);
    if(!input){
      input=document.createElement('input');
      input.type='hidden';
      input.name=name;
      form.appendChild(input);
    }
    return input;
  }

  function enhanceField(input){
    if(!input||input.dataset.deviceUploadReady==='1') return;
    input.dataset.deviceUploadReady='1';
    const field=input.closest('.field')||input.parentElement;
    const form=input.closest('form');
    if(!field||!form) return;

    const wrap=document.createElement('div');
    wrap.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;align-items:center;';
    const button=document.createElement('button');
    button.type='button';
    button.className='btn';
    button.textContent='從手機／平板／電腦上傳圖片';
    button.style.cssText='min-height:44px;';
    const picker=document.createElement('input');
    picker.type='file';
    picker.accept='image/*';
    picker.hidden=true;
    wrap.append(button,picker);
    field.appendChild(wrap);

    const preview=document.createElement('img');
    preview.alt='貼文圖片預覽';
    preview.style.cssText='display:none;margin-top:10px;max-width:100%;max-height:360px;width:auto;height:auto;object-fit:contain;border-radius:14px;border:1px solid #d8dee8;background:#fff;';
    field.appendChild(preview);
    if(String(input.value||'').trim()){
      preview.src=input.value.trim();
      preview.style.display='block';
    }
    input.addEventListener('input',()=>{
      const value=String(input.value||'').trim();
      if(!value){preview.removeAttribute('src');preview.style.display='none';return;}
      preview.src=value;
      preview.style.display='block';
    });

    button.addEventListener('click',()=>picker.click());
    picker.addEventListener('change',async()=>{
      const file=picker.files&&picker.files[0];
      if(!file) return;
      button.disabled=true;
      showStatus(field,'正在處理並上傳圖片…');
      try{
        const prepared=await prepareImage(file);
        const uploaded=await uploadPrepared(prepared);
        input.value=uploaded.url||'';
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        ensureHidden(form,'image_width').value=String(uploaded.width||prepared.width||0);
        ensureHidden(form,'image_height').value=String(uploaded.height||prepared.height||0);
        ensureHidden(form,'image_bytes').value=String(uploaded.bytes||prepared.blob.size||0);
        ensureHidden(form,'image_source').value='裝置上傳｜使用者人工指定';
        const alt=form.querySelector('[name="image_alt"]');
        if(alt&&!alt.value.trim()) alt.value=(file.name||'仙加味貼文圖片').replace(/\.[^.]+$/,'');
        showStatus(field,'圖片已上傳並帶入貼文；儲存後圖文完整會自動回到「待審核」。');
      }catch(error){
        showStatus(field,error.message||String(error),true);
      }finally{
        button.disabled=false;
        picker.value='';
      }
    });
  }

  function scan(root=document){
    root.querySelectorAll('form input[name="image_url"], form input[name="file_url"]').forEach(enhanceField);
  }

  const observer=new MutationObserver((mutations)=>{
    for(const mutation of mutations){
      for(const node of mutation.addedNodes){
        if(node&&node.nodeType===1) scan(node);
      }
    }
  });

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>scan());
  else scan();
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
