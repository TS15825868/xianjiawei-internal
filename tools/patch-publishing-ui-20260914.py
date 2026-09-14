from pathlib import Path


def replace_once(text, old, new, label):
    count = text.count(old)
    if count < 1:
        raise SystemExit(f'missing marker {label}: {old[:120]!r}')
    return text.replace(old, new, 1)


p = Path('assets/js/publishing-app-v2.js')
s = p.read_text()

s = replace_once(
    s,
    "const state={me:null,items:[],total:0,counts:{},filter:'',status:'all',loading:false,platforms:null,loadId:0};",
    "const state={me:null,items:[],total:0,counts:{},filter:'',status:'all',loading:false,platforms:null,loadId:0,maintenanceReadonly:false};",
    'state maintenance flag',
)
s = replace_once(
    s,
    "    if(![2,6].includes(local.getDay()))continue;\n    local.setHours(local.getDay()===2?19:9,30,0,0);",
    "    if(![1,3,5].includes(local.getDay()))continue;\n    local.setHours(9,0,0,0);",
    'formal schedule days',
)

maintenance_helper = """function applyMaintenanceMode(){
  const readonly=Boolean(state.maintenanceReadonly);
  document.documentElement.dataset.maintenanceReadonly=readonly?'true':'false';
  const add=$('[data-add-post]');
  if(add){
    add.disabled=readonly;
    add.setAttribute('aria-disabled',readonly?'true':'false');
    add.title=readonly?'系統整理期間暫停新增；驗證恢復後會重新開放。':'';
  }
  if(readonly){
    const user=$('#userState');
    if(user)user.textContent='系統整理模式（唯讀）';
  }
}

"""
s = replace_once(s, 'function audit(post){', maintenance_helper + 'function audit(post){', 'maintenance helper')
s = replace_once(s, "  const locked=post.status==='published';", "  const locked=post.status==='published';\n  const readOnly=state.maintenanceReadonly;", 'card readonly state')
s = replace_once(s, "${!locked?`<button class=\"btn small orange\" data-post-edit=\"${esc(post.id)}\">重新編輯</button>`:''}", "${!readOnly&&!locked?`<button class=\"btn small orange\" data-post-edit=\"${esc(post.id)}\">重新編輯</button>`:''}", 'edit button')
s = replace_once(s, "${post.status==='draft'?`<button class=\"btn small green\" data-post-status=\"pending_review\" data-id=\"${esc(post.id)}\" ${a.level==='danger'?'disabled':''}>送待審核</button>`:''}", "${!readOnly&&post.status==='draft'?`<button class=\"btn small green\" data-post-status=\"pending_review\" data-id=\"${esc(post.id)}\" ${a.level==='danger'?'disabled':''}>送待審核</button>`:''}", 'draft action')
s = replace_once(s, "${post.status==='pending_review'?`<button class=\"btn small green\" data-post-status=\"approved\" data-id=\"${esc(post.id)}\" ${a.level==='danger'?'disabled':''}>16項審核通過</button><button class=\"btn small\" data-post-status=\"draft\" data-id=\"${esc(post.id)}\">退回草稿</button>`:''}", "${!readOnly&&post.status==='pending_review'?`<button class=\"btn small green\" data-post-status=\"approved\" data-id=\"${esc(post.id)}\" ${a.level==='danger'?'disabled':''}>16項審核通過</button><button class=\"btn small\" data-post-status=\"draft\" data-id=\"${esc(post.id)}\">退回草稿</button>`:''}", 'review action')
s = replace_once(s, "${post.status==='approved'?`<button class=\"btn small orange\" data-post-schedule=\"${esc(post.id)}\">安排時間</button><button class=\"btn small green\" data-post-publish-now=\"${esc(post.id)}\">立即發布</button>`:''}", "${!readOnly&&post.status==='approved'?`<button class=\"btn small orange\" data-post-schedule=\"${esc(post.id)}\">安排時間</button><button class=\"btn small green\" data-post-publish-now=\"${esc(post.id)}\">立即發布</button>`:''}", 'approved action')
s = replace_once(s, "${post.status==='scheduled'?`<button class=\"btn small orange\" data-post-schedule=\"${esc(post.id)}\">修改時間</button><button class=\"btn small\" data-post-status=\"draft\" data-id=\"${esc(post.id)}\">取消排程</button><button class=\"btn small green\" data-post-publish-now=\"${esc(post.id)}\">立即發布</button>`:''}", "${!readOnly&&post.status==='scheduled'?`<button class=\"btn small orange\" data-post-schedule=\"${esc(post.id)}\">修改時間</button><button class=\"btn small\" data-post-status=\"draft\" data-id=\"${esc(post.id)}\">取消排程</button><button class=\"btn small green\" data-post-publish-now=\"${esc(post.id)}\">立即發布</button>`:''}", 'scheduled action')

