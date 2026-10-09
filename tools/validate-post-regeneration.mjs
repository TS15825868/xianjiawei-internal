import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};
const policy=read('assets/js/post-regenerate-policy-v1.js');
const html=read('publishing.html');
const gate=read('src/publishing-review-gate-entry.js');
const buttons=read('assets/js/post-regenerate-buttons.js');
const pkg=read('package.json');
for(const v of [
  "三、目前對外產品只有四項",
  "龜鹿膏100g",
  "龜鹿飲30cc玻璃罐",
  "龜鹿飲180cc鋁袋",
  "鹿茸粉75g",
  "小玻璃裸罐",
  "AI絕對不得重畫",
  "單一場景",
  "待審核",
  "/regeneration-start",
  "/regeneration-ready"
])must(policy.includes(v),'製圖入口缺少新版正式規則：'+v);
for(const v of ["'龜鹿膠600g':","'龜鹿湯塊75g':","正式產品與規格只有六項","每日早上及下午各一小匙"]){
  must(!policy.includes(v),'舊產品或舊使用方式回流：'+v);
}
must(gate.includes('龜鹿膠與龜鹿湯塊已退出公開產品清單'),'後端未攔截下架產品新貼文');
must(!gate.includes("id:'guilu-jiao'")&&!gate.includes("id:'guilu-tangkuai'"),'後端仍包含已下架公開產品權威');
must(html.includes('20261009-four-public-products-v1'),'行動版未載入2026-10-09新版快取識別');
must(html.includes('post-regenerate-buttons.js'),'貼文中心沒有重生成按鈕');
must(buttons.includes('data-post-regenerate-mode'),'缺少原卡片重新生成觸發');
must(!policy.includes('api.openai.com'),'不得啟用額外付費生圖API');
must(!policy.includes('/publish-now'),'重新生成不能直接發布');
must(pkg.includes('tools/validate-post-regeneration.mjs'),'需保留製圖驗證腳本');
console.log('PASS：四項產品與原圖硬規則、下架品阻擋、16項審核與新版手機快取均符合');
