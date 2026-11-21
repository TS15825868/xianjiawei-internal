// Shared AI operations decision core: deterministic, read-only and fail-closed.
// Consumers may propose actions; this module NEVER publishes, bills or mutates data.
export const BRAIN_POLICY_VERSION='2026-11-22-operations-v1';
const VALID=new Set(['website','line','erp','publishing','social','crm','infrastructure']);
const RISK=new Set(['low','medium','high','critical']);
const ACTIONS=new Set(['investigate','repair','retry','reschedule','replace_content','publish','notify_customer','deploy','update_product','change_billing','delete_data']);
const SENSITIVE=new Set(['publish','notify_customer','deploy','update_product','change_billing','delete_data']);
const score={critical:400,high:300,medium:200,low:100};
const clean=x=>String(x??'').trim();
export function decideOperations(items,{maxActions=20,now=new Date().toISOString()}={}){
 if(!Array.isArray(items)||!Number.isSafeInteger(maxActions)||maxActions<1||!Number.isFinite(Date.parse(now)))return{version:BRAIN_POLICY_VERSION,actions:[],blocked:[{reason:'invalid_input'}]};
 const actions=[],blocked=[],seen=new Set();
 for(const item of items){
  const id=clean(item?.id),system=clean(item?.system),risk=clean(item?.risk),action=clean(item?.action);
  if(!id||!VALID.has(system)||!RISK.has(risk)||!ACTIONS.has(action)){blocked.push({id,reason:'invalid_task'});continue}
  const key=system+':'+id+':'+action;
  if(seen.has(key)){blocked.push({id,reason:'duplicate_task'});continue}
  seen.add(key);
  if(item?.already_completed===true){blocked.push({id,reason:'already_completed'});continue}
  if(item?.external_state_unknown===true){blocked.push({id,reason:'external_state_unknown'});continue}
  if(item?.cost_increase===true||action==='change_billing'){blocked.push({id,reason:'zero_cost_policy'});continue}
  if(item?.latest_main_verified!==true&&['deploy','update_product','delete_data'].includes(action)){blocked.push({id,reason:'latest_main_unverified'});continue}
  if(item?.evidence_verified!==true){blocked.push({id,reason:'evidence_missing'});continue}
  if(SENSITIVE.has(action)&&item?.explicit_authorization!==true){blocked.push({id,reason:'authorization_missing'});continue}
  if(['publish','notify_customer'].includes(action)&&item?.safety_gate_passed!==true){blocked.push({id,reason:'safety_gate_missing'});continue}
  if(action==='publish'&&(item?.media_verified!==true||item?.dedup_verified!==true||item?.quota_verified!==true||item?.delivery_state_verified!==true)){blocked.push({id,reason:'publication_proofs_missing'});continue}
  if(action==='retry'&&item?.idempotent_verified!==true){blocked.push({id,reason:'retry_safety_unverified'});continue}
  if(action==='replace_content'&&item?.review_required!==true){blocked.push({id,reason:'replacement_must_be_reviewed'});continue}
  actions.push({id,system,action,risk,priority:score[risk]+(item?.customer_impact===true?40:0)+(item?.revenue_impact===true?20:0),reason:clean(item?.reason)});
 }
 actions.sort((a,b)=>b.priority-a.priority||a.system.localeCompare(b.system)||a.id.localeCompare(b.id));
 return {version:BRAIN_POLICY_VERSION,actions:actions.slice(0,maxActions),deferred:actions.slice(maxActions),blocked};
}