s = replace_once(
    s,
    "function renderList(){\n  const root=$('#listRoot');\n  if(!root)return;\n  const remaining=Math.max(0,state.total-state.items.length);",
    "function renderList(){\n  const root=$('#listRoot');\n  if(!root)return;\n  const signature=JSON.stringify([state.status,state.filter,state.total,state.items.map(p=>[p.id,p.updated_at,p.status,p.image_url])]);\n  if(root.dataset.renderSignature===signature){renderMetrics();return;}\n  root.dataset.renderSignature=signature;\n  const remaining=Math.max(0,state.total-state.items.length);",
    'stable render signature',
)
s = replace_once(s, "    const data=await api(queryPath(offset),{timeout:18000});", "    const data=await api(queryPath(offset),{timeout:10000});", 'post list timeout')
s = replace_once(s, "    const batch=Array.isArray(data)?data:(data?.items||[]);", "    if(data?.maintenance_readonly||data?.maintenance_no_login){state.maintenanceReadonly=true;applyMaintenanceMode();}\n    const batch=Array.isArray(data)?data:(data?.items||[]);", 'maintenance flag from list')
s = replace_once(s, "function openPostForm(post=null){\n  const edit=!!post;", "function openPostForm(post=null){\n  if(state.maintenanceReadonly){toast('系統整理期間為唯讀模式；新增與修改暫時鎖定。',true);return;}\n  const edit=!!post;", 'post form guard')
s = replace_once(s, "${p.status==='manual_required'?`<div class=\"xjw-warning\">有平台需要人工發布。請使用卡片上的「手動發布包」，完成後再補登已發布。</div><div class=\"xjw-modal-footer\"><button class=\"btn green\" data-post-status=\"published\" data-id=\"${esc(p.id)}\">手動補登已發布</button></div>`:''}", "${!state.maintenanceReadonly&&p.status==='manual_required'?`<div class=\"xjw-warning\">有平台需要人工發布。請使用卡片上的「手動發布包」，完成後再補登已發布。</div><div class=\"xjw-modal-footer\"><button class=\"btn green\" data-post-status=\"published\" data-id=\"${esc(p.id)}\">手動補登已發布</button></div>`:''}", 'manual publish guard')
s = replace_once(s, "function openSchedule(post){\n  const suggested=post.scheduled_at||post.proposed_scheduled_at||nextSlot();", "function openSchedule(post){\n  if(state.maintenanceReadonly){toast('系統整理期間為唯讀模式；排程暫時鎖定。',true);return;}\n  const suggested=post.scheduled_at||post.proposed_scheduled_at||nextSlot();", 'schedule guard')
s = replace_once(s, "固定時段為週二19:30、週六09:30；也可自行修改。立即發布不受固定時段限制，但仍必須維持目前16項圖文核准有效。", "固定時段為週一／週三／週五 09:00（台灣時間）；也可自行修改。立即發布不受固定時段限制，但仍必須維持目前16項圖文核准有效。", 'schedule copy')
s = replace_once(s, "async function changeStatus(id,status,button){\n  const done=setButtonBusy(button,'更新中…');", "async function changeStatus(id,status,button){\n  if(state.maintenanceReadonly){toast('系統整理期間為唯讀模式；狀態變更暫時鎖定。',true);return;}\n  const done=setButtonBusy(button,'更新中…');", 'status guard')
s = replace_once(s, "async function publishNow(id,button){\n  if(!confirm('確認要立即發布這篇貼文？系統只會發布到已完成授權的平台，其他平台會轉為人工發布。'))return;", "async function publishNow(id,button){\n  if(state.maintenanceReadonly){toast('系統整理期間為唯讀模式；立即發布暫時鎖定。',true);return;}\n  if(!confirm('確認要立即發布這篇貼文？系統只會發布到已完成授權的平台，其他平台會轉為人工發布。'))return;", 'publish guard')
s = replace_once(s, "    state.me=await api('/me',{timeout:12000});\n    $('#userState').textContent=state.me?.display_name||state.me?.email||'已登入';", "    state.me=await api('/me',{timeout:8000});\n    state.maintenanceReadonly=Boolean(state.me?.maintenance_readonly||state.me?.maintenance_no_login);\n    applyMaintenanceMode();\n    $('#userState').textContent=state.maintenanceReadonly?'系統整理模式（唯讀）':(state.me?.display_name||state.me?.email||'已登入');", 'profile maintenance state')
p.write_text(s)

