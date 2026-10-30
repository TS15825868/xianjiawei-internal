import {test} from 'node:test';
import assert from 'node:assert/strict';
import {imageHash} from '../src/ai-quality-review.js';
const url='https://raw.githubusercontent.com/TS15825868/xianjiawei-internal/main/assets/image.jpg';
test('Cloudflare-compatible image fetch never follows redirects',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async(u,options)=>{assert.equal(options.redirect,'manual');return new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/jpeg'}})};assert.match(await imageHash(url),/^[a-f0-9]{64}$/)}finally{globalThis.fetch=original}
});
test('redirect to a different image cannot satisfy hash verification',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://example.com/evil.jpg'}});await assert.rejects(imageHash(url),/圖片無法讀取/)}finally{globalThis.fetch=original}
});
test('untrusted origin rejected before any network request',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>{throw Error('unexpected network')};await assert.rejects(imageHash('https://example.com/image.jpg'),/正式允許範圍/)}finally{globalThis.fetch=original}
});
