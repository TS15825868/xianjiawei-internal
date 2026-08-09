import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const sync=read('assets/js/post-bank-sync.js');
const html=read('publishing.html');
const pkg=read('package.json');
const gate=read('src/publishing-review-gate-entry.js');

for(const token of [
  "post-bank-export.html",
  "20260810-export-v2-true-originals",
  "xjw-post-bank-export-v1",
  "PRODUCT_IMAGE_VERSION='20260810-products-v3-true-originals-v2'",
  "event.data.product_image_version!==PRODUCT_IMAGE_VERSION",
  "posts.length!==500",
  "PUBLIC_ORIGIN='https://ts15825868.github.io'",
  "WRITE_CONCURRENCY=4",
  "protectedPost(post)",
  "campaignHold(post)",
  "existingIdentity(existing)",
  "existingIds",
  "legacyTitles",
  "missingPosts(active,existing)",
  "SOURCE_PREFIX='公開500母庫:'",
  "image_status||''",
  "needs_generation",
  "/regeneration-ready",
  "data-sync-post-bank",
  "window.confirm",
]) must(sync.includes(token),`500篇母庫同步缺少安全契約：${token}`);

must(sync.includes("if(posts.length!==500)"),'母庫不是500篇時必須拒絕同步');
must(sync.includes("new Set(ids).size!==posts.length"),'母庫ID重複時必須拒絕同步');
must(sync.includes("if(id)existingIds.add(id)"),'正式母庫資料必須以source id去重');
must(sync.includes("else{const title=titleOf(post);if(title)legacyTitles.add(title)}"),'只有無source id的舊資料才允許用標題相容去重');
must(!sync.includes("existingTitles=new Set(existing.map"),'不得再用全部既有標題去重，避免不同ID同標題貼文被誤刪');
must(sync.includes("if(protectedPost")||sync.includes("filter(protectedPost"),'已發布鎖定必須被識別');
must(sync.includes("filter(p=>!protectedPost(p)&&!campaignHold(p))"),'正式同步必須排除已發布鎖定與活動冷卻');
must(sync.includes("const requires=needsGeneration(post),image=requires?'':absoluteImage(post.image_url)"),'需重生成貼文不得帶入舊錯圖');
must(sync.includes('event.data.product_image_version!==PRODUCT_IMAGE_VERSION'),'500篇同步必須拒絕舊產品圖版本的 exporter');
must(!sync.includes('/publish-now'),'500篇同步不得呼叫立即發布');
must(!sync.includes("status:'approved'")&&!sync.includes("status:'scheduled'")&&!sync.includes("status:'published'"),'500篇同步不得自行建立已核准／排程／發布狀態');
must(gate.includes('/regeneration-ready')&&gate.includes("status='pending_review'"),'安全候選送待審核必須由正式review gate處理');
must(html.includes('post-bank-sync.js?v=20260810-post-bank-sync-v3-true-originals'),'貼文系統沒有載入真正產品原圖版500篇母庫同步工具');
must(html.includes('同步500篇母庫'),'貼文系統沒有向使用者說明500篇母庫同步');
must(html.includes('20260810-products-v3-true-originals-v2'),'貼文系統沒有顯示目前正式產品圖版本');
must(pkg.includes('assets/js/post-bank-sync.js'),'部署包沒有包含500篇母庫同步工具');

console.log('PASS：500篇母庫以可信postMessage來源重建，且 exporter 必須回報20260810真正products-v3原圖版本；正式頁面也鎖定v3同步runtime。正式內容依source id去重，只有無source id舊資料才以標題相容去重。同標題不同ID可保留；已發布／活動冷卻不動，安全候選只進待審核，需重生成只建草稿，絕不自動發布。');
