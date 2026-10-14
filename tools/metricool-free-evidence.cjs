const crypto=require('crypto');
const aiEvidence=require('../src/ai-quality-evidence.cjs');
const keys=['brand','product','specification','pricing_activity','season','weather','occasion','location','scene_environment','temperature','expression','action','mascot_companions','physical_scale','duplicate','compliance_final'];
const material=p=>({title:String(p.title||'').trim(),headline:String(p.headline||'').trim(),copy:String(p.copy||'').trim(),category:String(p.category||'').trim(),image_url:String(p.image_url||'').trim(),image_alt:String(p.image_alt||'').trim(),image_source:String(p.image_source||'').trim(),image_width:Number(p.image_width||0),image_height:Number(p.image_height||0),image_quality_status:String(p.image_quality_status||'').trim()});
const fingerprint=p=>crypto.createHash('sha256').update(JSON.stringify(material(p))).digest('hex');
function validate(p,gate,link,e,aiReview=null){
  if(!p||!e)throw Error('Missing post or evidence');
  const r=e.remote;if(!r||Number(r.id)===394674560)throw Error('Protected published post');
  if(e.sourceFingerprint!==fingerprint(p)||e.imageSource!==p.image_url)throw Error('Source version changed');
  if(link?.metricool_id&&String(r.uuid)!==String(link.uuid))throw Error('Existing UUID changed; never create again');
  if(r.text!==p.copy||r.publicationDate?.timezone!=='Asia/Taipei'||r.media?.length!==1)throw Error('Copy, timezone or image mismatch');
  if(!/^[0-9a-f]{64}$/.test(e.imageSHA256||''))throw Error('Missing verified image hash');
  const names=['facebook','instagram','threads'];if(!names.every(n=>r.providers?.some(x=>x.network===n))||r.providers.length!==3)throw Error('Three platforms required');
  if(e.result==='draft'){if(p.status!=='pending_review'||r.draft!==true||r.autoPublish!==false)throw Error('Unreviewed content must remain draft');return'pending_review'}
  const checks=JSON.parse(gate?.checklist_json||'{}');
  const human=gate&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gate.reviewed_by)&&gate.reviewed_by===p.approved_by&&gate.content_fingerprint===e.sourceFingerprint&&gate.copy_image_match===1&&keys.every(k=>checks[k]===true);
  let ai=false;
  if(aiReview?.decision==='AI_APPROVED'&&aiReview.policy_version==='2026-10-13-ai-evidence-v1'&&p.approved_by===aiReview.authorized_by&&String(p.review_note||'').startsWith('AI審核：AI_APPROVED；')){const evidence=JSON.parse(aiReview.evidence_json);ai=aiEvidence.assess(evidence,p.id,e.sourceFingerprint,p.image_url).decision==='AI_APPROVED'&&evidence.image_sha256===e.imageSHA256;}
  if(!human&&!ai)throw Error('Verified human or complete AI evidence required');
  if(!['approved','scheduled','manual_required'].includes(p.status))throw Error('Post not approved or already published');
  if(e.result==='scheduled'){
    const local=new Date(Date.parse(e.publicationAt)+8*3600000).toISOString().slice(0,19);
    if(local!==r.publicationDate.dateTime||Date.parse(e.publicationAt)<=Date.parse(e.verifiedAt)||r.draft!==false||r.autoPublish!==true||r.instagramData?.autoPublish!==true)throw Error('Saved schedule settings invalid');
    return'scheduled';
  }
  if(e.result!=='result')throw Error('Unknown evidence type');
  for(const x of r.providers){if(x.status==='PUBLISHED'){const u=new URL(x.publicUrl||'');const allowed={facebook:['facebook.com','www.facebook.com','fb.com'],instagram:['instagram.com','www.instagram.com'],threads:['threads.com','www.threads.com','threads.net','www.threads.net']};if(u.protocol!=='https:'||!allowed[x.network].includes(u.hostname)||!x.id)throw Error('Published platform requires its actual URL and remote ID')}}
  return r.providers.every(x=>x.status==='PUBLISHED')?'published':r.providers.some(x=>x.status==='ERROR')?'failed':'awaiting_verification';
}
module.exports={fingerprint,validate};
