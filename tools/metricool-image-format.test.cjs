'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {resolve}=require('node:path');
const {inspectImage}=require('./metricool-image-format.cjs');
const make=()=>Buffer.alloc(20*1024);
const png=()=>{const b=make();Buffer.from('89504e470d0a1a0a','hex').copy(b);b.writeUInt32BE(13,8);b.write('IHDR',12);b.writeUInt32BE(1080,16);b.writeUInt32BE(1350,20);return b};
const jpeg=()=>{const b=make();b[0]=255;b[1]=216;b[2]=255;b[3]=0xc2;b.writeUInt16BE(17,4);b[6]=8;b.writeUInt16BE(1350,7);b.writeUInt16BE(1080,9);b[21]=255;b[22]=217;return b};
const webp=()=>{const b=make();b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WEBP',8);b.write('VP8X',12);b.writeUInt32LE(10,16);const w=1079,h=1349;b[24]=w&255;b[25]=w>>8;b[26]=w>>16;b[27]=h&255;b[28]=h>>8;b[29]=h>>16;return b};
test('preserve original PNG, progressive JPEG, and WebP extensions',()=>{
 for(const [b,format] of [[png(),'png'],[jpeg(),'jpg'],[webp(),'webp']]){
  const v=inspectImage(b);assert.equal(v.format,format);assert.equal(v.width,1080);assert.equal(v.height,1350);
 }
});
test('reject malformed, tiny, huge, animated and low resolution headers',()=>{
 assert.throws(()=>inspectImage(Buffer.alloc(200)),/bytes/);
 assert.throws(()=>inspectImage(Buffer.alloc(13*1024*1024)),/bytes/);
 assert.throws(()=>inspectImage(make()),/format/);
 const p=png();p.writeUInt32BE(800,16);assert.throws(()=>inspectImage(p),/resolution/);
 const a=webp();a[20]=2;assert.throws(()=>inspectImage(a),/animation/);
 const t=webp();t.writeUInt32LE(20*1024,4);assert.throws(()=>inspectImage(t),/Incomplete/);
});
test('formal workflow retains human approval and never re-encodes approved media',()=>{
 const s=readFileSync(resolve(__dirname,'../.github/workflows/apply-metricool-approved-post-current.yml'),'utf8');
 for(const x of ["gateState(env,p)","p.status!=='approved'","x.postId+'.'+info.format",
   "inspectImage(fs.readFileSync","cp /tmp/xjw-approved-media","AND status='approved'"])
  assert.ok(s.includes(x),'missing '+x);
 for(const old of ["filename=safe+'.png'","/tmp/xjw-approved.png","status IN ('draft','pending_review','approved','scheduled')"])
  assert.ok(!s.includes(old),'unsafe '+old);
});
