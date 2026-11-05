// Create draft-only, conflict-aware Cloudflare D1 SQL from approved GitHub candidate editorial inventory.
// This tool NEVER assigns AI_APPROVED/HUMAN_APPROVED, schedules, uploads media or publishes.
import fs from 'node:fs';
const fail=m=>{throw new Error(m)};
const text=x=>String(x??'');
const q=s=>"'"+text(s).replaceAll("'","''")+"'";
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const unwrap=input=>Array.isArray(input)?input[0]?.results:Array.isArray(input.results)?input.results:input.rows;
const localWeek=date=>{const d=new Date(date+'T00:00:00Z');if(Number.isNaN(d.getTime()))fail('bad date');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10)};
const BLOCK=/台興山產|龜鹿膠|龜鹿湯塊|柒玄茶|治療|治癒|改善疾病|預防疾病|關節|卡卡|疲勞|精神不濟|補氣|生津|膠原蛋白|鈣質|保證功效|特價|假資料|占位文/u;
const normalize=s=>text(s).normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
function prepare(manifest,existingRows,metricool,profileExists,{from='2026-11-05',createdBy=''}={}){
 if(manifest?.schema!=='xjw-social-calendar-draft-staging-v1'||!Array.isArray(manifest.items)||manifest.items.length!==23||
 !manifest.safety||manifest.safety.status!=='draft_only'||manifest.safety.requiresHumanApproval!==true||manifest.safety.autoPublish!==false)
  fail('manifest not signed-off draft-only contract');
 if(!Array.isArray(existingRows)||!Array.isArray(metricool)||profileExists!==true||!createdBy.includes('@'))fail('live D1 or author profile not verified');
 const ids=new Set(),titles=new Set(),copies=new Set(),outputs=[],skipped=[];
 const all=existingRows.map(r=>({id:text(r.id),title:text(r.title),copy:text(r.copy),date:text(r.proposed_scheduled_at||r.scheduled_at).slice(0,10),status:text(r.status)}));
 const historicWeek=metricool.filter(r=>r.draft===true||r.status==='draft').map(r=>({date:text(r.date).slice(0,10),id:text(r.id)}));
 // Avoid double counting a post synced to both D1 and Metricool with the exact same calendar date.
 // Intentionally conservative: a duplicate between systems still reserves both slots.
 for(const [index,item] of manifest.items.entries()){
  if(!/^XJW-CAND-20\d{6}$/.test(item.id)||!/^20\d\d-\d\d-\d\d$/.test(item.date)||item.date<from||
   !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time)||item.timezone!=='Asia/Taipei'||
   !text(item.title).trim()||!text(item.copy).includes('仙加味')||text(item.copy).length<40||
   BLOCK.test(item.title+' '+item.copy)||!text(item.sceneBrief).trim()||
   ids.has(item.id)||titles.has(normalize(item.title))||copies.has(normalize(item.copy)))fail('unsafe or duplicate manifest candidate '+index);
  ids.add(item.id);titles.add(normalize(item.title));copies.add(normalize(item.copy));
 }
 const requested=manifest.items;
 // Count the entire candidate week before staging any member, including pending historical D1 slots.
 const reserveWeek=new Map();
 for(const r of all){if(r.date>=from){const wk=localWeek(r.date);reserveWeek.set(wk,(reserveWeek.get(wk)||0)+1)}}
 for(const r of historicWeek){if(r.date>=from){const wk=localWeek(r.date);reserveWeek.set(wk,(reserveWeek.get(wk)||0)+1)}}
 const calendarWeek=new Map();for(const item of requested){const wk=localWeek(item.date);calendarWeek.set(wk,(calendarWeek.get(wk)||0)+1)}
 const eligible=requested.filter(item=>{
  if(all.some(r=>r.id===item.id||normalize(r.title)===normalize(item.title)||normalize(r.copy)===normalize(item.copy))){
   skipped.push({id:item.id,reason:'existing_id_or_copy_or_title'});return false;
  }
  if(all.some(r=>r.date===item.date)||historicWeek.some(r=>r.date===item.date)){
   skipped.push({id:item.id,reason:'date_occupied'});return false;
  }
  const wk=localWeek(item.date);
  if((reserveWeek.get(wk)||0)+(calendarWeek.get(wk)||0)>3){
   skipped.push({id:item.id,reason:'weekly_cap'});return false;
  }
  return true;
 });
 const sql=[];
 for(const s of eligible){
  const date=s.date+'T'+s.time+':00+08:00',mark='Github候選日曆:'+s.id+'|待正式情境圖及人工審核';
  // Cross-check in SQL too. No actual delivery date is set.
  const week=localWeek(s.date);const d=new Date(week+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+6);const end=d.toISOString().slice(0,10);
  sql.push(
   'INSERT INTO social_posts(id,title,headline,copy,category,platforms_json,status,scheduled_at,approved_by,approved_at,published_at,created_by,image_url,image_alt,image_source,image_approved,image_width,image_height,image_bytes,image_quality_status,review_note,proposed_scheduled_at) '+
   'SELECT '+[q(s.id),q(s.title),q(''),q(s.copy),q(s.category),q(JSON.stringify(['Facebook','Instagram','Threads'])),q('draft'),'NULL','NULL','NULL','NULL',q(createdBy),q(''),q(s.sceneBrief),q(mark),'0','0','0','0',q('needs-generation'),q('GitHub候選內容自動匯入；尚無合格媒體、未審核、未核准、未排程、未發布'),q(date)].join(',')+
   ' WHERE EXISTS (SELECT 1 FROM profiles WHERE email='+q(createdBy)+')'+
   ' AND NOT EXISTS (SELECT 1 FROM social_posts WHERE id='+q(s.id)+' OR title='+q(s.title)+' OR copy='+q(s.copy)+')'+
   ' AND NOT EXISTS (SELECT 1 FROM social_posts WHERE substr(COALESCE(scheduled_at,proposed_scheduled_at),1,10)='+q(s.date)+')'+
   ' AND (SELECT COUNT(*) FROM social_posts WHERE status IN (\'draft\',\'pending_review\',\'approved\',\'scheduled\') AND substr(COALESCE(scheduled_at,proposed_scheduled_at),1,10) BETWEEN '+q(week)+' AND '+q(end)+') < 3;'
  );
 }
 return {eligible,skipped,sql:sql.join('\n')+'\n'};
}
const args=process.argv.slice(2),get=k=>{const i=args.indexOf(k);return i<0?'':args[i+1]};
if(import.meta.url===new URL('file://'+process.argv[1]).href){
 const manifest=read(get('--manifest')),d1=unwrap(read(get('--live'))),metricool=read(get('--metricool')).items;
 const profileRows=unwrap(read(get('--profile')));
 const p=Boolean(profileRows?.[0]?.found===1||Number(profileRows?.[0]?.found)===1);
 const actor=process.env.XJW_CONTENT_SEED_CREATED_BY||'tung314069@gmail.com';
 const result=prepare(manifest,d1,metricool,p,{createdBy:actor});
 fs.writeFileSync(get('--sql'),result.sql);
 fs.writeFileSync(get('--plan'),JSON.stringify({plannedAt:new Date().toISOString(),mode:'DRAFT_ONLY_NO_MEDIA_OR_APPROVAL',count:result.eligible.length,ids:result.eligible.map(x=>x.id),skipped:result.skipped},null,2)+'\n');
 console.log('SOCIAL_DRAFT_PLAN '+JSON.stringify({count:result.eligible.length,skipped:result.skipped.length,allStatuses:'draft',media:'none',approval:false,scheduled:false}));
}
export {prepare,localWeek};
