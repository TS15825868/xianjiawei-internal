import {inspectMp4} from './mp4-review.js';
const VIDEO_PART_BYTES=512*1024;
const MAX_BYTES=700*1024;
function reviewBudget(env,key,max){
  const value=Number(env[key]);
  return Number.isSafeInteger(value)&&value>0&&value<=max?value:0;
}
const videoDay=()=>new Date().toISOString().slice(0,10);
const JSON_HEADERS={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:JSON_HEADERS});
const clean=(value,fallback='')=>String(value??fallback).trim();
let mediaSchemaPromise=null;

const MEDIA_COLUMNS=Object.freeze([
  ['file_name',"TEXT NOT NULL DEFAULT ''"],
  ['mime_type',"TEXT NOT NULL DEFAULT 'image/jpeg'"],
  ['data_base64',"TEXT NOT NULL DEFAULT ''"],
  ['bytes','INTEGER NOT NULL DEFAULT 0'],
  ['width','INTEGER NOT NULL DEFAULT 0'],
  ['height','INTEGER NOT NULL DEFAULT 0'],
  ['created_by',"TEXT NOT NULL DEFAULT ''"],
  ['created_at',"TEXT NOT NULL DEFAULT ''"]
]);

function bytesToBase64(buffer){
  const bytes=new Uint8Array(buffer);
  let binary='';
  const chunk=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunk){binary+=String.fromCharCode(...bytes.subarray(offset,offset+chunk));}
  return btoa(binary);
}
function base64ToBytes(value){
  const binary=atob(value||'');
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index+=1) bytes[index]=binary.charCodeAt(index);
  return bytes;
}
async function mediaColumns(env){
  const result=await env.DB.prepare('PRAGMA table_info(media_assets)').all();
  return new Set((result.results||[]).map(row=>clean(row?.name).toLowerCase()).filter(Boolean));
}
async function addMediaColumn(env,columns,name,definition){
  if(columns.has(name))return;
  try{
    await env.DB.exec(`ALTER TABLE media_assets ADD COLUMN ${name} ${definition}`);
  }catch(error){
    if(!/duplicate column|already exists/i.test(String(error?.message||error)))throw error;
  }
  columns.add(name);
}

export async function ensureMediaSchema(env){
  if(!env?.DB)throw new Error('D1 資料庫尚未綁定');
  if(mediaSchemaPromise)return mediaSchemaPromise;
  mediaSchemaPromise=(async()=>{
    await env.DB.exec(`CREATE TABLE IF NOT EXISTS media_assets(
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      data_base64 TEXT NOT NULL DEFAULT '',
      bytes INTEGER NOT NULL DEFAULT 0,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT ''
    )`);
    const columns=await mediaColumns(env);
    if(!columns.has('id'))throw new Error('media_assets 資料表缺少 id 欄位，無法安全寫入圖片');
    for(const [name,definition] of MEDIA_COLUMNS)await addMediaColumn(env,columns,name,definition);
    return{ok:true,columns:[...columns]};
  })().catch(error=>{mediaSchemaPromise=null;throw error;});
  return mediaSchemaPromise;
}

