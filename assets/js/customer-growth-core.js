/* Internal management only: no sending or external data transfer. */
(function(root,factory){const core=factory();if(typeof module==='object'&&module.exports)module.exports=core;else root.XJWCustomerGrowth=core;})(globalThis,function(){
'use strict';
const stages={new:'新名單',researching:'了解中',contacted:'已聯絡',follow_up:'持續跟進',trial:'試喝／樣品',customer:'已成交',repeat:'回購',dormant:'暫緩'};
const fields={customer_type:'客戶類型',lifecycle_stage:'客戶階段',intent_level:'意向程度',source_detail:'來源細分',campaign_tag:'活動標籤',lead_origin:'來源網址／說明',line_oa_status:'LINE OA 狀態',interest_products:'關注產品',preferred_channel:'聯絡方式',contact_permission:'聯絡限制',contact_permission_evidence:'同意來源／紀錄編號（勿填敏感資料）',last_contact_date:'上次聯絡日',next_follow_up_date:'下次跟進日',next_action:'下一步',owner:'負責人',referral_source:'轉介紹來源（自願提供）'};
const options={customer_type:{B2C:'一般顧客',B2B:'商家合作',partner:'合作夥伴',other:'其他'},lifecycle_stage:stages,intent_level:{low:'低',medium:'中',high:'高'},line_oa_status:{connected:'已加入',not_connected:'尚未加入',unknown:'未確認'},preferred_channel:{'LINE OA':'LINE OA','電話':'電話','Email':'Email','現場':'現場'},contact_permission:{reply_only:'只回覆主動詢問',normal:'已確認可主動聯絡',do_not_contact:'停止主動聯絡'}};
const text=x=>String(x??'').trim();
const validDay=x=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(text(x)))return false;const d=new Date(x+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x};
function canFollowUp(c){return c?.contact_permission==='normal'&&!!text(c.contact_permission_evidence)&&!!text(c.preferred_channel)&&c.lifecycle_stage!=='dormant'}
function validate(c){if(c.contact_permission==='normal'&&(!text(c.contact_permission_evidence)||!text(c.preferred_channel)))return '可主動聯絡須記錄同意來源及聯絡方式；未確認請設只回覆或未設定。';for(const k of ['last_contact_date','next_follow_up_date'])if(text(c[k])&&!validDay(c[k]))return '聯絡日期格式錯誤';return ''}
function summarize(items,today){if(!Array.isArray(items)||!validDay(today))throw Error('客戶資料或日期不合法');const counts={all:items.length,classified:0,trial:0,customer:0,repeat:0,unknown:0,unclassified:0,consented:0,due:0,held:0,referral:0};const sources=new Map(),due=[];
for(const c of items){const stage=text(c.lifecycle_stage),known=Object.hasOwn(stages,stage),allowed=canFollowUp(c),source=text(c.source)||'未標記';const g=sources.get(source)||{source,total:0,classified:0,trial:0,customer:0,repeat:0};g.total++;counts.classified+=known?1:0;g.classified+=known?1:0;counts.unclassified+=known?0:1;
if(stage==='trial'){counts.trial++;g.trial++}if(stage==='customer'||stage==='repeat'){counts.customer++;g.customer++}if(stage==='repeat'){counts.repeat++;g.repeat++}
if(!['normal','reply_only','do_not_contact'].includes(c.contact_permission)||c.contact_permission==='normal'&&!allowed)counts.unknown++;
if(allowed)counts.consented++;else counts.held++;if(text(c.referral_source))counts.referral++;
if(allowed&&known&&validDay(c.next_follow_up_date)&&c.next_follow_up_date<=today){due.push(c);counts.due++}sources.set(source,g);}
due.sort((a,b)=>a.next_follow_up_date.localeCompare(b.next_follow_up_date)||Number(b.intent_level==='high')-Number(a.intent_level==='high')||text(a.id).localeCompare(text(b.id)));
return {counts,sources:[...sources.values()].sort((a,b)=>b.total-a.total||a.source.localeCompare(b.source)),due};}
return {fields,options,stages,validDay,canFollowUp,validate,summarize};
});
