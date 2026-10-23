const crypto=require('crypto');
const aiEvidence=require('../src/ai-quality-evidence.cjs');
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const material=p=>({title:String(p.title||'').trim(),headline:String(p.headline||'').trim(),copy:String(p.copy||'').trim(),category:String(p.category||'').trim(),image_url:String(p.image_url||'').trim(),image_alt:String(p.image_alt||'').trim(),image_source:String(p.image_source||'').trim(),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:String(p.image_quality_status||'').trim()});
const fingerprint=p=>crypto.createHash('sha256').update(JSON.stringify(material(p))).digest('hex');
function wallClockEpoch(dateTime,timeZone){
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(String(dateTime||''))||!timeZone)throw Error('Missing remote publication time');
  const target=Date.parse(dateTime+'Z');
  let guess=target;
  const fmt=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let i=0;i<3;i++){const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));const shown=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);guess+=target-shown;}
  return guess;
}
function validate(p,gate,link,e,aiReview=null){
  if(!p||!e)throw Error('Missing post or evidence');
  const r=e.remote;if(!r||Number(r.id)===394674560)throw Error('Protected published post');
  // Bind every receipt to one real remote post before generating D1 SQL.
  // UUID equality alone must not allow the numeric ID to be overwritten.
  if(!Number.isSafeInteger(r.id)||r.id<1||typeof r.uuid!=='string'||!r.uuid.trim())
    throw Error('Invalid remote post identity');
  if(link?.metricool_id&&r.id!==Number(link.metricool_id))throw Error('Existing remote ID changed');
  if(e.sourceFingerprint!==fingerprint(p)||e.imageSource!==p.image_url)throw Error('Source version changed');
  if(link?.metricool_id&&String(r.uuid)!==String(link.uuid))throw Error('Existing UUID changed; never create again');
  if(r.text!==p.copy)throw Error(`Copy mismatch; D1=${JSON.stringify(String(p.copy||''))}; Metricool=${JSON.stringify(String(r.text||''))}`);
  try{wallClockEpoch(r.publicationDate?.dateTime,r.publicationDate?.timezone)}catch{throw Error(`Invalid publication timezone (${String(r.publicationDate?.timezone||'missing')})`)}
  if(r.media?.length!==1)throw Error(`Media count mismatch (${Array.isArray(r.media)?r.media.length:'missing'})`);
  if(!/^[0-9a-f]{64}$/.test(e.imageSHA256||''))throw Error('Missing verified image hash');
  const names=['facebook','instagram','threads'];if(!names.every(n=>r.providers?.some(x=>x.network===n))||r.providers.length!==3)throw Error('Three platforms required');
  if(e.result==='draft'){
    // Metricool reports PENDING on drafts too. Remote status alone is NOT
    // evidence of a scheduled, approved publication.
    if(p.status!=='pending_review'||r.draft!==true||r.autoPublish!==false||
       !r.providers.every(x=>x.status==='PENDING'))
      throw Error('Unreviewed content must remain draft');
    return 'pending_review';
  }
  const checks=JSON.parse(gate?.checklist_json||'{}');
  const human=gate&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gate.reviewed_by)&&gate.reviewed_by===p.approved_by&&gate.content_fingerprint===e.sourceFingerprint&&gate.copy_image_match===1&&keys.every(k=>checks[k]===true);
  if(!human||String(p.review_note||'').startsWith('AI審核：AI_APPROVED；'))throw Error('Verified human approval required; AI assessment is evidence only');
  if(!['approved','scheduled','manual_required'].includes(p.status))throw Error('Post not approved or already published');
  if(e.result==='scheduled'){
    const remoteAt=wallClockEpoch(r.publicationDate.dateTime,r.publicationDate.timezone);
    const verifiedAt=Date.parse(e.verifiedAt);
    if(!Number.isFinite(verifiedAt)||remoteAt!==Date.parse(e.publicationAt)||
       Date.parse(e.publicationAt)<=verifiedAt||
       r.draft!==false||r.autoPublish!==true||r.instagramData?.autoPublish!==true||
       !r.providers.every(x=>x.status==='PENDING'))
      throw Error('Saved schedule settings invalid');
    return'scheduled';
  }
  if(e.result!=='result')throw Error('Unknown evidence type');
  if(wallClockEpoch(r.publicationDate.dateTime,r.publicationDate.timezone)!==Date.parse(e.publicationAt))
    throw Error('Publication result time mismatch');
  if(r.draft===true)throw Error('Remote still draft; no verified publication outcome');
  if(!r.providers.every(x=>['PENDING','PUBLISHED','ERROR'].includes(x.status)))
    throw Error('Unknown remote provider publication state');
  for(const x of r.providers){if(x.status==='PUBLISHED'){const u=new URL(x.publicUrl||'');const allowed={facebook:['facebook.com','www.facebook.com','fb.com'],instagram:['instagram.com','www.instagram.com'],threads:['threads.com','www.threads.com','threads.net','www.threads.net']};if(u.protocol!=='https:'||!allowed[x.network].includes(u.hostname)||!x.id)throw Error('Published platform requires its actual URL and remote ID')}}
  return r.providers.every(x=>x.status==='PUBLISHED')?'published':r.providers.some(x=>x.status==='ERROR')?'failed':'awaiting_verification';
}
module.exports={fingerprint,validate};