export async function uploadMedia(request,env,profile){
  if(!['owner','admin','content'].includes(profile?.role)) return json({error:'沒有上傳圖片的權限'},403);
  const params=new URL(request.url).searchParams;
  const storeVideo=params.get('upload')==='mp4';
  if(storeVideo||params.get('preflight')==='mp4'){
    const maxBytes=Number(env.XJW_MP4_REVIEW_MAX_BYTES ?? 8*1024*1024);
    const maxSeconds=Number(env.XJW_MP4_REVIEW_MAX_SECONDS ?? 60);
    if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>32*1024*1024||!Number.isFinite(maxSeconds)||maxSeconds<=0)
      return json({error:'影片預審設定無效'},503);
    const length=Number(request.headers.get('content-length'));
    if(length>maxBytes)return json({error:'影片大小超出預審限制'},413);
    if(clean(request.headers.get('content-type')).toLowerCase()!=='video/mp4')
      return json({error:'影片 MIME 必須為 video/mp4'},415);
    if(!request.body)return json({error:'請提供 MP4 內容'},400);
    try{
      const reader=request.body.getReader();
      const chunks=[];
      let size=0;
      for(;;){
        const {done,value}=await reader.read();
        if(done)break;
        size+=value.byteLength;
        if(size>maxBytes){
          await reader.cancel();
          return json({error:'影片大小超出預審限制'},413);
        }
        chunks.push(value);
      }
      const bytes=new Uint8Array(size);
      let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const metadata=await inspectMp4(bytes.buffer,{maxBytes,maxSeconds});
      if(!storeVideo)return json({ok:true,stored:false,publishable:false,...metadata});
      const capacity=reviewBudget(env,'XJW_MP4_STORAGE_BYTES',100_000_000);
      const writeBudget=reviewBudget(env,'XJW_MP4_DAILY_WRITE_ROWS',1000);
      if(!capacity||!writeBudget||!reviewBudget(env,'XJW_MP4_DAILY_READ_ROWS',5000))
        return json({error:'影片儲存預算尚未啟用'},503);
      const id='VID-'+metadata.sha256;
      await env.DB.exec("CREATE TABLE IF NOT EXISTS video_asset_chunks (asset_id TEXT NOT NULL, part INTEGER NOT NULL, data_base64 TEXT NOT NULL, PRIMARY KEY(asset_id, part))");
      await env.DB.exec("CREATE TABLE IF NOT EXISTS video_asset_sizes (asset_id TEXT PRIMARY KEY, bytes INTEGER NOT NULL, day TEXT NOT NULL, write_rows INTEGER NOT NULL)");
      const previous=await env.DB.prepare('SELECT bytes FROM video_asset_sizes WHERE asset_id=?').bind(id).first();
      const estimatedBytes=4*Math.ceil(size/3)+2048*Math.ceil(size/VIDEO_PART_BYTES);
      const writes=1+Math.ceil(size/VIDEO_PART_BYTES);
      const day=videoDay();
      const statements=[env.DB.prepare(`INSERT OR IGNORE INTO video_asset_sizes(asset_id,bytes,day,write_rows)
        SELECT ?,?,?,? WHERE (SELECT COALESCE(SUM(4*((bytes+2)/3)+2048*((bytes+524287)/524288)),0) FROM video_asset_sizes)+?<=?
        AND (SELECT COALESCE(SUM(write_rows),0) FROM video_asset_sizes WHERE day=?)+?<=?
        AND (SELECT COUNT(*) FROM video_asset_sizes)<200`).bind(id,size,day,writes,estimatedBytes,capacity,day,writes,writeBudget)];
      const partBytes=VIDEO_PART_BYTES;
      for(let offset=0;!previous&&offset<size;offset+=partBytes){
        statements.push(env.DB.prepare('INSERT OR IGNORE INTO video_asset_chunks(asset_id,part,data_base64) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM video_asset_sizes WHERE asset_id=?)')
          .bind(id,offset/partBytes,bytesToBase64(bytes.slice(offset,offset+partBytes).buffer),id));
      }
      if(!previous){
        const results=await env.DB.batch(statements);
        if(!results[0]?.meta?.changes&&!await env.DB.prepare('SELECT bytes FROM video_asset_sizes WHERE asset_id=?').bind(id).first())
          return json({error:'影片容量或今日寫入預算已用完'},429);
      }
      const url=new URL('/api/media-upload',request.url);
      url.searchParams.set('video',id);
      return json({ok:true,stored:true,publishable:false,id,url:url.href,...metadata},201);
    }catch(error){return json({error:error.message},422);}
  }
  const schema=await ensureMediaSchema(env);
  let form;
  try{form=await request.formData();}catch{return json({error:'圖片上傳格式錯誤'},400);}
  const file=form.get('file');
  if(!file||typeof file.arrayBuffer!=='function') return json({error:'請先選擇圖片'},400);
  const mime=clean(file.type,'image/jpeg').toLowerCase();
  if(!/^image\/(jpeg|jpg|png|webp)$/.test(mime)) return json({error:'只接受 JPG、PNG 或 WebP 圖片'},400);
  const buffer=await file.arrayBuffer();
  if(!buffer.byteLength) return json({error:'圖片內容為空'},400);
  if(buffer.byteLength>MAX_BYTES) return json({error:'圖片太大，請使用 700KB 以下的圖片'},413);
  const id=`IMG-${crypto.randomUUID()}`;
  const width=Math.max(0,Math.round(Number(form.get('width')||0)));
  const height=Math.max(0,Math.round(Number(form.get('height')||0)));
  const now=new Date().toISOString();
  const fileName=clean(file.name,'image.jpg').slice(0,180);
  const ownerEmail=clean(profile.email).toLowerCase();
  if(!ownerEmail) return json({error:'登入帳號缺少電子郵件，無法安全建立圖片'},400);

  // 正式 D1 曾使用較完整的舊版 media_assets schema；以下以目前實際欄位動態補齊，
  // 避免新版上傳只寫 file_name 時被舊版 name/created_by/CHECK 約束擋住。
  const existing=new Set((schema?.columns||[]).map(value=>clean(value).toLowerCase()));
  const candidates=[
    ['id',id],
    ['name',fileName],
    ['category','貼文主圖'],
    ['source_type','upload'],
    ['file_url',''],
    ['data_base64',bytesToBase64(buffer)],
    ['mime_type',mime],
    ['width',width],
    ['height',height],
    ['file_size',buffer.byteLength],
    ['quality_status','pending'],
    ['approval_status','pending'],
    ['notes','貼文中心手機／裝置上傳'],
    ['created_by',ownerEmail],
    ['created_at',now],
    ['updated_at',now],
    ['file_name',fileName],
    ['bytes',buffer.byteLength]
  ];
  const entries=candidates.filter(([name])=>name==='id'||existing.has(name));
  const columns=entries.map(([name])=>name);
  const placeholders=entries.map(()=>'?').join(',');
  await env.DB.prepare(`INSERT INTO media_assets(${columns.join(',')}) VALUES(${placeholders})`)
    .bind(...entries.map(([,value])=>value)).run();

  const origin=new URL(request.url).origin;
  return json({ok:true,id,url:`${origin}/media/${encodeURIComponent(id)}`,mime_type:mime,bytes:buffer.byteLength,width,height,created_at:now},201);
}

