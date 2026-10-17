"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs");
const led=JSON.parse(fs.readFileSync("assets/data/current-product-photo-authority-v20261017.json","utf8"));
const hist=JSON.parse(fs.readFileSync("assets/data/real-product-photo-public-map-v20261016.json","utf8"));
const guard=fs.readFileSync("assets/js/product-authority-guard.js","utf8");
assert.ok(Number.isInteger(led.publicProductCount) && led.publicProductCount>0);
assert.equal(hist.publicAssets.length,led.publicProductCount);
for(const p of hist.publicAssets){
 const main=new URL(p.websiteMain);
 assert.equal(main.origin,"https://ts15825868.github.io","Public photo domain mismatch: "+p.id);
 assert.ok(main.pathname.startsWith("/xianjiawei/images/"),"Public product photo path must stay on website: "+p.id);
 assert.ok(main.pathname.includes("/catalog-owner-final-v20261017/"),"Use only actual approved carton photo: "+p.id);
 assert.ok((p.websiteDetailImages||[]).every(url=>{
   const detail=new URL(url);
   return detail.origin===main.origin && detail.pathname.startsWith("/xianjiawei/images/");
 }),"Mixed/unverified product detail image hosts: "+p.id);
 assert.equal(p.websiteMain,led.mainImages[p.id]);
}
for(const id of ["guilu-gao","guilu-drink-30","guilu-drink-180","luerong-fen"]){
 assert.ok(guard.includes(led.mainImages[id].split("?")[0].replace("https://ts15825868.github.io/xianjiawei/","")));
}
assert.ok(Array.isArray(led.pendingProducts));
assert.ok(led.pendingProducts.every(x=>x.public===false));
console.log("PASS ERP public product photo authority and pending real-package review items for "+hist.publicAssets.length+" entries");
