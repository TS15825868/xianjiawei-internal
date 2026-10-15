(()=>{
  const labels={scheduled:'已送入Metricool',pending_review:'待審核',awaiting_work:'待送入排程',blocked_context:'待核對節慶日期',awaiting_verification:'待查證發布結果',cancel_required:'需處理外部排程',expired:'未送出且已過期',failed:'失敗，需查原因',unknown:'結果不明，禁止重建',published:'已查證發布'};
  let loaded=false;
  async function load(){
    if(loaded)return;loaded=true;
    const box=document.createElement('section');box.id='metricoolFreeStatus';box.className='xjw-warning';box.style.cssText='margin:16px;padding:16px;max-width:100%;overflow-wrap:anywhere';
    const title=document.createElement('strong');title.textContent='免費排程與發布紀錄';box.append(title);
    const note=document.createElement('p');note.textContent='AI 預審後仍須使用者人工核准，才可由 Work 送入排程。Metricool每月20次發布，三平台各計一次；結果未查證時不標記成功。';box.append(note);
    (document.querySelector('main')||document.body).append(box);
    const button=document.createElement('button');button.type='button';button.className='btn';button.textContent='重新讀取狀態';box.append(button);
    const list=document.createElement('div');list.setAttribute('aria-live','polite');box.append(list);
    async function refresh(){button.disabled=true;try{const r=await fetch('/api/metricool-sync',{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('請先登入貼文中心再查詢');const data=await r.json();list.replaceChildren();for(const p of data.posts||[]){const item=document.createElement('p');item.textContent=`${p.title||p.post_id}｜${labels[p.state]||p.state}｜${p.publication_at?new Date(p.publication_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'未選時段'}${p.last_error?'｜'+p.last_error:''}`;list.append(item)}if(!data.posts?.length)list.textContent='目前沒有外部排程紀錄。'}catch(e){list.textContent=e.message}finally{button.disabled=false}}
    button.addEventListener('click',refresh);await refresh();
  }
  document.addEventListener('xjw-publishing-list-rendered',load,{once:true});
})();
