(()=>{
  function add(){
    const nav=document.getElementById('sideNav');if(!nav||nav.querySelector('[data-brand-control-link]'))return;
    const a=document.createElement('a');a.href='/brand-control.html';a.dataset.brandControlLink='1';a.innerHTML='<span class="nav-icon">✦</span><span>AI品牌中控</span>';nav.appendChild(a);
    const dock=document.getElementById('mobileDock');if(dock&&!dock.querySelector('[data-brand-control-mobile]')){const b=document.createElement('a');b.href='/brand-control.html';b.dataset.brandControlMobile='1';b.innerHTML='<span class="dock-icon">✦</span>AI中控';dock.appendChild(b)}
  }
  new MutationObserver(add).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
})();
