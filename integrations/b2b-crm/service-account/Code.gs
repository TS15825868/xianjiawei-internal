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
function b2bValid_(p) {
  return p && /^B2B-[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(p.id||'') &&
    p.source==='LINE' && typeof p.receivedAt==='string' && Number.isFinite(Date.parse(p.receivedAt)) &&
    new Date(p.receivedAt).toISOString()===p.receivedAt &&
    (p.origin===null||typeof p.origin==='string'&&/^website:[a-z0-9_-]{1,48}$/.test(p.origin)) &&
    ['批發採購','經銷','通路寄賣','產品開發','鹿角原料','品牌異業','其他合作'].indexOf(p.category)>=0 &&
    typeof p.businessContact==='string'&&p.businessContact.trim().length>0&&p.businessContact.length<=300 &&
    typeof p.details==='string'&&p.details.trim().length>0&&p.details.length<=400;
}
// Replacement source for the separate B2B Web App. Owner OAuth uses only
// script.external_request. Share only the approved file with the dedicated
// service account, with no project-wide roles or domain-wide delegation.
function b2bGoogleJson_(url, options) {
  var response = UrlFetchApp.fetch(url, Object.assign({
    muteHttpExceptions: true, followRedirects: false
  }, options));
  if (response.getResponseCode() !== 200) throw Error('Google API request failed');
  return JSON.parse(response.getContentText());
}
function b2bServiceToken_(props) {
  var email = props.getProperty('XJW_B2B_SHEETS_SERVICE_EMAIL');
  var key = props.getProperty('XJW_B2B_SHEETS_SERVICE_PRIVATE_KEY');
  if (!email || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(email) || !key) {
    throw Error('Missing dedicated Sheets credentials');
  }
  var tokenUrl = 'https://oauth2.googleapis.com/token';
  var now = Math.floor(Date.now()/1000);
  var encode = function(value) {
    return Utilities.base64EncodeWebSafe(value).replace(/=+$/, '');
  };
  var header = encode(JSON.stringify({alg:'RS256',typ:'JWT'}));
  var claims = encode(JSON.stringify({
    iss:email, scope:'https://www.googleapis.com/auth/spreadsheets',
    aud:tokenUrl, iat:now, exp:now+600
  }));
  var assertion = header+'.'+claims;
  assertion += '.'+encode(Utilities.computeRsaSha256Signature(assertion,key));
  var result = b2bGoogleJson_(tokenUrl,{
    method:'post', payload:{grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:assertion}
  });
  if (typeof result.access_token !== 'string' || !result.access_token) throw Error('Missing token');
  return result.access_token;
}
function b2bSheet_(props) {
  var id = props.getProperty('XJW_B2B_CRM_SPREADSHEET_ID');
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw Error('Missing approved spreadsheet');
  var token = b2bServiceToken_(props);
  var base = 'https://sheets.googleapis.com/v4/spreadsheets/'+id+'/values/';
  var headers = {Authorization:'Bearer '+token};
  function range(cells) {
    return base+encodeURIComponent("'"+B2B_TAB+"'!"+cells);
  }
  return {
    values:function(cells) {
      return b2bGoogleJson_(range(cells),{headers:headers}).values || [];
    },
    append:function(row) {
      var result = b2bGoogleJson_(range('A1:H')+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',{
        method:'post', headers:headers, contentType:'application/json',
        payload:JSON.stringify({values:[row]})
      });
      if (!result.updates || result.updates.updatedRows !== 1) throw Error('Append not confirmed');
    }
  };
}
function setupB2bCrmSheet() {
  var props = PropertiesService.getScriptProperties();
  if (JSON.stringify(b2bSheet_(props).values('A1:H1')[0]) !== JSON.stringify(B2B_HEADERS)) {
    throw Error('Unexpected B2B headers');
  }
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
      var readySheet=b2bSheet_(props);
      if(JSON.stringify(readySheet.values('A1:H1')[0])!==JSON.stringify(B2B_HEADERS)) return b2bJson_({ok:false,error:'sheet_unavailable'});
      return b2bJson_({ok:true,action:'readiness',version:B2B_SCOPE,nonce:p.nonce,targetProof:target,enabled:enabled});
    }
    if(!enabled) return b2bJson_({ok:false,error:'disabled'});
    if(!b2bValid_(p)) return b2bJson_({ok:false,error:'invalid'});
    var target=b2bHex_(Utilities.computeHmacSha256Signature(B2B_SCOPE+'\nreadiness-target\n'+spreadsheetId,secret,Utilities.Charset.UTF_8));
    if(!b2bEqual_(p.targetProof,target)) return b2bJson_({ok:false,id:p.id,version:B2B_SCOPE,error:'target_mismatch'});
    var digest=b2bHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,envelope.payload,Utilities.Charset.UTF_8));
    lock=LockService.getScriptLock();lock.waitLock(10000);
    var sheet=b2bSheet_(props);
    if(JSON.stringify(sheet.values('A1:H1')[0])!==JSON.stringify(B2B_HEADERS)) return b2bJson_({ok:false,error:'sheet_unavailable'});
    var ids=sheet.values('A2:B');
    if(ids.length){
      var found=ids.filter(function(row){return row[0]===p.id;});
      if(found.length) {
        if(found.length!==1||found[0][1]!==digest) return b2bJson_({ok:false,id:p.id,version:B2B_SCOPE,targetProof:target,error:'id_conflict'});
        return b2bJson_({ok:true,id:p.id,version:B2B_SCOPE,targetProof:target,duplicate:true});
      }
    }
    sheet.append([p.id,digest,p.receivedAt,p.source,p.origin||'',p.category,p.businessContact,p.details]);
    return b2bJson_({ok:true,id:p.id,version:B2B_SCOPE,targetProof:target,duplicate:false});
  } catch(err) { return b2bJson_({ok:false,error:'unavailable'}); }
  finally {if(lock)try{lock.releaseLock();}catch(ignore){}}
}
