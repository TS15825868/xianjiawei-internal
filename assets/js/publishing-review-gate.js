(()=>{
  const VERSION='20261027-fixed-mascot-identity-human-review-v7';
  const CHECKS=[
    ['brand','品牌與整體風格','符合仙加味正式品牌風格，沒有錯誤Logo／不合品牌元素'],
    ['product','產品','文案提到的產品與圖片中的產品完全一致'],
    ['specification','規格','產品容量、重量、包裝、數量與正式規格一致'],
    ['pricing_activity','價格／活動','若圖文出現價格、試喝或活動，內容與目前正式方案一致'],
    ['season','季節','圖片季節與文案一致；文案未指定時不亂加明顯季節'],
    ['weather','天氣','圖片天氣與文案一致；即時天氣貼文發布前會再確認'],
    ['occasion','場合','節慶、工作、居家、外出等場合與文案一致'],
    ['location','地點','萬華、門市、室內外等地點與文案一致'],
    ['scene_environment','情境／環境','背景、道具、料理或使用情境符合文案'],
    ['temperature','冷熱','溫熱、常溫、冷飲等呈現沒有與文案相反'],
    ['expression','表情','小老闆與角色表情符合貼文語氣'],
    ['action','動作','小老闆與角色動作真的對應文案，不是隨機姿勢'],
    ['mascot_companions','小老闆／夥伴','須實際核對使用者核准的正式角色原圖：小老闆必須是同一張Q版小朋友的臉、眼型、短黑髮、頭身比例、米白中式上衣、深橄欖綠圍裙、紅色直式仙加味印章；小鹿與小烏龜各自固定造型、大小比例與同框左右，不可變不同角色。若缺正式參考圖或看起來像不同人，這項不得勾選。'],
    ['physical_scale','產品比例尺寸','產品只等比例縮放；30cc、100g罐、180cc鋁袋與其他產品不得亂改大小比例'],
    ['duplicate','完整成圖／非拼湊／不重複','整張圖是單一完整設計，不是多張海報、卡片、角色裁片或產品圖塊拼湊；不同主題不得反覆使用同一張泛用圖'],
    ['compliance_final','法規與最終確認','沒有療效宣稱、錯字、錯規格、錯資訊，整張圖可正式對外'],
  ];
  const esc=(v='')=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function toast(message,error=false){const root=document.getElementById('toastRoot');if(!root){if(error)alert(message);return}const n=document.createElement('div');n.className=`toast ${error?'error':''}`;n.textContent=message;root.appendChild(n);setTimeout(()=>n.remove(),4500)}
  async function api(path,options={}){
    const {timeout=15000,...requestOptions}=options;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeout);
    try{
      const response=await fetch(`/api${path}`,{credentials:'same-origin',cache:'no-store',...requestOptions,signal:controller.signal,headers:{...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})}});
      const text=await response.text();let data={};try{data=text?JSON.parse(text):{}}catch{throw new Error(`伺服器未回傳有效JSON（HTTP ${response.status}；${(response.headers.get('content-type')||'未標示內容類型').split(';')[0]}）。尚未取得成功回執，請先讀回審核紀錄，勿直接重送。`)}
      if(!response.ok){const details=Array.isArray(data.details)&&data.details.length?`：${data.details.join('；')}`:'';throw new Error((data.error||data.detail||data.message||`HTTP ${response.status}`)+details)}
      return data;
    }catch(error){if(error.name==='AbortError')throw new Error('圖文檢查連線逾時，請重新檢查');throw error}finally{clearTimeout(timer)}
  }
  function validateAudit(result,ids){
    if(!result||!Array.isArray(result.items)||!Number.isInteger(result.total)||result.total!==result.items.length||!Number.isInteger(result.problem_count))throw new Error('圖文檢查結果不完整，請重新檢查');
    const found=new Set();
    for(const item of result.items){if(!item||typeof item.id!=='string'||found.has(item.id)||typeof item.ok!=='boolean'||!Array.isArray(item.errors)||(item.ok&&item.errors.length))throw new Error('圖文檢查結果不完整，請重新檢查');found.add(item.id)}
    if(result.problem_count!==result.items.filter(item=>!item.ok).length||ids.some(id=>!found.has(id)))throw new Error('圖文檢查結果不完整，請重新檢查');
    return result;
  }
  function cardId(button){return button?.dataset?.id||button?.closest('.publish-card,.xjw-row')?.querySelector('[data-post-view]')?.dataset?.postView||''}
  function cardFor(id){return [...document.querySelectorAll('.publish-card,.xjw-row')].find(card=>card.querySelector('[data-post-view]')?.dataset?.postView===id)||null}
  function auditBox(card){return card?.querySelector('.xjw-danger,.xjw-warning,.xjw-ok')||null}
  function auditSummary(problem,total){
    const root=document.getElementById('readinessSummary');if(!root)return;
    let chip=root.querySelector('[data-content-audit-summary]');if(!chip){chip=document.createElement('span');chip.dataset.contentAuditSummary='1';root.appendChild(chip)}
    chip.className=`readiness-chip ${problem?'bad':'ok'}`;
    chip.innerHTML=`<strong>全庫圖文完整檢查</strong><small>${problem?`${problem}／${total} 篇需修正`:`${total} 篇自動檢查通過`}</small>`;
  }
  function applyAudit(item){
    const card=cardFor(item.id);if(!card)return;
    const errors=Array.isArray(item.errors)?item.errors:[];
    card.dataset.contentAudit=item.ok?'ok':'blocked';
    const externalHold=item.publication_reconciliation_required===true;
    card.dataset.externalPublishedHold=externalHold?'1':'0';
    // Never offer generation/re-submission actions for a D1 row whose
    // same publication already has public platform receipts.
    if(externalHold){
      card.querySelectorAll('[data-xjw-regenerate],[data-xjw-regeneration-return],[data-ai-evidence],[data-original-review]').forEach(button=>button.remove());
    }
    const box=auditBox(card);
    if(box){
      box.className=item.ok?'xjw-ok':'xjw-danger';
      box.innerHTML=item.ok?'<strong>圖文完整檢查（不會發布）</strong><br>產品、重複圖、季節／天氣與明確情境自動預檢通過；仍須取得完整16項 AI 審核證據或人工核准。':`<strong>圖文完整檢查未通過（不會發布）</strong><br>${errors.map(esc).join('；')}`;
    }
    card.querySelectorAll('[data-post-status="pending_review"],[data-post-status="approved"],[data-post-schedule],[data-post-publish-now]').forEach(button=>{
      if(item.ok){
        if(button.dataset.contentAuditDisabled==='1'){
          button.disabled=Boolean(button.dataset.xjwSafetyDisabled||button.dataset.xjwPlatformDisabled||button.dataset.xjwOfflineDisabled);
          button.title=button.dataset.contentAuditOriginalTitle||'';
          delete button.dataset.contentAuditDisabled;
          delete button.dataset.contentAuditOriginalTitle;
        }
        return;
      }
      if(button.dataset.contentAuditDisabled!=='1'){
        button.dataset.contentAuditDisabled='1';
        button.dataset.contentAuditOriginalTitle=button.title||'';
      }
      button.disabled=true;
      if(button.dataset.contentAuditDisabled==='1')button.title='圖文完整檢查未通過：'+errors.join('；');
    });
  }
  async function auditIds(ids){
    const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return{items:[],problem_count:0,total:0};
    return validateAudit(await api(`/posts/content-audit?ids=${encodeURIComponent(unique.join(','))}`,{timeout:15000}),unique);
  }
  let auditRun=0;
  let auditTimer=null;
  let lastAuditSignature='';
  let lastAuditAt=0;
  let fullAuditCache={at:0,result:null};
  const maintenanceReadonly=()=>document.documentElement.dataset.maintenanceReadonly==='true';
  async function fullAudit(){
    if(fullAuditCache.result&&Date.now()-fullAuditCache.at<60000)return fullAuditCache.result;
    const result=validateAudit(await api('/posts/content-audit?all=1',{timeout:12000}),[]);
    fullAuditCache={at:Date.now(),result};
    return result;
  }
  function scheduleAudit(delay=160){clearTimeout(auditTimer);auditTimer=setTimeout(auditVisible,delay)}
  function rootRemoveAuditError(){document.querySelector('[data-content-audit-error]')?.remove()}
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
      lastAuditSignature=signature;lastAuditAt=Date.now();
      if(run!==auditRun)return;
      rootRemoveAuditError();
      (visibleResult.items||[]).forEach(applyAudit);
      auditSummary(Number(allResult.problem_count||0),Number(allResult.total||0));
    }catch(error){
      if(run!==auditRun)return;
      console.warn('全庫圖文完整檢查暫時無法載入',error);
      lastAuditSignature='';lastAuditAt=0;fullAuditCache={at:0,result:null};
      auditSummary(1,Math.max(cards.length,1));
      const root=document.getElementById('readinessSummary');
      let warning=root?.querySelector('[data-content-audit-error]');
      if(root&&!warning){warning=document.createElement('span');warning.dataset.contentAuditError='1';warning.className='readiness-chip bad';root.appendChild(warning)}
      if(warning)warning.textContent='圖文檢查暫時無法完成，請重新整理後再審核或發布';
      cards.forEach(card=>{
        card.dataset.contentAudit='blocked';
        card.querySelectorAll('[data-post-status="pending_review"],[data-post-status="approved"],[data-post-schedule],[data-post-publish-now]').forEach(button=>{
          if(button.dataset.contentAuditDisabled!=='1'){button.dataset.contentAuditDisabled='1';button.dataset.contentAuditOriginalTitle=button.title||''}button.disabled=true;
          button.title='圖文檢查尚未完成，請重新整理後重試';
        });
      });
    }
  }
  async function submitForReview(button){
    const id=cardId(button);if(!id){toast('找不到貼文ID，請重新整理',true);return}
    button.disabled=true;const old=button.textContent;button.textContent='送審中…';
    try{
      await api(`/posts/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status:'pending_review'})});
      toast('已送待審核；接下來請完成人工16項圖文審核。');
      document.querySelector('[data-refresh]')?.click();
    }catch(error){button.disabled=false;button.textContent=old;toast(error.message||String(error),true)}
  }
  function render(post){
    const root=document.getElementById('modalRoot');if(!root)return;
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-review-close></div><div class="xjw-modal-card publishing-review-card"><h2>16項完整圖文審核</h2><p class="muted">這次核准會綁定目前這份文案與圖片。之後只要文案或圖片修改，核准會自動失效，必須重新檢查。</p><div class="publishing-review-preview"><div><strong>${esc(post.title||'未命名貼文')}</strong><div class="publishing-review-copy">${esc(post.copy||post.headline||'尚無文案')}</div></div>${post.image_url?`<img src="${esc(post.image_url)}" alt="${esc(post.image_alt||post.title||'貼文候選圖')}" loading="eager" decoding="async">`:'<div class="xjw-danger">缺少圖片</div>'}</div><div class="publishing-review-checks">${CHECKS.map(([id,label,help])=>`<label class="publishing-review-check"><input type="checkbox" data-review-check="${id}"><span><strong>${label}</strong><small>${help}</small></span></label>`).join('')}</div><label class="publishing-review-match"><input type="checkbox" id="copyImageMatch"><span><strong>最終確認：文案與圖片一致</strong><small>產品、情境、季節、環境、冷熱、表情、動作、產品比例、重複圖片與完整視覺都已逐項比對。</small></span></label><div class="xjw-modal-footer"><button type="button" class="btn" data-review-close>取消</button><button type="button" class="btn green" id="reviewApprove" disabled>完成審核並核准</button></div></div></div>`;
    const boxes=[...root.querySelectorAll('[data-review-check]')],match=root.querySelector('#copyImageMatch'),approve=root.querySelector('#reviewApprove');
    const refresh=()=>{approve.disabled=!(boxes.every(box=>box.checked)&&match.checked&&post.image_url)};
    boxes.forEach(box=>box.addEventListener('change',refresh));match.addEventListener('change',refresh);
    root.querySelectorAll('[data-review-close]').forEach(node=>node.addEventListener('click',()=>{root.innerHTML=''}));
    approve.addEventListener('click',async()=>{approve.disabled=true;const old=approve.textContent;approve.textContent='審核送出中…';try{const checklist=Object.fromEntries(boxes.map(box=>[box.dataset.reviewCheck,box.checked]));await api(`/posts/${encodeURIComponent(post.id)}/status`,{method:'POST',body:JSON.stringify({status:'approved',review_checklist:checklist,copy_image_match:match.checked})});root.innerHTML='';toast('16項圖文審核完成，貼文已核准');document.querySelector('[data-refresh]')?.click()}catch(error){approve.disabled=false;approve.textContent=old;toast(error.message||String(error),true)}});
  }
  async function openReview(button){
    const id=cardId(button);if(!id){toast('找不到貼文ID，請重新整理',true);return}
    button.disabled=true;const old=button.textContent;button.textContent='載入審核…';
    try{
      const audit=await auditIds([id]);const item=(audit.items||[])[0];if(item&&!item.ok)throw new Error('圖文完整檢查未通過：'+(item.errors||[]).join('；'));
      const post=await api(`/posts/${encodeURIComponent(id)}`);render(post)
    }catch(error){toast(error.message||String(error),true)}finally{button.disabled=false;button.textContent=old}
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-post-prepare-human-review]');
    if(!button||button.disabled)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const id=button.dataset.postPrepareHumanReview;
    button.disabled=true;const label=button.textContent;button.textContent='準備人工審核…';
    api('/posts/'+encodeURIComponent(id)+'/prepare-human-review',{method:'POST'})
      .then(()=>{toast('原文案和圖片保留，已準備16項人工圖文審核。');document.querySelector('[data-refresh]')?.click()})
      .catch(error=>{button.disabled=false;button.textContent=label;toast(error.message||String(error),true)});
  },true);
  document.addEventListener('click',event=>{
    const submit=event.target.closest('[data-post-status="pending_review"]');
    if(submit&&!submit.disabled){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();submitForReview(submit);return}
    const button=event.target.closest('[data-post-status="approved"]');
    if(!button||button.disabled)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openReview(button);
  },true);
  // Keep AI evidence submission separate from human checklist attestations.
  async function openAiEvidence(button){
    const id=cardId(button),root=document.getElementById('modalRoot');
    if(!id||!root||maintenanceReadonly())return;
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-ai-close></div><div class="xjw-modal-card"><h2>提交16項 AI 審核證據</h2><p>僅接受已逐項看圖完成的證據。伺服器會重新核對目前圖文、圖片雜湊、原始回執與權限；提交證據不等於正式排程或發布。</p><label for="aiReviewEvidence">審核證據 JSON</label><textarea id="aiReviewEvidence" rows="16" style="width:100%;box-sizing:border-box;max-width:100%" spellcheck="false"></textarea><p id="aiReviewResult" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere"></p><div class="xjw-modal-footer"><button class="btn" type="button" data-ai-close>關閉</button><button class="btn primary" type="button" data-ai-submit>提交 AI 證據</button></div></div></div>`;
    root.querySelectorAll('[data-ai-close]').forEach(b=>b.addEventListener('click',()=>{root.innerHTML=''}));
    const contextBox=document.createElement('details');
    const contextTitle=document.createElement('summary');contextTitle.textContent='目前圖文版本與既有審核證據（唯讀）';
    const contextText=document.createElement('pre');contextText.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto';contextText.textContent='讀取既有證據中…';
    contextBox.append(contextTitle,contextText);root.querySelector('#aiReviewEvidence').before(contextBox);
    // Never prefill PASS or submit an earlier version as a new review.
    api('/posts/'+encodeURIComponent(id)+'/ai-quality-review',{timeout:30000})
      .then(context=>{contextText.textContent=JSON.stringify(context,null,2)})
      .catch(error=>{contextText.textContent='既有證據讀取失敗：'+(error.message||String(error))});
    const submit=root.querySelector('[data-ai-submit]'),result=root.querySelector('#aiReviewResult');
    submit.addEventListener('click',async()=>{
      submit.disabled=true;result.textContent='正在驗證目前圖文及證據…';
      try{
        const proof=JSON.parse(root.querySelector('#aiReviewEvidence').value);
        if(proof.post_id!==id||proof.reviewer_type!=='AI')throw Error('證據必須屬於目前貼文，且 reviewer_type 必須是 AI');
        const response=await api('/posts/'+encodeURIComponent(id)+'/ai-quality-review',{method:'POST',body:JSON.stringify(proof),timeout:60000});
        result.textContent=JSON.stringify(response,null,2);
        // Preserve the receipt for inspection; refresh only the background list.
        document.querySelector('[data-refresh]')?.click();
      }catch(error){result.textContent=error.message||String(error)}
      finally{submit.disabled=false}
    });
  }
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-ai-evidence]');
    if(!button||button.disabled)return;
    event.preventDefault();event.stopPropagation();openAiEvidence(button);
  });
  async function openOriginalReview(button){
    const id=cardId(button),root=document.getElementById('modalRoot');if(!id||!root||maintenanceReadonly())return;
    button.disabled=true;
    try{
      const context=await api('/posts/'+encodeURIComponent(id)+'/image-visual-review');
      root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-original-close></div><div class="xjw-modal-card publishing-review-card"><h2>重新覆核原圖</h2><p>保留目前圖片網址。請實際比對正式參考圖並逐項填寫；通過只回待審核，不核准、不排程、不發布。</p><strong>${esc(context.title)}</strong><div class="publishing-review-copy">${esc(context.copy)}</div><img style="max-width:100%;max-height:60vh;object-fit:contain" src="${esc(context.image_url)}" alt="${esc(context.image_alt)}"><div class="publishing-review-checks">${CHECKS.map(([key,label,help])=>`<label><input type="checkbox" data-original-check="${key}">${esc(label)}：${esc(help)}</label>`).join('')}</div><label><input type="checkbox" data-original-match>文案與圖片一致</label><label>實際視覺證據（40–4000字）<textarea data-original-evidence rows="6" style="width:100%" maxlength="4000"></textarea></label><p data-original-result role="status"></p><div class="xjw-modal-footer"><button class="btn" data-original-close>關閉</button><button class="btn" data-original-defer>證據不足，待人工</button><button class="btn" data-original-reject>不合格，保留阻擋</button><button class="btn primary" data-original-pass>通過覆核，回待審核</button></div></div></div>`;
      root.querySelectorAll('[data-original-close]').forEach(b=>b.onclick=()=>{root.innerHTML=''});
      const save=async decision=>{
        const result=root.querySelector('[data-original-result]'),controls=[...root.querySelectorAll('[data-original-pass],[data-original-reject],[data-original-defer]')];controls.forEach(b=>b.disabled=true);
        try{
          const response=await api('/posts/'+encodeURIComponent(id)+'/image-visual-review',{method:'POST',body:JSON.stringify({decision,expected_fingerprint:context.expected_fingerprint,expected_updated_at:context.expected_updated_at,visual_evidence:root.querySelector('[data-original-evidence]').value,review_checklist:Object.fromEntries([...root.querySelectorAll('[data-original-check]')].map(b=>[b.dataset.originalCheck,b.checked])),copy_image_match:root.querySelector('[data-original-match]').checked})});
          fullAuditCache={at:0,result:null};lastAuditSignature='';lastAuditAt=0;
          const audit=await auditIds([id]);(audit.items||[]).forEach(applyAudit);scheduleAudit(0);
          result.textContent=response.message+'。重新預檢：'+((audit.items||[])[0]?.ok?'通過；仍待正式審核':((audit.items||[])[0]?.errors||[]).join('；'));
          // Refresh the background cards/counts while preserving this audit receipt.
          document.querySelector('[data-refresh]')?.click();
        }catch(error){result.textContent=error.message||String(error);controls.forEach(b=>b.disabled=false)}
      };
      root.querySelector('[data-original-defer]').onclick=()=>save('defer');
      root.querySelector('[data-original-pass]').onclick=()=>save('pass');root.querySelector('[data-original-reject]').onclick=()=>save('reject');
    }catch(error){toast(error.message||String(error),true)}finally{button.disabled=false}
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-original-review]');if(!button||button.disabled)return;event.preventDefault();openOriginalReview(button)});
  function openDeferralBatch(){
    const root=document.getElementById('modalRoot');if(!root||maintenanceReadonly())return;
    root.innerHTML=`<div class="xjw-modal"><div class="xjw-modal-bg" data-defer-close></div><div class="xjw-modal-card"><h2>批次記錄 defer 證據</h2><p>僅保存未確認事項；每篇仍由正式API驗證權限、16項證據及目前版本。不核准、不排程、不發布，任一失敗立即停止。</p><label for="aiDeferralBatch">批次 defer 證據 JSON</label><textarea id="aiDeferralBatch" rows="14" style="width:100%;box-sizing:border-box"></textarea><pre id="aiDeferralBatchResult" role="status" style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:35vh;overflow:auto"></pre><div class="xjw-modal-footer"><button class="btn" data-defer-close>關閉</button><button class="btn primary" data-defer-submit>保存 defer 證據</button></div></div></div>`;
    root.querySelectorAll('[data-defer-close]').forEach(b=>b.onclick=()=>{if(!root.querySelector('[data-defer-submit]').disabled)root.innerHTML=''});
    const submit=root.querySelector('[data-defer-submit]'),result=root.querySelector('#aiDeferralBatchResult');
    submit.onclick=async()=>{
      submit.disabled=true;const receipts=[];
      try{
        const proofs=JSON.parse(root.querySelector('#aiDeferralBatch').value);
        if(!Array.isArray(proofs)||!proofs.length||proofs.length>60||new Set(proofs.map(p=>p.post_id)).size!==proofs.length||proofs.some(p=>p.requested_decision!=='defer'||p.reviewer_type!=='AI'||!p.post_id))throw Error('僅接受1–60篇不同ID的AI defer證據');
        for(const proof of proofs){
          const response=await api('/posts/'+encodeURIComponent(proof.post_id)+'/ai-quality-review',{method:'POST',body:JSON.stringify(proof),timeout:60000});
          if(response.ok!==true||response.decision!=='NEEDS_HUMAN_REVIEW'||!response.review_id)throw Error('未取得有效defer成功回執，已停止');
          receipts.push({post_id:proof.post_id,...response});result.textContent=JSON.stringify({completed:receipts.length,total:proofs.length,receipts},null,2);
        }
        document.querySelector('[data-refresh]')?.click();
      }catch(error){result.textContent=JSON.stringify({completed:receipts.length,receipts,error:error.message||String(error),stopped:true},null,2)}
      finally{submit.disabled=false}
    };
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-ai-deferral-batch]');if(!button||button.disabled)return;event.preventDefault();openDeferralBatch()});
  function enhance(){
    const toolbar=document.querySelector('[data-refresh]')?.parentElement;
    if(toolbar&&!maintenanceReadonly()&&!toolbar.querySelector('[data-ai-deferral-batch]')){const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.aiDeferralBatch='1';b.textContent='批次記錄 defer 證據';toolbar.append(b)}
    if(!maintenanceReadonly())document.querySelectorAll('.publish-card[data-status="draft"],.publish-card[data-status="pending_review"]').forEach(card=>{
      if(card.dataset.externalPublishedHold==='1'||card.querySelector('[data-ai-evidence]'))return;
      const id=card.querySelector('[data-post-view]')?.dataset.postView,actions=card.querySelector('.xjw-actions');
      if(!id||!actions)return;
      const button=document.createElement('button');button.type='button';button.className='btn small';button.dataset.aiEvidence='1';button.dataset.id=id;button.textContent='提交 AI 審核證據';actions.append(button);
    });
    if(!maintenanceReadonly())document.querySelectorAll('.publish-card').forEach(card=>{
      if(!['draft', 'pending_review', 'approved'].includes(card.dataset.status)||card.dataset.externalPublishedHold==='1'||card.querySelector('[data-original-review]'))return;
      const id=card.querySelector('[data-post-view]')?.dataset.postView,actions=card.querySelector('.xjw-actions');if(!id||!actions)return;
      const button=document.createElement('button');button.type='button';button.className='btn small';button.dataset.originalReview='1';button.dataset.id=id;button.textContent='重新覆核原圖';actions.append(button);
    });
    document.querySelectorAll('.publish-card[data-status="draft"] [data-post-status="approved"]').forEach(button=>{
      button.dataset.postStatus='pending_review';delete button.dataset.reviewGateReady;button.textContent='送待審核';button.title='先送入待審核，再由人工完成16項圖文審核；草稿不能直接核准。';
    });
    document.querySelectorAll('.publish-card[data-status="pending_review"] [data-post-status="approved"]').forEach(button=>{
      if(button.dataset.reviewGateReady)return;button.dataset.reviewGateReady='1';button.textContent='16項審核通過';button.title='必須完成品牌、產品、規格、情境、季節、天氣、冷熱、表情、動作、產品比例、重複圖片、完整非拼湊視覺與圖文一致等檢查後才能核准。';
    });
  }
  document.addEventListener('xjw-publishing-list-rendered',()=>scheduleAudit(160));
  new MutationObserver(enhance).observe(document.documentElement,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{enhance();scheduleAudit(300)},{once:true});else{enhance();scheduleAudit(300)}
  window.XJWPublishingReviewGate=Object.freeze({version:VERSION,checks:CHECKS.map(item=>item[0]),draftToPendingReview:true,directDraftApproval:false,semanticAudit:true,duplicateImageAudit:true,fullLibraryAudit:true,strictUniqueImagePerPost:true});
})();
