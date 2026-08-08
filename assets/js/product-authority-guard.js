(()=>{
  const PRODUCTS=Object.freeze([
    {id:'guilu-gao',name:'龜鹿膏',spec:'100g／罐',allowedSpecs:['100g／罐']},
    {id:'guilu-drink-30',name:'龜鹿飲30cc玻璃罐',spec:'30cc／罐',allowedSpecs:['30cc／罐','30cc／罐（小玻璃罐）']},
    {id:'guilu-drink-180',name:'龜鹿飲180cc鋁袋',spec:'180cc／包',allowedSpecs:['180cc／包','180cc／包（鋁袋）']},
    {id:'guilu-tangkuai',name:'龜鹿湯塊',spec:'75g／盒',allowedSpecs:['75g／盒','75g／盒｜8塊裝｜每塊約9.375g']},
    {id:'guilu-jiao',name:'龜鹿膠',spec:'600g（1斤）／盒',allowedSpecs:['600g（1斤）／盒','600g（1斤）／盒｜32塊裝｜每塊約18.75g']},
    {id:'luerong-fen',name:'鹿茸粉',spec:'75g／罐',allowedSpecs:['75g／罐']}
  ]);
  const BY_NAME=new Map(PRODUCTS.map(item=>[item.name,item]));
  window.XJW_PRODUCT_AUTHORITY=Object.freeze({version:'2026-08-08-v3',products:PRODUCTS,soupBlockOnly:'75g／盒',drink30Container:'小玻璃罐'});

  function toast(message,error=true){
    const root=document.getElementById('toastRoot');
    if(!root){alert(message);return}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),5200);
  }
  function soupWeightErrors(text=''){
    const labels=['龜鹿湯塊','龜鹿膠','龜鹿膏','鹿茸粉'],errors=[];
    const re=/(?<!\d)(\d+(?:\.\d+)?)\s*g/gi;let match;
    while((match=re.exec(String(text)))){
      const number=Number(match[1]);if(!Number.isFinite(number)||number<50)continue;
      const before=String(text).slice(Math.max(0,match.index-80),match.index);let pos=-1,label='';
      for(const candidate of labels){const p=before.lastIndexOf(candidate);if(p>pos){pos=p;label=candidate}}
      if(label==='龜鹿湯塊'&&Math.abs(number-75)>0.001)errors.push(`龜鹿湯塊只能使用75g／盒，目前出現${match[0]}`);
    }
    return errors;
  }
  function contentErrors(text=''){
    const value=String(text||''),errors=[...soupWeightErrors(value)];
    if(/30\s*cc/i.test(value)&&/(玻璃瓶|小玻璃瓶|30\s*cc\s*／\s*瓶)/i.test(value))errors.push('30cc正式名稱與包裝必須使用「龜鹿飲30cc玻璃罐／30cc／罐」，不得稱瓶。');
    return [...new Set(errors)];
  }
  function postFormErrors(form){
    const data=new FormData(form);
    return contentErrors([data.get('title'),data.get('headline'),data.get('copy'),data.get('category'),data.get('image_alt')].filter(Boolean).join('\n'));
  }
  function productFormErrors(form){
    const data=new FormData(form),name=String(data.get('name')||'').trim(),spec=String(data.get('specification')||'').trim();
    const normalized=name==='龜鹿飲'&&spec.startsWith('30cc')?'龜鹿飲30cc玻璃罐':name==='龜鹿飲'&&spec.startsWith('180cc')?'龜鹿飲180cc鋁袋':name;
    const expected=BY_NAME.get(normalized);
    if(!expected)return [`產品中心只允許六項正式產品，目前名稱「${name||'未填'}」不在正式清單。`];
    if(!expected.allowedSpecs.includes(spec))return [`${expected.name}規格必須使用正式版本，目前為「${spec||'未填'}」。`];
    return contentErrors(`${normalized} ${spec}`);
  }
  function insertAuthorityNote(form){
    if(form.querySelector('[data-product-authority-note]'))return;
    const grid=form.querySelector('.form-grid');if(!grid)return;
    const note=document.createElement('div');note.dataset.productAuthorityNote='1';note.className='xjw-ok';
    note.textContent='正式產品資料鎖定：六個產品、六個規格；龜鹿湯塊深藍盒只有75g／盒。儲存時會檢查，不符合不寫入。';
    grid.prepend(note);
  }
  document.addEventListener('submit',event=>{
    const form=event.target;if(!(form instanceof HTMLFormElement))return;
    let errors=[];
    if(form.id==='postForm')errors=postFormErrors(form);
    else if(form.id==='recordForm'&&location.hash==='#products')errors=productFormErrors(form);
    if(!errors.length)return;
    event.preventDefault();event.stopImmediatePropagation();toast(`正式產品規格檢查未通過：${errors.join('；')}`);
  },true);
  const observer=new MutationObserver(()=>{
    const post=document.getElementById('postForm');if(post)insertAuthorityNote(post);
    const record=document.getElementById('recordForm');if(record&&location.hash==='#products')insertAuthorityNote(record);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
