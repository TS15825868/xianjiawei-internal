import fs from 'node:fs';

const source=fs.readFileSync('assets/js/product-authority-guard.js','utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

must(/version:['"]current-product-authority-20260814-v2['"]/.test(source),'前端產品權威必須使用目前能力識別');
must(/guardPolicy:['"]current-authority-capability-based-no-historical-version-lock['"]/.test(source),'前端守門必須採目前權威／能力式驗收');
must(source.includes("customerProductImageAuthority:'customer-display-v20260812-current-approved'"),'一般產品顧客主圖必須使用目前customer-display權威');
must(source.includes("detailedDmAuthority:'dm-final-current-approved-high-resolution'"),'詳細DM必須維持獨立dm-final權威');
must(source.includes("trialAuthority:'trial-poster-small-boss-official-v20260814'"),'試喝必須鎖定8/14正式海報角色');
must(source.includes("productIdentityReference:'products-v3-current-original-product-photos'"),'products-v3必須只保留真實產品身份／比例參考角色');
must(!source.includes('/images/products-v2/'),'前端產品權威不得引用products-v2');

for(const spec of [
  '100g／罐',
  '30cc／罐（小玻璃罐）',
  '180cc／包（鋁袋）',
  '75g／盒｜8塊裝',
  '600g（1斤）／盒｜32塊裝',
  '75g／罐'
]) must(source.includes(spec),`前端產品權威缺少目前完整正式主規格：${spec}`);

must(source.includes("usagePrimary:'食用時間與份量可依個人使用習慣與作息安排'"),'前端龜鹿膏主要使用資料必須依個人習慣與作息');
must(source.includes("usagePrimary:'每日 1-2罐；飲用時間可依個人使用習慣與作息安排'"),'前端30cc使用方式必須是目前確認版本');
must(source.includes("usagePrimary:'每日一包；飲用時間可依個人使用習慣與作息安排'"),'前端180cc需保留每日一包並依個人作息安排時間');
for(const retired of ['一天一次一小匙','每日一次一小匙','早晚各一小匙'])must(source.includes(retired),`前端需保留對舊龜鹿膏用法的拒絕判斷：${retired}`);
for(const retired of [
  "allowedSpecs:['30cc／罐']",
  "allowedSpecs:['180cc／包']",
  "allowedSpecs:['75g／盒']",
  "allowedSpecs:['600g／盒｜32塊裝']",
  "allowedSpecs:['75g／盒｜8塊裝｜每塊約9.375g']",
  "allowedSpecs:['600g（1斤）／盒｜32塊裝｜每塊約18.75g']"
]) must(!source.includes(retired),`前端產品權威仍把退役／縮短／detail-only值當主規格：${retired}`);

must(/dimensions:\{diameterMm:42,heightMm:51\}/.test(source),'30cc前端權威必須保留Ø42×H51小玻璃罐尺寸參考');
must(/dimensions:\{widthMm:51,heightMm:78\}/.test(source),'龜鹿膏前端權威必須保留51×78mm尺寸參考');
must(/aspectRatio:\{min:0\.60,target:0\.64,max:0\.68\}/.test(source),'180cc前端權威必須保留狹長鋁袋比例');
must(source.includes('未知尺寸不猜、不拉伸')||source.includes('沒有可信尺寸或相對尺度依據時不得自行猜測'),'未知包裝尺寸不得自行猜測');

must(source.includes('不得稱瓶'),'前端必須拒絕30cc瓶型退役稱呼');
must(source.includes('龜鹿湯塊目前正式主規格只有')&&source.includes('75g／盒｜8塊裝'),'前端必須拒絕龜鹿湯塊退役容量');
must(source.includes('每塊約9.375g只留產品詳細／內部資料'),'湯塊每塊重量必須是detail-only');
must(source.includes('每塊約18.75g只留產品詳細／內部資料'),'龜鹿膠每塊重量必須是detail-only');
must(source.includes('龜鹿膏不設定固定早上／下午時段；食用時間與份量可依個人使用習慣與作息安排。'),'前端必須移除龜鹿膏固定早上／下午時段');
must(source.includes('龜鹿飲不設定固定白天時段'),'前端必須移除龜鹿飲固定白天時段');
must(source.includes('龜鹿飲30cc目前使用方式為「每日 1-2罐」'),'前端必須拒絕30cc舊每日一罐用法');
must(source.includes("image:image('images/customer-display-v20260812/guilu-drink-30cc.avif')"),'30cc一般顧客產品圖必須使用目前customer-display');
must(source.includes("identity:image('images/products-v3/guilu-drink-30.jpg')"),'30cc products-v3只能保留身份參考');

console.log('PASS：前端產品權威已同步目前六項主規格與個人作息原則；龜鹿膏不鎖固定早晚、30cc為每日 1-2罐、180cc保留每日一包、龜鹿飲不鎖固定白天時段。');
