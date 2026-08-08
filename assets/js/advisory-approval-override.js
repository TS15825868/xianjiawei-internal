(()=>{
  const APPROVE='[data-post-status="approved"]';
  function toast(message,error=false){
    const root=document.getElementById('toastRoot');
    if(!root){alert(message);return}
    const node=document.createElement('div');node.className=`toast ${error?'error':''}`;node.textContent=message;root.appendChild(node);setTimeout(()=>node.remove(),4200);
  }
  function unlockAuditButtons(){
    document.querySelectorAll(APPROVE).forEach(button=>{
      if(button.dataset.serverApprovalOverride==='1')return;
      button.dataset.serverApprovalOverride='1';
      button.disabled=false;
      button.removeAttribute('disabled');
      button.title='AI圖文檢查目前為提示模式；按下後仍會由伺服器檢查基本完整性（文案、圖片、平台與解析度）。';
    });
  }
  async function approve(id){
    if(!id)return;
    try{
      const response=await fetch(`/api/posts/${encodeURIComponent(id)}/status`,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'content-type':'application/json'},body:JSON.stringify({status:'approved'})
      });
      const text=await response.text();let data={};try{data=text?JSON.parse(text):{};}catch{}
      if(!response.ok)throw new Error(data?.error||`審核失敗（HTTP ${response.status}）`);
      toast('已由人工確認審核通過；AI圖文守門維持提示模式。');
      setTimeout(()=>location.reload(),450);
    }catch(error){toast(error?.message||'審核失敗',true)}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest?.(APPROVE);if(!button)return;
    event.preventDefault();event.stopImmediatePropagation();
    approve(button.dataset.id||button.closest('.xjw-row')?.querySelector('[data-post-view]')?.dataset.postView||'');
  },true);
  const root=document.getElementById('app');
  if(root)new MutationObserver(unlockAuditButtons).observe(root,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',unlockAuditButtons);
  setTimeout(unlockAuditButtons,600);
})();
