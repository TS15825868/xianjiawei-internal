'use strict';
const fs=require('fs'),crypto=require('crypto'),path=require('path');
const root=path.resolve(__dirname,'..');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const a=JSON.parse(fs.readFileSync(path.join(root,'../full-audit-live-20261012/current-social-posts.json'),'utf8')).flatMap(x=>x.results||[]);
const copies={
'XJW-CONV-chat-shop-organizing':'今天不講大道理，小老闆正在整理仙加味店裡的漢方食材。把紅棗、枸杞分好，再把工作用的木匙放回原位。\n\n小鹿負責到處看看，小烏龜看起來比較像在監工。仙加味每天的細節，就是從這些小事慢慢累積。\n\n你是用完馬上歸位派，還是最後再一次整理派？',
'XJW-CONV-weather-cool-drink':'天氣轉涼時，有些人會比較想準備一杯溫熱的，或替家裡煮一鍋湯。\n\n仙加味分享的漢方飲食文化，也從這些簡單的日常安排開始。\n\n遇到涼爽的日子，你會先準備熱飲、湯，還是找件薄外套？',
'XJW-CONV-weather-rain-chat':'下雨的時候，把手邊的事情整理好，坐到窗邊看一會兒雨，也是很平常的片刻。\n\n仙加味想記錄的生活節奏，不只在產品裡，也在萬華店裡這些安靜的小事裡。\n\n雨天，你比較想喝熱茶、咖啡、湯，還是其他的？',
'XJW-CONV-year-end-small-win':'一年快走到尾聲時，很容易只想到還沒做完的事。換個方向想，今年有沒有一件很小、但你很慶幸自己有做的事情？\n\n仙加味小老闆也準備把今年在萬華店裡做過的事慢慢整理一下。補養，是一種節奏。',
'XJW-CONV-chat-glass-vs-pouch-storage':'今天換個生活角度來聊仙加味龜鹿飲：30cc小玻璃罐和180cc鋁袋，你家比較好收哪一種？\n\n有人喜歡一罐一罐排好，有人覺得鋁袋比較容易整理。你是哪一派？',
'XJW-CONV-chat-30-bare-jar':'今天認識仙加味龜鹿飲30cc的一個小細節：小玻璃裸罐，沒有貼紙。\n\n份量小巧，開罐後就能直接飲用，也可以依自己的生活習慣溫熱後飲用。\n\n你第一次認識一個產品時，會先看外觀、規格，還是使用方式？',
'XJW-CONV-chat-luerong-intro':'仙加味平常聊龜鹿系列比較多，鹿茸粉反而比較少出現在貼文裡。\n\n今天先從最基本的開始：仙加味鹿茸粉是75g／罐。一次只認識一件事，也比較容易記住。'
};
const alts={
'XJW-CONV-chat-shop-organizing':'仙加味小老闆在萬華木質工作間分類紅棗與枸杞，將木匙放回工作架；小鹿看著食材，小烏龜陪在工藝筆記旁。',
'XJW-CONV-chat-luerong-intro':'仙加味小老闆在午後木質工作桌前介紹鹿茸粉75g罐，小鹿與小烏龜分別陪在托盤和筆記旁。',
'XJW-CONV-live-hongludi-outing-20260929':'傍晚的烘爐地觀景平台，仙加味小老闆與小鹿、小烏龜坐在安全欄杆旁，遠眺城市與夕陽。',
'XJW-CONV-chat-craft-years':'仙加味小老闆在萬華工作間整理熬膠工藝紀錄、家族照片與老工具，小鹿和小烏龜陪在木桌旁。',
'XJW-CONV-chat-elder-kitchen-habit':'仙加味小老闆在午後居家廚房用竹篩瀝乾紅棗與枸杞，小鹿扶著籃子，小烏龜陪在備料桌旁。',
'XJW-CONV-chat-opening-prep':'早晨開店前，仙加味小老闆擦拭萬華店裡的木櫃台，小鹿陪在桌旁，小烏龜在門邊等候。',
'XJW-CONV-cny-last-day-reset':'年假最後一天，仙加味小老闆在居家客廳整理圍巾，將隔天用的隨身包放上玄關凳，小鹿和小烏龜陪在旁邊。',
'XJW-CONV-new-year-warm-cup-share':'新年晨光中的餐桌旁，仙加味小老闆將溫熱飲品遞給家人，小鹿與小烏龜陪在桌邊。'
};
const changes=[];
for(const p of a.filter(x=>['approved','pending_review'].includes(x.status))){
let alt=alts[p.id]||p.image_alt;
if(!alts[p.id]&&alt.includes('；'))alt=alt.split('；')[0]+'。';
const patch={image_alt:alt,image_source:'仙加味品牌與漢方生活情境',review_note:''};
if(copies[p.id])patch.copy=copies[p.id];
if(p.id==='XJW-CONV-live-hongludi-outing-20260929')patch.copy=p.copy.replace('昨天帶小老闆','之前帶小老闆');
if(p.id==='XJW-CONV-chat-shop-organizing'){
const img='assets/post-images/2026-10-12/formal-production/XJW-CONV-chat-shop-organizing-scene-v5.jpg',b=fs.readFileSync(path.join(root,img));
Object.assign(patch,{image_url:'https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/'+img,image_bytes:b.length,image_width:1254,image_height:1254,image_quality_status:'clear'});
}
const alteredCopy=patch.copy!==undefined&&patch.copy!==p.copy;
changes.push({postId:p.id,expected:hash(JSON.stringify(p)),before:p,patch,invalidatesApproval:alteredCopy||patch.image_alt!==p.image_alt,reason:p.id==='XJW-CONV-chat-shop-organizing'?'餐具雜貨主題偏移，重製為漢方食材整理':'公開欄位清理；完整舊資料與AI審核來源另存稽核紀錄'});
}
fs.writeFileSync(path.join(root,'ops/full-library-cleanup-20261012.json'),JSON.stringify({actor:'chatgpt:delegated-ai-maintenance',actorType:'AI_NOT_HUMAN',sourceRun:38210357087,total:a.length,changes},null,2)+'\n');
console.log(JSON.stringify({total:a.length,changes:changes.length,invalidates:changes.filter(x=>x.invalidatesApproval&&x.before.status==='approved').map(x=>x.postId)}));
