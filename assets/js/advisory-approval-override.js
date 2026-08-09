(()=>{
  const APPROVE='[data-post-status="approved"]';
  function apply(){
    document.querySelectorAll(APPROVE).forEach(button=>{
      button.dataset.serverApprovalOverride='disabled';
      if(button.disabled){
        button.title='此篇目前有缺圖、圖文不匹配、規格錯誤或圖片品質問題；修正後才能審核通過。';
      }else{
        button.title='按下後仍會由伺服器再次檢查文案、圖片、產品規格、圖文匹配與圖片品質。';
      }
    });
  }
  const root=document.getElementById('app');
  if(root)new MutationObserver(apply).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
  window.XJWApprovalPolicy=Object.freeze({version:'2026-08-09-strict-copy-image-gate-v1',unlockDisabledButtons:false,serverRecheckRequired:true});
})();
