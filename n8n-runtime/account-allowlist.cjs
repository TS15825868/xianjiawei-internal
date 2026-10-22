// Only explicitly enumerated account IDs are authorized. A malformed
// allowlist must never use String.includes(), whose substring matching is unsafe.
function exactAllowedAccount(allowedAccounts,platform,accountId){
 const list=allowedAccounts?.[platform];
 return typeof accountId==='string'&&accountId.length>0&&
  Array.isArray(list)&&list.length>0&&
  list.every(id=>typeof id==='string'&&id.length>0)&&
  list.includes(accountId);
}
module.exports={exactAllowedAccount};
