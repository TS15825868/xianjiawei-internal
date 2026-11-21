// Pure, fail-closed recovery decisions. Never dispatch a post from this module.
const HOUR=3600000;
const DAY=24*HOUR;
const HOLIDAY=/(元旦|除夕|元宵|春節|過年|走春|中秋|端午|聖誕|冬至|今天|今日|今晚|明天|本週|本周|即時|颱風|豪雨|節氣)/;
const UNCERTAIN=new Set(['sending','processing','unknown','awaiting_verification','pending','pending_confirmation','queued','scheduled']);
const SUCCESS=new Set(['published','success','delivered']);
const FAILURE=new Set(['failed','error','rejected']);
const localParts=date=>{const d=new Date(date.getTime()+8*HOUR);return {day:d.getUTCDay(),hour:d.getUTCHours(),ymd:d.toISOString().slice(0,10)}};
export function assessMissedSocialPost(post, receipts, now=new Date(), opts={}){
  const reasons=[];
  const due=Date.parse(post?.scheduled_at||'');
  const current=now instanceof Date?now.getTime():Date.parse(now);
  if(!Number.isFinite(due)||!Number.isFinite(current))return {action:'HOLD',reason:'invalid_time'};
  if(current<due+15*60000)return {action:'WAIT',reason:'within_delivery_grace'};
  const channels=Array.isArray(post?.platforms)?post.platforms:[];
  if(!channels.length||new Set(channels).size!==channels.length||channels.some(x=>!['facebook','instagram','threads'].includes(x)))return {action:'HOLD',reason:'invalid_platforms'};
  if(!Array.isArray(receipts))return {action:'VERIFY',reason:'missing_receipt_evidence'};
  const outstanding=[];
  for(const platform of channels){
    const records=receipts.filter(x=>x?.platform===platform);
    if(records.some(x=>SUCCESS.has(String(x.status).toLowerCase())))continue;
    if(records.length===0)return {action:'VERIFY',reason:'missing_receipt_evidence',platform};
    if(records.some(x=>UNCERTAIN.has(String(x.status).toLowerCase())))return {action:'VERIFY',reason:'external_status_uncertain',platform};
    if(!records.every(x=>FAILURE.has(String(x.status).toLowerCase())))return {action:'VERIFY',reason:'unrecognized_receipt',platform};
    outstanding.push(platform);
  }
  if(!outstanding.length)return {action:'DONE',reason:'all_platforms_delivered'};
  if(post?.approved!==true||post?.image_verified!==true||post?.dedup_verified!==true||post?.authorization_valid!==true)return {action:'HOLD',reason:'approval_or_media_missing'};
  if(opts.externalQuotaVerified!==true||opts.platformReady!==true)return {action:'HOLD',reason:'quota_or_platform_unverified'};
  const text=[post.title,post.copy].filter(Boolean).join(' ');
  if(HOLIDAY.test(text)||post.time_sensitive===true||current-due>48*HOUR)return {action:'REPLACE_REVIEW',reason:'time_sensitive_or_stale',platforms:outstanding};
  const occupied=new Set((opts.reservedDates||[]).map(x=>String(x).slice(0,10)));
  for(let h=0;h<72;h++){
    const candidate=new Date(Math.max(current+30*60000,due+15*60000)+h*HOUR);
    const {day,hour,ymd}=localParts(candidate);
    if(occupied.has(ymd))continue;
    if(([1,2,3,4,5].includes(day)&&[10,12].includes(hour))||([0,6].includes(day)&&hour===10)){
      return {action:'RESCHEDULE_REVIEW',reason:'verified_failure',platforms:outstanding,proposed_at:candidate.toISOString()};
    }
  }
  return {action:'HOLD',reason:'no_safe_slot'};
}
