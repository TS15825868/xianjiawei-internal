#!/usr/bin/env node
// Runs only in the manually approved backup preflight. Fetches table names,
// never customer data or sample rows, and writes a private runner-local JSON.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const METADATA_SQL = "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name";

export function verifyLiveTableInventory(payload) {
  if (payload?.success !== true || !Array.isArray(payload.result) || payload.result.length !== 1) {
    throw Error('LIVE_D1_TABLE_INVENTORY_QUERY_FAILED');
  }
  const item=payload.result[0];
  if (item?.success !== true || !Array.isArray(item.results) ||
      !Number.isSafeInteger(item?.meta?.rows_read) ||
      item?.meta?.rows_written !== 0) {
    throw Error('LIVE_D1_TABLE_INVENTORY_RESULT_UNTRUSTED');
  }
  const names=item.results.map(x=>x?.name);
  if (names.length < 3 || names.length > 500 ||
      names.some(x=>typeof x !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(x)) ||
      new Set(names).size !== names.length) {
    throw Error('LIVE_D1_TABLE_INVENTORY_INCOMPLETE_OR_INVALID');
  }
  const required=['business_inquiries','business_inquiry_drafts','business_inquiry_crm_delivery'];
  if (required.some(x=>!names.includes(x))) throw Error('LIVE_D1_B2B_SCHEMA_INCOMPLETE');
  return {
    schema:'xjw-private-live-d1-table-inventory-v1',
    table_names:names.sort(),
    table_count:names.length,
    rows_read:item.meta.rows_read,
    rows_written:0,
    customer_rows_retrieved:0,
    purpose:'Full backup schema completeness comparison only, no customer data read'
  };
}

export async function captureD1LiveTableInventory({token,accountId,databaseId,output,transport=fetch}={}) {
  if (!token || !/^[0-9a-f]{32}$/i.test(accountId||'') ||
      !/^[0-9a-f-]{36}$/i.test(databaseId||'') || !output) throw Error('LIVE_D1_INVENTORY_INPUT_MISSING');
  const url='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/d1/database/'+databaseId+'/query';
  const r=await transport(url,{method:'POST',headers:{
    Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'
  },body:JSON.stringify({sql:METADATA_SQL}),signal:AbortSignal.timeout(15_000)});
  if (!r?.ok) throw Error('LIVE_D1_INVENTORY_HTTP_ERROR');
  const value=verifyLiveTableInventory(await r.json());
  writeFileSync(output,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});
  return {table_count:value.table_count,rows_read:value.rows_read,rows_written:0};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config=readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8');
    const databaseId=config.match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/i)?.[1];
    const out=await captureD1LiveTableInventory({
      token:process.env.CLOUDFLARE_API_TOKEN,
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      databaseId,
      output:process.env.LIVE_D1_TABLE_INVENTORY_PATH
    });
    console.log(JSON.stringify({status:'metadata_only',table_count:out.table_count,
      d1_rows_read:out.rows_read,d1_rows_written:0}));
  } catch(error) {
    console.error('D1 table inventory fail-closed: '+String(error?.message||'unknown'));
    process.exitCode=2;
  }
}