p = Path('assets/js/publishing-review-gate.js')
s = p.read_text()
old = """  let auditRun=0;
  async function auditVisible(){
    const run=++auditRun;
    const ids=[...document.querySelectorAll('.publish-card [data-post-view],.xjw-row [data-post-view]')].map(node=>node.dataset.postView).filter(Boolean);
    if(!ids.length)return;
    try{
      const [visibleResult,allResult]=await Promise.all([auditIds(ids),api('/posts/content-audit?all=1',{timeout:20000})]);"""
new = """  let auditRun=0;
  let auditTimer=null;
  let lastAuditSignature='';
  let lastAuditAt=0;
  let fullAuditCache={at:0,result:null};
  const maintenanceReadonly=()=>document.documentElement.dataset.maintenanceReadonly==='true';
  async function fullAudit(){
    if(fullAuditCache.result&&Date.now()-fullAuditCache.at<60000)return fullAuditCache.result;
    const result=await api('/posts/content-audit?all=1',{timeout:12000});
    fullAuditCache={at:Date.now(),result};
    return result;
  }
  function scheduleAudit(delay=160){clearTimeout(auditTimer);auditTimer=setTimeout(auditVisible,delay)}
  async function auditVisible(){
    if(maintenanceReadonly())return;
    const run=++auditRun;
    const cards=[...document.querySelectorAll('.publish-card,.xjw-row')];
    const ids=cards.map(card=>card.querySelector('[data-post-view]')?.dataset?.postView||'').filter(Boolean);
    if(!ids.length)return;
    const signature=cards.map(card=>[card.querySelector('[data-post-view]')?.dataset?.postView||'',card.dataset.status||'',card.querySelector('.xjw-copy')?.textContent||'',card.querySelector('img')?.getAttribute('src')||''].join('|')).join('||');
    if(signature===lastAuditSignature&&Date.now()-lastAuditAt<60000)return;
    try{
      const [visibleResult,allResult]=await Promise.all([auditIds(ids),fullAudit()]);
      lastAuditSignature=signature;lastAuditAt=Date.now();"""
s = replace_once(s, old, new, 'review audit cache')
s = replace_once(s, "  window.addEventListener('xjw-publishing-list-rendered',()=>setTimeout(auditVisible,40));", "  window.addEventListener('xjw-publishing-list-rendered',()=>scheduleAudit(160));", 'review render debounce')
s = replace_once(s, "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhance();setTimeout(auditVisible,250)},{once:true});else{enhance();setTimeout(auditVisible,250)}", "  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhance();scheduleAudit(300)},{once:true});else{enhance();scheduleAudit(300)}", 'review boot debounce')
p.write_text(s)

print('publishing UI patch ready')
