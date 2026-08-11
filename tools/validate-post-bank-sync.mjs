import fs from 'node:fs';
const read=path=>fs.readFileSync(path,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const sync=read('assets/js/post-bank-sync.js');
const html=read('publishing.html');
const pkg=read('package.json');
const gate=read('src/publishing-review-gate-entry.js');

for(const token of ['post-bank-export.html',"schema!=='xjw-post-bank-export-v1'",'validateExport(data)',"retired_assets_removed!==true",'products-v3','products-v2','post_count_matches_current_catalog','new Set(ids).size!==posts.length',"PUBLIC_ORIGIN='https://ts15825868.github.io'",'WRITE_CONCURRENCY=4','protectedPost(post)','campaignHold(post)','existingIdentity(existing)','existingIds','legacyTitles','missingPosts(active,existing)',"SOURCE_PREFIX='公開母庫:'",'needs_generation','/regeneration-ready','data-sync-post-bank','window.confirm']) must(sync.includes(token),`目前貼文母庫同步缺少安全能力：${token}`);

const syncVersion=sync.match(/const VERSION=['\"]([^'\"]+)['\"]/i)?.[1]||'';
must(syncVersion&&/post-bank-sync/i.test(syncVersion),'貼文母庫同步工具必須有能力版本識別');
must(!sync.includes('KNOWN_REGENERATION_MINIMUM'),'貼文母庫不得用歷史重生成數量門檻阻擋新版');
must(!sync.includes('event.data.runtime!==EXPORT_RUNTIME'),'貼文母庫不得要求 exporter 舊 runtime 逐字相等');
must(!sync.includes('event.data.product_image_version!==PRODUCT_IMAGE_VERSION'),'貼文母庫不得要求產品圖舊快取版號逐字相等');
must(!sync.includes('posts.length!==500')&&!sync.includes('posts.length===500'),'貼文母庫不得再把剛好500篇當正確性條件');
must(!sync.includes("post_count_500"),'貼文母庫不得再要求歷史500篇 capability');
must(sync.includes('if(posts.length<1)'),'目前母庫必須至少有可同步內容');
must(sync.includes('Number(data.post_count||posts.length)!==posts.length'),'母庫宣告數量必須跟目前實際內容一致');
must(sync.includes("new Set(ids).size!==posts.length"),'母庫ID重複時必須拒絕同步');
must(sync.includes("if(id)existingIds.add(id)"),'正式母庫資料必須以source id去重');
must(sync.includes("else{const title=titleOf(post);if(title)legacyTitles.add(title)}"),'只有無source id的舊資料才允許用標題相容去重');
must(!sync.includes("existingTitles=new Set(existing.map"),'不得用全部既有標題去重，避免不同ID同標題被誤刪');
must(sync.includes("filter(p=>!protectedPost(p)&&!campaignHold(p))"),'同步必須排除已發布鎖定與活動冷卻');
must(sync.includes("const requires=needsGeneration(post),image=requires?'':absoluteImage(post.image_url)"),'需重生成貼文不得帶入舊錯圖');
must(sync.includes("if(needsGeneration(post)&&image)"),'匯入前必須拒絕需重生成卻仍帶錯圖');
must(sync.includes("caps[key]!==true"),'同步端必須驗 exporter 目前安全能力，而非歷史版號');
must(!sync.includes('/publish-now'),'母庫同步不得呼叫立即發布');
must(!sync.includes("status:'approved'")&&!sync.includes("status:'scheduled'")&&!sync.includes("status:'published'"),'母庫同步不得自行建立已核准／排程／發布狀態');
must(gate.includes('/regeneration-ready')&&gate.includes("status='pending_review'"),'安全候選送待審核必須由正式review gate處理');
must(/post-bank-sync\.js\?v=[^\"']+/.test(html),'貼文系統沒有載入正式母庫同步工具或缺少快取識別');
must(html.includes('目前正式貼文母庫')&&html.includes('不再限制必須剛好500篇'),'主畫面必須清楚說明母庫可持續增加、不固定500篇');

const normalized=html.replace(/\s+/g,'');
const hasAny=patterns=>patterns.some(p=>p.test(normalized));
must(hasAny([/圖不符合.*文案不符合.*全部重新生成/,/重新生成.*圖.*文案/]),'貼文系統沒有提供圖／文案重新生成入口');
must(/原核准自動失效/.test(normalized)||/撤銷舊核准/.test(normalized),'貼文系統沒有說明修改／重生成後舊核准會失效');
must(hasAny([/儲存後(?:會)?自動回到[「"]?待審核/,/生成完成後.*待審核/,/重新生成後.*待審核/]),'貼文系統沒有說明重生成完成後必須回待審核');
must(/不會自動核准(?:或|／)發布/.test(normalized)||/不會自動核准.*不會自動發布/.test(normalized),'貼文系統沒有說明重生成不得自動核准／發布');
must(/16項/.test(normalized)&&(/重新完成/.test(normalized)||/重跑/.test(normalized)||/審核/.test(normalized)),'貼文系統沒有保留16項重新審核能力說明');
must(html.includes('products-v3')&&!html.includes('products-v2-actual-photos'),'貼文系統沒有維持目前products-v3正式產品圖權威');
must(pkg.includes('assets/js/post-bank-sync.js'),'部署包沒有包含母庫同步工具');

console.log('PASS：貼文母庫守門改為目前能力驗收：張數跟隨目前公開catalog、ID唯一、products-v3權威、products-v2禁用、需重生成不沿用舊圖、已發布鎖定與活動冷卻保護；不再硬限制500篇、舊runtime、產品圖舊快取版號或歷史重生成數量。');
