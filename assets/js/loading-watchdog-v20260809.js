"use strict";

(function installXjwLoadingWatchdog(){
  if(window.__XJW_ROUTE_LOADING_WATCHDOG__) return;
  window.__XJW_ROUTE_LOADING_WATCHDOG__ = "20260809-v2";

  const TIMEOUT_MS = 10000;
  let timer = 0;
  let lastRoute = "";

  function app(){ return document.getElementById("app"); }
  function connection(){ return document.getElementById("connectionState"); }
  function isLoading(){ return Boolean(app()?.querySelector(".loading-card")); }
  function route(){ return (location.hash || "#dashboard").slice(1) || "dashboard"; }

  function clear(){
    if(timer){ clearTimeout(timer); timer = 0; }
  }

  function showTimeout(){
    if(!isLoading()) return;
    const root = app();
    if(!root) return;
    const current = route();
    const title = current === "posts" ? "貼文中心暫時沒有回應" : "資料暫時沒有回應";
    root.innerHTML = `
      <section class="card" style="padding:20px">
        <h2>${title}</h2>
        <p>已停止無限載入。可能是 Cloudflare D1、Access 或後端初始化尚未完成，請重新連線；原資料不會因這個畫面被刪除。</p>
        <div class="xjw-actions" style="margin-top:14px">
          <button class="btn primary" type="button" data-xjw-watchdog-retry>重新連線</button>
          <a class="btn" href="#dashboard">回營運總覽</a>
        </div>
      </section>`;
    const state = connection();
    if(state){ state.textContent = "回應逾時"; state.style.color = "#b42318"; }
    root.querySelector("[data-xjw-watchdog-retry]")?.addEventListener("click",()=>{
      const refresh = document.getElementById("refreshButton");
      if(refresh) refresh.click();
      else location.reload();
    });
  }

  function arm(){
    clear();
    if(!isLoading()) return;
    lastRoute = route();
    timer = window.setTimeout(()=>{
      if(lastRoute === route()) showTimeout();
    }, TIMEOUT_MS);
  }

  function observe(){
    const root = app();
    if(!root) return;
    const observer = new MutationObserver(()=>{
      if(isLoading()) arm();
      else clear();
    });
    observer.observe(root,{childList:true,subtree:true});
    if(isLoading()) arm();
  }

  window.addEventListener("hashchange",()=>setTimeout(arm,30));
  window.addEventListener("offline",()=>{
    if(!isLoading()) return;
    const root = app();
    if(root) root.innerHTML = '<section class="card" style="padding:20px"><h2>目前沒有網路連線</h2><p>網路恢復後請按「重新整理」。</p><button class="btn primary" type="button" onclick="location.reload()">重新整理</button></section>';
    clear();
  });

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded",observe,{once:true});
  else observe();
})();