export async function serveMedia(request,env,id){
  await ensureMediaSchema(env);
  const row=await env.DB.prepare('SELECT mime_type,data_base64,bytes FROM media_assets WHERE id=? LIMIT 1').bind(id).first();
  if(!row) return new Response('Not Found',{status:404,headers:{'cache-control':'no-store'}});
  const bytes=base64ToBytes(row.data_base64||'');
  return new Response(bytes,{status:200,headers:{
    'content-type':row.mime_type||'image/jpeg',
    'content-length':String(row.bytes||bytes.byteLength),
    'cache-control':'public, max-age=31536000, immutable',
    'access-control-allow-origin':'*',
    'x-content-type-options':'nosniff'
  }});
}
export async function serveReviewVideo(request,env,profile,id){
  if(!['owner','admin','content'].includes(profile?.role))return json({error:'沒有讀取影片的權限'},403);
  if(!/^VID-[a-f0-9]{64}$/.test(id))return json({error:'影片識別碼無效'},400);
  const readBudget=reviewBudget(env,'XJW_MP4_DAILY_READ_ROWS',5000);
  if(!readBudget)return json({error:'影片播放預算尚未啟用'},503);
  await env.DB.exec("CREATE TABLE IF NOT EXISTS video_read_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL)");
  const reserve=async units=>{
    if(units>readBudget)return false;
    const result=await env.DB.prepare(`INSERT INTO video_read_budget(day,used) VALUES(?,?)
      ON CONFLICT(day) DO UPDATE SET used=used+excluded.used WHERE used+excluded.used<=?`).bind(videoDay(),units,readBudget).run();
    return result.meta?.changes===1;
  };
  if(!await reserve(1))return json({error:'今日影片播放預算已用完'},429);
  const meta=await env.DB.prepare('SELECT bytes FROM video_asset_sizes WHERE asset_id=?').bind(id).first();
  if(!meta)return json({error:'找不到影片'},404);
  const size=meta.bytes;
  const headers={'content-type':'video/mp4','cache-control':'private, no-store','x-content-type-options':'nosniff','accept-ranges':'bytes'};
  const range=request.headers.get('range');
  const match=range && /^bytes=(\d*)-(\d*)$/.exec(range);
  const start=!range?0:match?.[1]?Number(match[1]):Math.max(0,size-Number(match?.[2]));
  const end=match?.[1]&&match[2]?Math.min(Number(match[2]),size-1):size-1;
  if(range&&(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||start>=size||start>end))
    return new Response(null,{status:416,headers:{...headers,'content-range':'bytes */'+size}});
  const first=Math.floor(start/VIDEO_PART_BYTES),last=Math.floor(end/VIDEO_PART_BYTES);
  if(!await reserve(last-first+1))return json({error:'今日影片播放預算已用完'},429);
  const result=await env.DB.prepare('SELECT part,data_base64 FROM video_asset_chunks WHERE asset_id=? AND part BETWEEN ? AND ? ORDER BY part').bind(id,first,last).all();
  const rows=result.results||[];
  if(rows.length!==last-first+1||rows.some((row,index)=>row.part!==first+index))return json({error:'影片分段不完整'},500);
  const blob=new Blob(rows.map(row=>base64ToBytes(row.data_base64)),{type:'video/mp4'});
  const offset=start-first*VIDEO_PART_BYTES;
  const length=end-start+1;
  if(blob.size<offset+length)return json({error:'影片分段不完整'},500);
  if(range)headers['content-range']=`bytes ${start}-${end}/${size}`;
  return new Response(blob.slice(offset,offset+length),{status:range?206:200,headers:{...headers,'content-length':String(length)}});
}
