(()=>{
  function add(){
    const nav=document.getElementById('sideNav');if(!nav||nav.querySelector('[data-brand-control-link]'))return;
    const a=document.createElement('a');a.href='/brand-control.html';a.dataset.brandControlLink='1';a.innerHTML='<span class="nav-icon">✦</span><span>AI品牌中控</span>';nav.appendChild(a);
  }
  new MutationObserver(add).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
})();
