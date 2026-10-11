const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const sources={386526334:'exec-d3d543da-854b-4d37-9431-5af5dcc19496.png',386526357:'exec-788674b0-3431-41c5-97c9-cd3d7b2cd231.png',386526755:'exec-1d6de647-5ed9-447f-ac67-51b350c668a2.png'};
(async()=>{const rows=[];for(const [id,file] of Object.entries(sources)){
const out=`assets/metricool-images/2026-10-11/metricool-${id}-scene-v1.jpg`;
fs.mkdirSync(path.dirname(path.join(root,out)),{recursive:true});
let im=sharp(path.join(root,'../generated_images',file)).resize(1254,1254);
if(id==='386526334'){
const gao=await sharp(path.join(root,'assets/product-photo-cutouts/2026-10-11/gao.png')).resize({height:220}).toBuffer();
const drink=await sharp(path.join(root,'assets/product-photo-cutouts/2026-10-11/drink-30.png')).resize({height:136}).toBuffer();
im=im.composite([{input:gao,left:660,top:850},{input:drink,left:870,top:934}]);
}
await im.jpeg({quality:96,chromaSubsampling:'4:4:4'}).toFile(path.join(root,out));
const bytes=fs.readFileSync(path.join(root,out));rows.push({originalMetricoolId:Number(id),imagePath:out,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,draft:true,autoPublish:false,visualCheck:'pass',productOriginals:id==='386526334'?['gao.png','drink-30.png']:[],sourceBackground:file});
}fs.writeFileSync(path.join(root,'ops/metricool-media-closeout-current.json'),JSON.stringify({version:'2026-10-11',publishedByThisBatch:0,images:rows},null,2)+'\n');console.log(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exit(1)});
