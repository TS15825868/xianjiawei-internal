// Separate standalone Apps Script project. Do NOT replace the existing retail CRM Code.gs.
var B2B_SCOPE = 'xjw-b2b-crm-v2';
var B2B_TAB = 'B2B商家合作';
var B2B_HEADERS = ['合作編號','事件雜湊','收件時間','來源','入口','合作類型','商家與聯絡方式','需求'];
function b2bJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function b2bHex_(bytes) { return bytes.map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join(''); }
function b2bEqual_(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  var result=0; for(var i=0;i<a.length;i++) result|=a.charCodeAt(i)^b.charCodeAt(i);
  return result===0;
}
function b2bCell_(s) { return /^[\s]*[=+\-@]/.test(s)? "'"+s:s; }
function b2bValid_(p) {
  return p && /^B2B-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.id||'') &&
    p.source==='LINE' && typeof p.receivedAt==='string' && Number.isFinite(Date.parse(p.receivedAt)) &&
    new Date(p.receivedAt).toISOString()===p.receivedAt &&
    (p.origin===null||typeof p.origin==='string'&&/^website:[a-z0-9_-]{1,48}$/.test(p.origin)) &&
    ['批發採購','經銷','通路寄賣','產品開發','鹿角原料','品牌異業','其他合作'].indexOf(p.category)>=0 &&
    typeof p.businessContact==='string'&&p.businessContact.trim().length>0&&p.businessContact.length<=300 &&
    typeof p.details==='string'&&p.details.trim().length>0&&p.details.length<=400;
}
// Run once manually in the separate project, first against an isolated spreadsheet.
function setupB2bCrmSheet() {
  var props=PropertiesService.getScriptProperties();
  var id=props.getProperty('XJW_B2B_CRM_SPREADSHEET_ID');
  if(!id) throw Error('Missing target spreadsheet');
  var lock=LockService.getScriptLock(); lock.waitLock(10000);
  try {
    var ss=SpreadsheetApp.openById(id);
    var sheet=ss.getSheetByName(B2B_TAB);
    if(!sheet) sheet=ss.insertSheet(B2B_TAB);
    if(sheet.getLastRow()===0){sheet.getRange(1,1,1,B2B_HEADERS.length).setValues([B2B_HEADERS]);sheet.setFrozenRows(1);}
    if(JSON.stringify(sheet.getRange(1,1,1,B2B_HEADERS.length).getValues()[0])!==JSON.stringify(B2B_HEADERS)) throw Error('Unexpected B2B headers');
    SpreadsheetApp.flush();
  } finally {lock.releaseLock();}
}
function doPost(e) {
  var props=PropertiesService.getScriptProperties();
  var secret=props.getProperty('XJW_B2B_CRM_SECRET');
  var spreadsheetId=props.getProperty('XJW_B2B_CRM_SPREADSHEET_ID');
  var lock=null;
  try {
    var enabled=props.getProperty('XJW_B2B_CRM_ENABLED')==='true';
    if(!secret||secret.length<32||!spreadsheetId) return b2bJson_({ok:false,error:'disabled'});
    var raw=(e&&e.postData&&e.postData.contents)||'';
    if(raw.length>8192) return b2bJson_({ok:false,error:'invalid'});
    var envelope=JSON.parse(raw);
    if(!/^\d{13}$/.test(envelope.timestamp||'')||Math.abs(Date.now()-Number(envelope.timestamp))>300000||
       typeof envelope.payload!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature||'')) return b2bJson_({ok:false,error:'invalid'});
    var expected=b2bHex_(Utilities.computeHmacSha256Signature(B2B_SCOPE+'\n'+envelope.timestamp+'\n'+envelope.payload,secret,Utilities.Charset.UTF_8));
    if(!b2bEqual_(expected,envelope.signature)) return b2bJson_({ok:false,error:'invalid'});
    var p=JSON.parse(envelope.payload);
    // The exact signed read-only probe also works when receipt writes are disabled.
    // Never reveal a spreadsheet ID, customer records, or spreadsheet values.
    if(p && p.action==='readiness'){
      if(Object.keys(p).length!==2||typeof p.nonce!=='string'||!/^[a-f0-9]{32}$/.test(p.nonce)) return b2bJson_({ok:false,error:'invalid'});
      var target=b2bHex_(Utilities.computeHmacSha256Signature(B2B_SCOPE+'\nreadiness-target\n'+spreadsheetId,secret,Utilities.Charset.UTF_8));
      var readySheet=SpreadsheetApp.openById(spreadsheetId).getSheetByName(B2B_TAB);
      if(!readySheet||JSON.stringify(readySheet.getRange(1,1,1,B2B_HEADERS.length).getValues()[0])!==JSON.stringify(B2B_HEADERS)) return b2bJson_({ok:false,error:'sheet_unavailable'});
      return b2bJson_({ok:true,action:'readiness',version:B2B_SCOPE,nonce:p.nonce,targetProof:target,enabled:enabled});
    }
    if(!enabled) return b2bJson_({ok:false,error:'disabled'});
    if(!b2bValid_(p)) return b2bJson_({ok:false,error:'invalid'});
    var target=b2bHex_(Utilities.computeHmacSha256Signature(B2B_SCOPE+'\nreadiness-target\n'+spreadsheetId,secret,Utilities.Charset.UTF_8));
    if(!b2bEqual_(p.targetProof,target)) return b2bJson_({ok:false,id:p.id,version:B2B_SCOPE,error:'target_mismatch'});
    var digest=b2bHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,envelope.payload,Utilities.Charset.UTF_8));
    lock=LockService.getScriptLock();lock.waitLock(10000);
    var sheet=SpreadsheetApp.openById(spreadsheetId).getSheetByName(B2B_TAB);
    if(!sheet||JSON.stringify(sheet.getRange(1,1,1,B2B_HEADERS.length).getValues()[0])!==JSON.stringify(B2B_HEADERS)) return b2bJson_({ok:false,error:'sheet_unavailable'});
    var last=sheet.getLastRow();
    if(last>1){
      var ids=sheet.getRange(2,1,last-1,2).getValues();
      var found=ids.filter(function(row){return row[0]===p.id;});
      if(found.length) {
        if(found.length!==1||found[0][1]!==digest) return b2bJson_({ok:false,id:p.id,version:B2B_SCOPE,targetProof:target,error:'id_conflict'});
        return b2bJson_({ok:true,id:p.id,version:B2B_SCOPE,targetProof:target,duplicate:true});
      }
    }
    sheet.getRange(last+1,1,1,B2B_HEADERS.length).setValues([[p.id,digest,p.receivedAt,p.source,p.origin||'',p.category,b2bCell_(p.businessContact),b2bCell_(p.details)]]);
    SpreadsheetApp.flush();
    return b2bJson_({ok:true,id:p.id,version:B2B_SCOPE,targetProof:target,duplicate:false});
  } catch(err) { return b2bJson_({ok:false,error:'unavailable'}); }
  finally {if(lock)try{lock.releaseLock();}catch(ignore){}}
}
