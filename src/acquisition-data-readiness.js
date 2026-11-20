// Internal aggregate only. No customer rows, credentials, payment amounts or external requests.
const HEADERS={'cache-control':'no-store','content-type':'application/json; charset=utf-8','x-content-type-options':'nosniff'};
const out=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const fail=(code,status)=>out({ok:false,code,readOnly:true},status);
export const acquisitionPath='/api/acquisition-data-readiness';
export const countSql=`SELECT
 (SELECT COUNT(*) FROM customers) AS relationalCustomers,
 (SELECT COUNT(*) FROM orders) AS relationalOrders,
 (SELECT COUNT(*) FROM app_records WHERE module='customers' AND archived=0) AS activeCustomerRecords,
 (SELECT COUNT(*) FROM app_records WHERE module='orders' AND archived=0) AS activeOrderRecords,
 (SELECT COUNT(*) FROM business_inquiries) AS businessInquiries,
 (SELECT COUNT(*) FROM business_inquiry_crm_delivery) AS businessCrmDeliveryRows,
 (SELECT COUNT(*) FROM xjw_line_receipt_inbox) AS lineReceiptRows,
 (SELECT COUNT(*) FROM business_inquiries WHERE consultation_status NOT IN ('合作成立','未成立','暫緩')) AS businessOpenInquiries,
 (SELECT COUNT(*) FROM business_inquiries WHERE notification_status='pending') AS businessOwnerNotificationPending,
 (SELECT COUNT(*) FROM business_inquiries WHERE notification_status='uncertain') AS businessOwnerNotificationUncertain,
 (SELECT COUNT(*) FROM business_inquiries WHERE notification_status='sending' AND notification_started_at IS NOT NULL AND notification_started_at <= CAST(strftime('%s','now') AS INTEGER)*1000-300000) AS businessOwnerNotificationStale,
 (SELECT COUNT(*) FROM business_inquiry_crm_delivery WHERE state='retry') AS businessCrmRetry,
 (SELECT COUNT(*) FROM business_inquiry_crm_delivery WHERE state='held') AS businessCrmHeld`;
const keys=['relationalCustomers','relationalOrders','activeCustomerRecords','activeOrderRecords','businessInquiries','businessCrmDeliveryRows','lineReceiptRows','businessOpenInquiries','businessOwnerNotificationPending','businessOwnerNotificationUncertain','businessOwnerNotificationStale','businessCrmRetry','businessCrmHeld'];
export async function acquisitionDataReadiness(request,env,{authenticate}={}){
 if(request.method!=='GET')return fail('method_not_allowed',405);
 if(typeof authenticate!=='function')return fail('authentication_unavailable',503);
 let profile;try{profile=await authenticate(request,env)}catch{return fail('access_required',401)}
 if(!['owner','admin'].includes(profile?.role)||Number(profile.active)!==1)return fail('role_denied',403);
 if(!env?.DB?.prepare)return fail('d1_unavailable',503);
 try{
  const row=await env.DB.prepare(countSql).first();
  if(!row||keys.some(key=>!Number.isSafeInteger(row[key])||row[key]<0))return fail('aggregate_unavailable',503);
  const counts=Object.fromEntries(keys.map(key=>[key,row[key]]));
  return out({ok:true,readOnly:true,scope:'d1_storage_counts',counts,checkedAt:new Date().toISOString(),crmOrderSyncVerified:false,paidRevenueVerified:false});
 }catch{return fail('aggregate_unavailable',503)}
}
