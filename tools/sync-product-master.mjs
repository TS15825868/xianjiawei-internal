import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..');
const SNAPSHOT_PATH=path.join(ROOT,'src/product-master-snapshot.js');
const CLIENT_PATH=path.join(ROOT,'assets/js/current-public-product-master.js');
const MASTER_URL=process.env.PRODUCT_MASTER_URL||'https://raw.githubusercontent.com/TS15825868/xianjiawei/main/public-product-master.json';
const EXPECTED_IDS=['guilu-gao','guilu-drink-30','guilu-drink-180','guilu-tangkuai','guilu-jiao','luerong-fen'];

async function fetchMaster(){
  let master;
  if(process.env.PRODUCT_MASTER_FILE)master=JSON.parse(fs.readFileSync(process.env.PRODUCT_MASTER_FILE,'utf8'));
  else{
    const response=await fetch(MASTER_URL,{headers:{'user-agent':'xianjiawei-internal-current-public-authority'}});
    if(!response.ok)throw new Error(`無法下載目前公開產品母資料：HTTP ${response.status}`);
    master=await response.json();
  }
  if(master?.authority!=='user-confirmed-current')throw new Error('目前公開產品母資料 authority 錯誤');
  if(!Array.isArray(master?.products)||!master.products.length||master.productCount!==master.products.length)throw new Error('官網公開產品數與母資料不一致');
  const ids=master.products.map(item=>item.id);
  if(ids.some(id=>!id)||new Set(ids).size!==ids.length||!EXPECTED_IDS.every(id=>ids.includes(id)))throw new Error('公開產品ID重複、空白或缺少核心產品');
  if(ids.includes('qixuan-guilu-drink-powder'))throw new Error('柒玄茶暫緩公開，不得自動上架');
  if(!master.products.find(p=>p.id==='guilu-drink-30')?.usage?.includes('可依個人需求調整'))throw new Error('30cc缺少可依個人需求調整');
  return master;
}

function selected(source){
  const usagePrimary=String(source?.usagePrimary||source?.usage?.[0]||'').trim();
  const usageAdjustment=String(source?.usageAdjustment||source?.usage?.find?.(item=>String(item||'').trim()==='可依個人需求調整')||'').trim();
  const detailUnitApprox=String(source?.detailUnitApprox||source?.detail||'').trim();
  return {
    id:source.id,
    name:source.name,
    allowedSpecs:[source.specification],
    ingredients:[...(source.ingredients||[])],
    ...(usagePrimary?{usagePrimary}:{}),
    ...(usageAdjustment?{usageAdjustment}:{}),
    ...(source.usageTiming?{usageTiming:source.usageTiming}:{}),
    ...(detailUnitApprox?{detailUnitApprox}:{})
  };
}

function render(master){
  const products=master.products.map(selected);
  const lines=products.map(product=>`  Object.freeze(${JSON.stringify(product).replace('"allowedSpecs":[','"allowedSpecs":Object.freeze([').replace('],"ingredients"',']),"ingredients"').replace('"ingredients":[','"ingredients":Object.freeze([').replace(/](,"usagePrimary"|,"usageAdjustment"|,"usageTiming"|,"detailUnitApprox"|})/,'])$1')})`);
  return `// AUTO-GENERATED FROM ${MASTER_URL}\n// Do not hand-edit product facts here. Run: npm run sync:product-master\n// Website public authority follows the latest public product master; ERP may retain additional internal/deferred records elsewhere.\nexport const PRODUCT_MASTER_META=Object.freeze({\n  authority:${JSON.stringify(master.authority)},\n  version:${JSON.stringify(master.version)},\n  source:${JSON.stringify(MASTER_URL)},\n  productCount:${master.productCount}\n});\n\nexport const PRODUCTS=Object.freeze([\n${lines.join(',\n')}\n]);\n`;
}

function renderClient(master){
  const products=master.products.map(source=>({
    ...selected(source),spec:source.specification,
    usagePrimary:[...(source.usage||[]).slice(0,1),source.usageAdjustment||source.usage?.find(x=>x==='可依個人需求調整'),source.usageTiming].filter(Boolean).join('；')
  }));
  return `// Generated from current public-product-master.json; never removes ERP internal records.\nwindow.XJW_CURRENT_PUBLIC_PRODUCTS=Object.freeze(${JSON.stringify(products)}.map(product=>Object.freeze(product)));\n`;
}

async function assertSnapshot(master){
  const moduleUrl=`${pathToFileURL(SNAPSHOT_PATH).href}?v=${Date.now()}`;
  const snapshot=await import(moduleUrl);
  if(snapshot.PRODUCT_MASTER_META?.authority!==master.authority)throw new Error('ERP 快照 authority 與目前公開母資料不同步');
  if(snapshot.PRODUCT_MASTER_META?.version!==master.version)throw new Error(`ERP 快照版本 ${snapshot.PRODUCT_MASTER_META?.version||'missing'} 與目前公開母資料 ${master.version} 不同步`);
  const actual=(snapshot.PRODUCTS||[]).map(product=>({
    id:product.id,
    name:product.name,
    allowedSpecs:[...(product.allowedSpecs||[])],
    ingredients:[...(product.ingredients||[])],
    ...(product.usagePrimary?{usagePrimary:product.usagePrimary}:{}),
    ...(product.usageAdjustment?{usageAdjustment:product.usageAdjustment}:{}),
    ...(product.usageTiming?{usageTiming:product.usageTiming}:{}),
    ...(product.detailUnitApprox?{detailUnitApprox:product.detailUnitApprox}:{})
  }));
  const expected=master.products.map(selected);
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('ERP 產品守門快照與目前公開產品母資料不同步；請執行 npm run sync:product-master');
  if(!fs.existsSync(CLIENT_PATH)||fs.readFileSync(CLIENT_PATH,'utf8')!==renderClient(master))throw new Error('ERP前端公開產品清單尚未跟最新母資料同步');
}

async function main(){
  const master=await fetchMaster();
  if(process.argv.includes('--write')){
    fs.writeFileSync(SNAPSHOT_PATH,render(master),'utf8');
    fs.writeFileSync(CLIENT_PATH,renderClient(master),'utf8');
    console.log(`SYNCED ERP public product snapshot <- ${master.version}`);
    return;
  }
  await assertSnapshot(master);
  console.log(`PASS ERP public product authority ${master.version}`);
}

main().catch(error=>{
  console.error(error.message||error);
  process.exit(1);
});
