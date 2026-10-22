const {test}=require('node:test');
const assert=require('node:assert/strict');
const {exactAllowedAccount}=require('./account-allowlist.cjs');

test('only complete string IDs in a well-formed array are authorized',()=>{
 const authorized={instagram:['17841478328163000']};
 assert.equal(exactAllowedAccount(authorized,'instagram','17841478328163000'),true);
 assert.equal(exactAllowedAccount(authorized,'instagram','1784147832816300'),false);
 assert.equal(exactAllowedAccount(authorized,'facebook','17841478328163000'),false);
 assert.equal(exactAllowedAccount(authorized,'instagram',17841478328163000),false);
});
test('malformed string lists never authorize by substring',()=>{
 assert.equal(exactAllowedAccount({instagram:'00017841478328163000999'},'instagram','17841478328163000'),false);
 assert.equal(exactAllowedAccount({instagram:['17841478328163000',123]},'instagram','17841478328163000'),false);
 assert.equal(exactAllowedAccount({instagram:null},'instagram','17841478328163000'),false);
 assert.equal(exactAllowedAccount({},'instagram','17841478328163000'),false);
});
