"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const led=JSON.parse(fs.readFileSync("assets/data/current-product-photo-authority-v20261017.json","utf8"));
const hist=JSON.parse(fs.readFileSync("assets/data/real-product-photo-public-map-v20261016.json","utf8"));
const guard=fs.readFileSync("assets/js/product-authority-guard.js","utf8");
assert.equal(led.publicProductCount,9);
assert.equal(hist.publicAssets.length,9);
for(const p of hist.publicAssets){
 assert.ok(p.websiteMain.includes("/catalog-pure-v20261017/"));
 assert.equal(p.websiteMain,led.mainImages[p.id]);
}
for(const id of ["guilu-gao","guilu-drink-30","guilu-drink-180","luerong-fen"]){
 assert.ok(guard.includes(led.mainImages[id].split("?")[0].replace("https://ts15825868.github.io/xianjiawei/","")));
}
assert.equal(led.pendingProducts.length,2);
assert.ok(led.pendingProducts.every(x=>x.public===false));
console.log("PASS ERP nine current product photos and two pending real-package review items");
