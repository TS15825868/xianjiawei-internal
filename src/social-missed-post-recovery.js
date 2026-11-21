// Pure, fail-closed recovery decisions. Never dispatch a post from this module.
const HOUR=3600000;
const HOLIDAY=/(元旦|除夕|元宵|春節|過年|走春|中秋|端午|聖誕|冬至|今天|今日|今晚|明天|本週|本周|即時|颱風|豪雨|節氣)/;
const UNCERTAIN=new Set(['sending','processing','unknown','awaiting_verification','pending','pending_confirmation','queued','scheduled']);
const SUCCESS=new Set(['published','success','delivered']);
const FAILURE=new Set(['failed','error','rejected']);
const canonical=value=>String(value??'').trim().toLowerCase();
const localDate=value=>new Date(value+8*HOUR).toISOString().slice(0,10);
// Scheduling proofs are external. Only propose an exact approved wall-clock slot,
// never infer a platform's remaining quota or publish directly.
function proposedRecoverySlot(start,reservedDates=[]){
  if(!Array.isArray(reservedDates))return null;
  const occupied=new Set();
  for(const value of reservedDates){
    const raw=String(value??'').trim();
    if(/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)){occupied.add(raw);continue;}
    const timestamp=Date.parse(raw);
    if(!Number.isFinite(timestamp))return null;
    occupied.add(localDate(timestamp));
  }
  const local=new Date(start+8*HOUR),end=start+72*HOUR;
  for(let dayOffset=0;dayOffset<5;dayOffset++){
    const date=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+dayOffset));
    const weekday=date.getUTCDay();
    const hours=weekday===0||weekday===6?[10]:[10,12];
    const day=date.toISOString().slice(0,10);
    if(occupied.has(day))continue;
    for(const hour of hours){
      const at=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),hour)-8*HOUR;
      if(at>=start&&at<=end)return new Date(at).toISOString();
    }
  }
  return null;
}
export function assessMissedSocialPost(post, receipts, now=new Date(), opts={}){
  const due=Date.parse(post?.scheduled_at||'');
  const current=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(due)||!Number.isFinite(current))return {action:'HOLD',reason:'invalid_time'};
  if(current<due+15*60000)return {action:'WAIT',reason:'within_delivery_grace'};
  const channels=Array.isArray(post?.platforms)?post.platforms.map(canonical):[];
  if(!channels.length||new Set(channels).size!==channels.length||channels.some(x=>!['facebook','instagram','threads'].includes(x)))return {action:'HOLD',reason:'invalid_platforms'};
  if(!Array.isArray(receipts))return {action:'VERIFY',reason:'missing_receipt_evidence'};
  const outstanding=[];
  for(const platform of channels){
    const records=receipts.filter(x=>canonical(x?.platform)===platform);
    if(records.some(x=>SUCCESS.has(canonical(x.status))))continue;
    if(records.length===0)return {action:'VERIFY',reason:'missing_receipt_evidence',platform};
    if(records.some(x=>UNCERTAIN.has(canonical(x.status))))return {action:'VERIFY',reason:'external_status_uncertain',platform};
    if(!records.every(x=>FAILURE.has(canonical(x.status))))return {action:'VERIFY',reason:'unrecognized_receipt',platform};
    outstanding.push(platform);
  }
  if(!outstanding.length)return {action:'DONE',reason:'all_platforms_delivered'};
  if(post?.approved!==true||post?.image_verified!==true||post?.dedup_verified!==true||post?.authorization_valid!==true)return {action:'HOLD',reason:'approval_or_media_missing'};
  if(opts.externalQuotaVerified!==true||opts.platformReady!==true)return {action:'HOLD',reason:'quota_or_platform_unverified'};
  const text=[post.title,post.copy].filter(Boolean).join(' ');
  if(HOLIDAY.test(text)||post.time_sensitive===true||current-due>48*HOUR)return {action:'REPLACE_REVIEW',reason:'time_sensitive_or_stale',platforms:outstanding};
  const start=Math.max(current+30*60000,due+15*60000);
  const proposed_at=proposedRecoverySlot(start,opts.reservedDates);
  if(proposed_at)return {action:'RESCHEDULE_REVIEW',reason:'verified_failure',platforms:outstanding,proposed_at};
  return {action:'HOLD',reason:'no_safe_slot_or_unverified_reservations'};
}
