(()=>{
  const A=window.XJWAcquisitionIntelligence={
    version:'2026-09-16-v1',
    stages:{new:'新名單',contacted:'已接觸',interested:'有興趣',trial:'試喝／體驗',negotiating:'洽談中',won:'已成交',dormant:'暫緩',lost:'不適合'},
    active:new Set(['new','contacted','interested','trial','negotiating','dormant']),
    types:{B2B:'B2B通路',B2C:'一般顧客',partner:'合作夥伴'},
    sources:{walkin:'來店',referral:'介紹',facebook:'Facebook',instagram:'Instagram',threads:'Threads',website:'官網',line:'LINE OA',visit:'拜訪',event:'活動',other:'其他'},
    channels:{line:'LINE OA',phone:'電話',visit:'到店／拜訪',facebook:'Facebook',instagram:'Instagram',email:'Email',other:'其他'},
    permissions:{existing:'既有往來／公開B2B窗口',granted:'已同意聯繫',pending:'待確認',do_not_contact:'請勿聯繫'}
  };
  A.due=value=>{const d=value?new Date(value):null;return Boolean(d&&!Number.isNaN(d.valueOf())&&d<=new Date())};
  A.label=(map,value,fallback='未設定')=>map[value]||value||fallback;
  A.options=(map,current='',blank='請選擇')=>`<option value="">${blank}</option>${Object.entries(map).map(([v,l])=>`<option value="${esc(v)}" ${String(current)===v?'selected':''}>${esc(l)}</option>`).join('')}`;
  if(!NAV.some(([id])=>id==='acquisition')){
    const index=Math.max(0,NAV.findIndex(([id])=>id==='customers'));
    NAV.splice(index,0,['acquisition','獲客追蹤','◎']);
  }
  TITLES.acquisition='獲客追蹤';
  const originalModulePage=modulePage;
  modulePage=async module=>module==='acquisition'&&typeof A.page==='function'?A.page():originalModulePage(module);
  const originalQuickMenu=openQuickMenu;
  openQuickMenu=function(){
    originalQuickMenu();
    const grid=document.querySelector('.xjw-quick-grid');
    if(grid&&!grid.querySelector('[href="#acquisition"]')){
      const link=document.createElement('a');link.href='#acquisition';link.dataset.closeModal='';link.innerHTML='<span>◎</span>獲客追蹤';grid.prepend(link);
    }
  };
  setTimeout(()=>{try{nav();if(location.hash==='#acquisition')render();}catch(error){console.warn('acquisition init failed',error)}},0);
})();
