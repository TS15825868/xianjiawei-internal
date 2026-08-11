import fs from 'node:fs';

const source=fs.readFileSync('assets/js/product-authority-guard.js','utf8');
const must=(ok,message)=>{if(!ok)throw new Error(message)};

must(/const IMAGE_VERSION=['"]current-products-v3['"]/.test(source),'前端產品權威圖片識別必須跟目前products-v3，不得鎖歷史日期版號');
must(/version:['"]current-products-v3-authority['"]/.test(source),'前端產品權威必須使用current authority能力識別');
must(/guardPolicy:['"]current-authority-capability-based-no-historical-version-or-short-spec-lock['"]/.test(source),'前端守門原則必須明確採目前權威／能力式驗收');
must(source.includes("imageAuthority:'products-v3-current-original-product-photos'"),'前端產品圖片權威必須維持products-v3目前原圖');
must(!source.includes('/images/products-v2/'),'前端產品權威不得引用products-v2');

for(const spec of [
  '100g／罐',
  '30cc／罐（小玻璃罐）',
  '180cc／包（鋁袋）',
  '75g／盒｜8塊裝',
  '600g／盒｜32塊裝',
  '75g／罐'
]) must(source.includes(spec),`前端產品權威缺少目前完整正式規格：${spec}`);

must(source.includes("usagePrimary:'一天一次一小匙'"),'前端龜鹿膏主要使用資料必須是一天一次一小匙');
must(!/usagePrimary:['"](?:每日早上及下午各一小匙|早晚各一小匙)/.test(source),'前端不得把退役龜鹿膏用法設為權威值');
for(const retired of [
  "allowedSpecs:['30cc／罐']",
  "allowedSpecs:['180cc／包']",
  "allowedSpecs:['75g／盒']",
  '75g／盒｜8塊裝｜每塊約9.375g',
  '600g（1斤）／盒｜32塊裝｜每塊約18.75g'
]) must(!source.includes(retired),`前端產品權威仍保留退役／縮短規格作可接受值：${retired}`);

must(/dimensions:\{diameterMm:42,heightMm:51\}/.test(source),'30cc前端權威必須保留Ø42×H51小玻璃罐尺寸參考');
must(/dimensions:\{widthMm:51,heightMm:78\}/.test(source),'龜鹿膏前端權威必須保留51×78mm尺寸參考');
must(/aspectRatio:\{min:0\.60,target:0\.64,max:0\.68\}/.test(source),'180cc前端權威必須保留狹長鋁袋比例');
must(source.includes('未知尺寸不猜、不拉伸')||source.includes('沒有可信尺寸或相對尺度依據時不得自行猜測'),'未知包裝尺寸不得自行猜測');

must(source.includes('30cc正式名稱與包裝必須使用')&&source.includes('不得稱瓶'),'前端必須拒絕30cc瓶型退役稱呼');
must(source.includes('龜鹿湯塊目前正式顧客規格只有')&&source.includes('75g／盒｜8塊裝'),'前端必須拒絕龜鹿湯塊退役容量');
must(source.includes('龜鹿膠目前正式顧客規格為')&&source.includes('600g／盒｜32塊裝'),'前端必須拒絕龜鹿膠退役延伸規格');
must(source.includes('目前正式主要使用資料為「一天一次一小匙」'),'前端必須拒絕龜鹿膏退役早晚用法');

console.log('PASS：前端產品權威已跟目前六項完整規格、products-v3、30cc／180cc比例與龜鹿膏一天一次用法同步；舊短規格、舊每塊重量、舊1斤與歷史日期版號不再成為可接受權威。');
