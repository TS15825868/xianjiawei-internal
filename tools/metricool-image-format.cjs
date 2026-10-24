'use strict';
// Header probe only. Never re-encode a human-approved image or infer image content.
function inspectImage(bytes){
 const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
 if(b.length<16*1024||b.length>12*1024*1024)throw Error('Invalid image bytes');
 let format,width,height;
 if(b.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))){
  if(b.length<33||b.toString('ascii',12,16)!=='IHDR'||b.readUInt32BE(8)!==13)throw Error('Invalid PNG header');
  format='png';width=b.readUInt32BE(16);height=b.readUInt32BE(20);
 }else if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff){
  format='jpg';let offset=2;
  while(offset+4<b.length){
   if(b[offset]!==0xff)throw Error('Invalid JPEG marker');
   while(b[offset]===0xff)offset++;
   const marker=b[offset++];
   if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   if(offset+2>b.length)throw Error('Invalid JPEG segment');
   const segment=b.readUInt16BE(offset);
   if(segment<2||offset+segment>b.length)throw Error('Invalid JPEG segment length');
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(segment<7)throw Error('Invalid JPEG dimensions');
    height=b.readUInt16BE(offset+3);width=b.readUInt16BE(offset+5);break;
   }
   offset+=segment;
  }
 }else if(b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'){
  format='webp';const riff=b.readUInt32LE(4)+8;
  if(riff<30||riff>b.length)throw Error('Incomplete WebP');
  const fourcc=b.toString('ascii',12,16);
  if(fourcc==='VP8X'){
   if(b.length<30||b.readUInt32LE(16)<10||(b[20]&0x02))throw Error('Unsupported WebP animation');
   width=1+b[24]+(b[25]<<8)+(b[26]<<16);
   height=1+b[27]+(b[28]<<8)+(b[29]<<16);
  }else if(fourcc==='VP8 '){
   if(b.length<30||b[23]!==0x9d||b[24]!==0x01||b[25]!==0x2a)throw Error('Invalid VP8 header');
   width=b.readUInt16LE(26)&0x3fff;height=b.readUInt16LE(28)&0x3fff;
  }else if(fourcc==='VP8L'){
   if(b.length<25||b[20]!==0x2f)throw Error('Invalid lossless WebP');
   width=1+(b[21]|((b[22]&0x3f)<<8));
   height=1+((b[22]>>6)|(b[23]<<2)|((b[24]&0x0f)<<10));
  }else throw Error('Unsupported WebP payload');
 }else throw Error('Unsupported image format');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1080||height<1080||width>20000||height>20000)
  throw Error('Image resolution insufficient');
 return Object.freeze({format,width,height,bytes:b.length});
}
module.exports={inspectImage};
