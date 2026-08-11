(()=>{
  const SITE='https://ts15825868.github.io/xianjiawei/';
  const IMAGE_VERSION='current-products-v3';
  const PRODUCTS=Object.freeze([
    {id:'guilu-gao',name:'龜鹿膏',spec:'100g／罐',allowedSpecs:['100g／罐'],ingredients:['鹿角萃取物','龜板萃取物','枸杞','紅棗','黃耆','粉光蔘'],usagePrimary:'一天一次一小匙',image:`${SITE}images/products-v3/guilu-gao.jpg?v=${IMAGE_VERSION}`,dimensions:{widthMm:51,heightMm:78},scaleRule:'六角玻璃罐只允許等比例縮放，不改罐型、金色蓋或標籤比例。'},
    {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',spec:'30cc／罐（小玻璃罐）',allowedSpecs:['30cc／罐（小玻璃罐）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],image:`${SITE}images/products-v3/guilu-drink-30.jpg?v=${IMAGE_VERSION}`,dimensions:{diameterMm:42,heightMm:51},scaleRule:'必須維持小罐感；裸罐、無貼紙、金色蓋；不可改成瓶型、做高、做胖或放大成接近100g龜鹿膏罐。'},
    {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',spec:'180cc／包（鋁袋）',allowedSpecs:['180cc／包（鋁袋）'],ingredients:['水','龜板萃取物','鹿角萃取物','粉光蔘','枸杞','紅棗','黃耆'],image:`${SITE}images/products-v3/guilu-drink-180.jpg?v=${IMAGE_VERSION}`,aspectRatio:{min:0.60,target:0.64,max:0.68},scaleRule:'狹長直立鋁袋；禁止橫向拉寬、加高或誇張放大。'},
    {id:'guilu-tangkuai',name:'龜鹿湯塊',spec:'75g／盒｜8塊裝',allowedSpecs:['75g／盒｜8塊裝'],ingredients:['龜板萃取物','鹿角萃取物'],image:`${SITE}images/products-v3/guilu-tangkuai.jpg?v=${IMAGE_VERSION}`,dimensions:null,scaleRule:'深藍正式盒；盒體毫米尺寸未知時不得自行猜測，只依核准原圖等比例呈現；目前顧客規格固定為75g／盒｜8塊裝。'},
    {id:'guilu-jiao',name:'龜鹿膠',spec:'600g／盒｜32塊裝',allowedSpecs:['600g／盒｜32塊裝'],ingredients:['龜板萃取物','鹿角萃取物'],image:`${SITE}images/products-v3/guilu-jiao.jpg?v=${IMAGE_VERSION}`,dimensions:null,scaleRule:'淡紫正式盒；毫米尺寸未知時不得自行猜測；不得橫向拉長，也不得縮成與75g湯塊相近尺寸；目前顧客規格固定為600g／盒｜32塊裝。'},
    {id:'luerong-fen',name:'鹿茸粉',spec:'75g／罐',allowedSpecs:['75g／罐'],ingredients:['鹿茸'],image:`${SITE}images/products-v3/luerong-fen.jpg?v=${IMAGE_VERSION}`,dimensions:null,scaleRule:'白色正式塑膠罐；毫米尺寸未知時不得自行猜測，只依核准原圖等比例呈現。'}
  ]);
  const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
  const BY_ID=new Map(PRODUCTS.map(item=>[item.id,item]));
  window.XJW_PRODUCT_AUTHORITY=Object.freeze({
    version:'current-products-v3-authority',
    productImageVersion:IMAGE_VERSION,
    products:PRODUCTS,
    byId:BY_ID,
    soupBlockOnly:'75g／盒｜8塊裝',
    drink30Container:'小玻璃罐',
    guiluGaoUsagePrimary:'一天一次一小匙',
    imageAuthority:'products-v3-current-original-product-photos',
    physicalScaleAuthority:'data/product-physical-scale-authority-v20260809.json',
    hardScaleRule:'產品本體只能使用核准實拍並整體等比例縮放；禁止拉寬、拉高、裁切、AI重畫或把不同產品強制等高／等寬。',
    unknownScaleRule:'沒有可信尺寸或相對尺度依據時不得自行猜測，改用單品原圖或送人工審核。',
    guardPolicy:'current-authority-capability-based-no-historical-version-or-short-spec-lock'
  });

  function toast(message,error=true){
    const root=document.getElementById('toastRoot');
    if(!root){alert(message);return}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),5200);
  }
  function normalizedName(name,spec=''){
    const value=String(name||'').trim(),size=String(spec||'').trim();
    if(value==='龜鹿飲'&&size.startsWith('30cc'))return '龜鹿飲30cc玻璃罐';
    if(value==='龜鹿飲'&&size.startsWith('180cc'))return '龜鹿飲180cc鋁袋';
    return value;
  }
  function ingredientList(value=''){return String(value||'').split(/[、,，;；\n\r]+/).map(x=>x.trim()).filter(Boolean)}
  function contentErrors(text=''){
    const value=String(text||''),errors=[];
    if(/30\s*cc/i.test(value)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶|30\s*cc\s*瓶裝)/i.test(value))errors.push('30cc正式名稱與包裝必須使用「龜鹿飲30cc玻璃罐／30cc／罐（小玻璃罐）」，不得稱瓶。');
    if(value.includes('龜鹿膏')&&/(每日早上及下午各一小匙|早上及下午各一小匙|早晚各一小匙)/.test(value))errors.push('龜鹿膏目前正式主要使用資料為「一天一次一小匙」。');
    if(/龜鹿湯塊.{0,100}每塊約?\s*9\.375\s*g/i.test(value))errors.push('龜鹿湯塊目前正式顧客規格為「75g／盒｜8塊裝」，不得再硬帶退役每塊重量。');
    if(/龜鹿湯塊.{0,100}(300\s*g|600\s*g)/i.test(value))errors.push('龜鹿湯塊目前正式顧客規格只有「75g／盒｜8塊裝」。');
    if(/龜鹿膠.{0,100}(1\s*斤|每塊約?\s*18\.75\s*g)/i.test(value))errors.push('龜鹿膠目前正式顧客規格為「600g／盒｜32塊裝」，不得再硬帶退役1斤／每塊重量延伸字樣。');
    return [...new Set(errors)];
  }
  function postFormErrors(form){
    const data=new FormData(form);
    return contentErrors([data.get('title'),data.get('headline'),data.get('copy'),data.get('category'),data.get('image_alt'),data.get('image_source')].filter(Boolean).join('\n'));
  }
  function productFormErrors(form){
    const data=new FormData(form),name=String(data.get('name')||'').trim(),spec=String(data.get('specification')||'').trim();
    const normalized=normalizedName(name,spec),expected=BY_NAME.get(normalized),errors=[];
    if(!expected)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
    if(!expected.allowedSpecs.includes(spec))errors.push(`${expected.name}規格必須使用目前完整正式版本，目前為「${spec||'未填'}」。`);
    const ingredients=ingredientList(data.get('ingredients'));
    if(ingredients.length&&JSON.stringify(ingredients)!==JSON.stringify(expected.ingredients))errors.push(`${expected.name}正式成分或順序不同步。`);
    const usage=String(data.get('usage')||'').trim();
    if(expected.usagePrimary&&usage&&!usage.includes(expected.usagePrimary))errors.push(`${expected.name}使用方式必須包含「${expected.usagePrimary}」。`);
    errors.push(...contentErrors(`${normalized} ${spec}\n${usage}`));
    return [...new Set(errors)];
  }
  function insertAuthorityNote(form){
    if(form.querySelector('[data-product-authority-note]'))return;
    const grid=form.querySelector('.form-grid');if(!grid)return;
    const note=document.createElement('div');note.dataset.productAuthorityNote='1';note.className='xjw-ok';
    note.textContent='目前正式資料：六項產品／六項完整規格；產品本體只用products-v3真正正式實拍並等比例顯示。龜鹿膏100g／罐；30cc／罐（小玻璃罐）；180cc／包（鋁袋）；龜鹿湯塊75g／盒｜8塊裝；龜鹿膠600g／盒｜32塊裝；鹿茸粉75g／罐。30cc約Ø42×H51mm、龜鹿膏約51×78mm、180cc維持狹長鋁袋；未知尺寸不猜、不拉伸。';
    grid.prepend(note);
  }
  function autofillProduct(form){
    if(!form||location.hash!=='#products')return;
    const name=form.elements.name,spec=form.elements.specification,ingredients=form.elements.ingredients,usage=form.elements.usage;
    if(!name||!spec)return;
    const normalized=normalizedName(name.value,spec.value),item=BY_NAME.get(normalized)||BY_NAME.get(String(name.value||'').trim());
    if(!item)return;
    if(!spec.value.trim())spec.value=item.spec;
    if(ingredients&&!ingredients.value.trim())ingredients.value=item.ingredients.join('、');
    if(item.usagePrimary&&usage&&!usage.value.trim())usage.value=`${item.usagePrimary}；初次可先從半匙開始；可直接取用或以熱水化開；避免接近睡前食用。`;
  }
  function enforceProductImageDisplay(root=document){
    root.querySelectorAll?.('img[data-product-id],img[data-product]').forEach(img=>{
      const id=img.dataset.productId||img.dataset.product||'';
      const item=BY_ID.get(id);if(!item)return;
      img.src=item.image;
      img.style.objectFit='contain';
      img.style.objectPosition='center';
      img.style.maxWidth='100%';
      img.style.maxHeight='100%';
      img.style.transform='none';
      img.style.clipPath='none';
      img.dataset.xjwScalePolicy='uniform-only';
    });
  }
  document.addEventListener('input',event=>{
    const form=event.target?.form;
    if(form?.id==='recordForm'&&location.hash==='#products'&&['name','specification'].includes(event.target.name))autofillProduct(form);
  });
  document.addEventListener('blur',event=>{
    const form=event.target?.form;
    if(form?.id==='recordForm'&&location.hash==='#products')autofillProduct(form);
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement))return;
    let errors=[];
    if(form.id==='postForm')errors=postFormErrors(form);
    else if(form.id==='recordForm'&&location.hash==='#products')errors=productFormErrors(form);
    if(!errors.length)return;
    event.preventDefault();event.stopImmediatePropagation();toast(`目前正式產品資料檢查未通過：${errors.join('；')}`);
  },true);
  const observer=new MutationObserver(()=>{
    const post=document.getElementById('postForm');if(post)insertAuthorityNote(post);
    const record=document.getElementById('recordForm');if(record&&location.hash==='#products'){insertAuthorityNote(record);autofillProduct(record)}
    enforceProductImageDisplay();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>enforceProductImageDisplay(),{once:true});else enforceProductImageDisplay();
})();
