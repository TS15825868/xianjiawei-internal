(()=>{
  const VERSION='20260915-content-guidance-v6-timed-mixed';
  const TOPIC_SOURCES=[
    {url:'/assets/data/social-conversation-topic-bank-current.json?v='+VERSION,label:'輕鬆互動',priority:0},
    {url:'/assets/data/guilu-content-topic-bank-v20260814.json?v='+VERSION,label:'龜鹿長青',priority:1}
  ];
  const LEGACY_BRAND=['台興山產・仙加味','台興山產有限公司','台興山產'];
  const REJECTED=['不是每個人都一定需要'];
  const BLOCKED_UNFINISHED=['柒玄茶','龜鹿調飲粉'];
  const RISKY=['治療','治癒','療效','改善疾病','預防疾病','保證功效','保證改善','藥到病除','關節','卡卡','疲勞','精神不濟','補氣','生津','膠原蛋白','鈣質'];
  const SEASON_LABELS={evergreen:'長青',cool_season:'天涼季節',year_end:'年末',new_year:'跨年／新年',pre_lunar_new_year:'農曆年前',lunar_new_year:'農曆年節',post_lunar_new_year:'年後／開工',weather_trigger:'即時天氣'};
  // 2027 農曆初一為 2/6；這裡把除夕前後拆成備稿／年節／年後三個發布窗口。
  const SEASON_WINDOWS={
    cool_season:[['2026-11-01','2027-03-15']],
    year_end:[['2026-12-01','2026-12-31']],
    new_year:[['2026-12-26','2027-01-10']],
    pre_lunar_new_year:[['2027-01-15','2027-02-04']],
    lunar_new_year:[['2027-02-05','2027-02-10']],
    post_lunar_new_year:[['2027-02-11','2027-02-21']]
  };
  let topics=[];

  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const taipeiToday=()=>{
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const inRange=(date,start,end)=>date>=start&&date<=end;
  function topicTiming(topic){
    const season=String(topic?.season||'evergreen');
    if(topic?.triggerOnly===true||season==='weather_trigger')return{kind:'weather',label:'⚡ 依萬華即時天氣插播'};
    if(season==='evergreen'||!SEASON_WINDOWS[season])return{kind:'now',label:'現在可用'};
    const today=taipeiToday(),ranges=SEASON_WINDOWS[season]||[];
    if(ranges.some(([start,end])=>inRange(today,start,end)))return{kind:'now',label:`當期可用｜${SEASON_LABELS[season]||season}`};
    const next=ranges.find(([,end])=>today<end);
    if(next&&today<next[0])return{kind:'future',label:`預備稿｜建議 ${next[0]}～${next[1]}`};
    return{kind:'past',label:`本期已過｜${SEASON_LABELS[season]||season}`};
  }
  function toast(message,error=false){
    const root=document.getElementById('toastRoot');
    if(!root){if(error)alert(message);return;}
    const n=document.createElement('div');n.className=`toast ${error?'error':''}`;n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),4200);
  }
  function scan(value=''){
    const text=String(value||''),errors=[];
    if(LEGACY_BRAND.some(x=>text.includes(x)))errors.push('對外品牌名稱只使用「仙加味」');
    if(REJECTED.some(x=>text.includes(x)))errors.push('此品牌定位句已停用，請改用正向生活情境或文化敘事');
    if(BLOCKED_UNFINISHED.some(x=>text.includes(x)))errors.push('柒玄茶・龜鹿調飲粉尚未完成，目前不得放入公開貼文');
    if(RISKY.some(x=>text.includes(x)))errors.push('含不適合食品公開內容的功效／健康宣稱，請改用飲食文化、產品型態、原料、工序、料理或一般使用情境');
    if(/30cc／瓶|30\s*cc\s*瓶裝|龜鹿飲30cc玻璃瓶/.test(text))errors.push('30cc正式單位為「罐」，名稱使用「龜鹿飲30cc玻璃罐」');
    return[...new Set(errors)];
  }
  function formText(form){return['title','headline','copy','category'].map(name=>form.elements[name]?.value||'').join(' ')}
  function guidanceBox(form){
    let box=form.querySelector('[data-content-guidance]');
    if(box)return box;
    box=document.createElement('div');box.dataset.contentGuidance='1';box.className='xjw-warning';box.style.margin='10px 0 0';
    const copy=form.elements.copy?.closest('.field');
    copy?.insertAdjacentElement('afterend',box);
    return box;
  }
  function updateGuidance(form){
    const box=guidanceBox(form),errors=scan(formText(form));
    if(!box)return errors;
    if(errors.length){box.textContent='文案檢查：'+errors.join('；');box.dataset.level='warning';}
    else{
      box.textContent='文案方向正常：聊天、問答、生活觀察、料理、萬華、品牌與知識自然穿插；不必每篇硬塞產品或LINE OA。天氣與季節內容要以實際時間為準，產品入鏡只能用正式實物外觀。';
      box.dataset.level='ok';
    }
    return errors;
  }
  function bindForm(form){
    if(!form||form.dataset.contentGuidanceReady)return;
    form.dataset.contentGuidanceReady='1';
    ['title','headline','copy','category'].forEach(name=>form.elements[name]?.addEventListener('input',()=>updateGuidance(form)));
    form.addEventListener('submit',event=>{
      const errors=updateGuidance(form);
      if(!errors.length)return;
      event.preventDefault();event.stopImmediatePropagation();
      toast('文案尚有需要修正的項目，請先看文案檢查提醒。',true);
    },true);
    updateGuidance(form);
  }
  function waitForForm(callback,attempt=0){
    const form=document.getElementById('postForm');
    if(form){bindForm(form);callback?.(form);return;}
    if(attempt<20)setTimeout(()=>waitForForm(callback,attempt+1),60);
  }
  function currentTopicMedia(topic){
    const policy=window.XJWFormalMediaPolicy;
    const current=policy?.mediaForTopic?.(topic);
    if(current?.public_url)return current;
    const fallback=String(topic?.imageUrl||'').trim();
    return fallback?{public_url:fallback,alt:topic?.imageAlt||topic?.title||'',source:topic?.imageSource||'題庫既有素材',role:topic?.imageMode||'topic-fallback'}:null;
  }
  function applyTopic(topic){
    document.querySelector('[data-topic-modal]')?.remove();
    document.querySelector('[data-add-post]')?.click();
    waitForForm(form=>{
      const media=currentTopicMedia(topic),timing=topicTiming(topic);
      if(form.elements.title)form.elements.title.value=topic.title||'';
      if(form.elements.headline)form.elements.headline.value=topic.headline||'';
      if(form.elements.copy)form.elements.copy.value=topic.copy||'';
      if(form.elements.category)form.elements.category.value=topic.category||'生活聊天';
      if(media?.public_url&&form.elements.image_url)form.elements.image_url.value=media.public_url;
      if(form.elements.image_alt)form.elements.image_alt.value=media?.alt||topic.imageAlt||'';
      if(form.elements.image_source&&media?.source)form.elements.image_source.value=`${media.source}|題庫:${topic.id||''}`;
      updateGuidance(form);
      form.elements.title?.focus();
      const videoFirst=Array.isArray(topic.formatPreference)&&topic.formatPreference.includes('short_video_if_formal');
      if(timing.kind==='weather'){
        toast('這是即時天氣題：請先確認萬華實際天氣符合；不符合就不要使用，原排內容順延。',true);
      }else if(timing.kind==='future'){
        toast(`${timing.label}。現在可以先備稿／製作素材，但不要提早排程或發布。`);
      }else if(timing.kind==='past'){
        toast('這個節慶窗口已過，先保留到下一個合適年度，不要硬發。',true);
      }else if(media?.public_url){
        toast('已帶入題目與目前正式圖片；儲存後先送待審核，再完成16項圖文審核。');
      }else if(videoFirst){
        toast('已帶入題目；短影片只有正式正常才採用，否則直接製作完整正式情境圖，完成前不送審。');
      }else{
        toast('已帶入題目；此題需依文案配對完整正式情境圖後再送審。');
      }
    });
  }
  function sourceLabel(topic){return topic.__sourceLabel||'內容題庫'}
  function seasonLabel(topic){return SEASON_LABELS[topic.season]||'一般'}
  function topicSortValue(topic){
    const timing=topicTiming(topic),kindRank={now:0,weather:1,future:2,past:3}[timing.kind]??4;
    return kindRank*100000+(Number(topic.__sourcePriority)||0)*10000+(Number(topic.__mixedRank)||Number(topic.__sourceIndex)||0);
  }
  function sortedTopics(){return [...topics].sort((a,b)=>topicSortValue(a)-topicSortValue(b))}
  function openTopics(){
    document.querySelector('[data-topic-modal]')?.remove();
    const root=document.createElement('div');root.className='xjw-modal';root.dataset.topicModal='1';
    const ready=topics.filter(topic=>topic.seedToReview===true).length;
    const interactive=topics.filter(topic=>topic.__sourceLabel==='輕鬆互動').length;
    const weather=topics.filter(topic=>topicTiming(topic).kind==='weather').length;
    const ordered=sortedTopics();
    root.innerHTML=`<div class="xjw-modal-bg" data-topic-close></div><div class="xjw-modal-card"><p class="eyebrow">仙加味・內容題庫</p><h2>聊天、生活、季節與龜鹿長青主題</h2><p class="muted">共 ${topics.length} 題，其中 ${interactive} 題為輕鬆互動／季節母庫、${weather} 題為即時天氣插播題；${ready} 題已有可安全沿用的正式圖片。正式發布前再打散同類題材；天氣題只在萬華實際天氣符合時使用。</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0"><button type="button" class="btn" data-topic-filter="now">現在可用</button><button type="button" class="btn" data-topic-filter="weather">即時天氣</button><button type="button" class="btn" data-topic-filter="future">年底／年節預備</button><button type="button" class="btn" data-topic-filter="all">全部</button></div><input type="search" class="input" data-topic-search placeholder="搜尋主題、分類或內容" style="width:100%;margin-bottom:10px"><div data-topic-list style="display:grid;gap:10px;max-height:55vh;overflow:auto">${ordered.map((topic,index)=>{const timing=topicTiming(topic);return `<button type="button" class="btn" data-topic-index="${index}" data-topic-kind="${esc(timing.kind)}" data-topic-search-text="${esc([topic.title,topic.headline,topic.category,topic.copy].join(' ').toLowerCase())}" style="white-space:normal;text-align:left;height:auto;padding:12px 14px"><strong>${esc(topic.title)}</strong><br><small>${esc(topic.headline||'')}</small><br><small>${esc(sourceLabel(topic))}｜${esc(seasonLabel(topic))}｜${esc(timing.label)}｜${topic.seedToReview===true?'✓ 已有正式圖，可送審':'○ 需完成專屬情境圖／正式影片'}</small></button>`}).join('')}</div><div class="xjw-modal-footer"><button type="button" class="btn" data-topic-close>關閉</button></div></div>`;
    document.body.appendChild(root);
    const buttons=[...root.querySelectorAll('[data-topic-index]')];
    const applyFilter=kind=>{buttons.forEach(button=>{button.hidden=kind!=='all'&&button.dataset.topicKind!==kind})};
    root.querySelectorAll('[data-topic-filter]').forEach(button=>button.addEventListener('click',()=>applyFilter(button.dataset.topicFilter)));
    root.querySelector('[data-topic-search]')?.addEventListener('input',event=>{
      const q=String(event.target.value||'').trim().toLowerCase();
      buttons.forEach(button=>{button.hidden=q&&!button.dataset.topicSearchText.includes(q)});
    });
    root.querySelectorAll('[data-topic-close]').forEach(n=>n.addEventListener('click',()=>root.remove()));
    buttons.forEach(n=>n.addEventListener('click',()=>applyTopic(ordered[Number(n.dataset.topicIndex)])));
  }
  function installButton(){
    const actions=document.querySelector('.publish-header-actions');
    if(!actions)return;
    let button=actions.querySelector('[data-topic-bank]');
    if(!button){
      button=document.createElement('button');button.className='btn';button.type='button';button.dataset.topicBank='1';
      const add=actions.querySelector('[data-add-post]');if(add)actions.insertBefore(button,add);else actions.appendChild(button);
      button.addEventListener('click',openTopics);
    }
    button.textContent=topics.length?`內容題庫（${topics.length}）`:'內容題庫';
  }
  async function loadTopics(){
    const settled=await Promise.allSettled(TOPIC_SOURCES.map(async source=>{
      const response=await fetch(source.url,{cache:'no-store'});if(!response.ok)throw new Error(`${source.label} HTTP ${response.status}`);
      const data=await response.json(),order=new Map((data?.defaultMixedOrder||[]).map((id,index)=>[id,index]));
      return (Array.isArray(data?.topics)?data.topics:[]).map((topic,index)=>({...topic,__sourceLabel:source.label,__sourcePriority:source.priority,__sourceIndex:index,__mixedRank:order.has(topic.id)?order.get(topic.id):5000+index}));
    }));
    topics=settled.flatMap(result=>result.status==='fulfilled'?result.value:[]);
    settled.filter(result=>result.status==='rejected').forEach(result=>console.warn('內容題庫載入失敗',result.reason));
    installButton();
  }
  function enhance(){installButton();waitForForm();}
  document.addEventListener('click',event=>{if(event.target.closest('[data-add-post],[data-post-edit]'))setTimeout(()=>waitForForm(),80)},true);
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{loadTopics();enhance()},{once:true});else{loadTopics();enhance()}
  window.XJWPublishingContentGuidance=Object.freeze({version:VERSION,scan,currentTopicMedia,topicTiming,sortedTopics,get topics(){return topics}});
})();