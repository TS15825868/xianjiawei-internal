const MAX_BYTES=700*1024;
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