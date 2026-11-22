#!/usr/bin/env node
// Production export prerequisite: D1 Insights metadata GET only, never D1 SQL.
// This is a conservative, account-wide gate, not a guarantee of future quota.
import { pathToFileURL } from 'node:url';

export const DAILY_FREE_ROWS_READ = 5_000_000;
export const EXPORT_SAFETY_RESERVE = 1_000_000;
export const MAX_ROWS_BEFORE_EXPORT = DAILY_FREE_ROWS_READ - EXPORT_SAFETY_RESERVE;

const validInt = n => Number.isSafeInteger(n) && n >= 0;
const requireValid = (ok, reason) => { if (!ok) throw new Error(reason); };

export function checkD1ExportBudget(response, {now = new Date(),since,limit = 1000} = {}) {
  requireValid(response?.success === true && Array.isArray(response.result), 'D1_INSIGHTS_UNAVAILABLE');
  requireValid(Number.isInteger(limit) && limit >= 1 && limit <= 1000, 'D1_INSIGHTS_LIMIT_INVALID');
  requireValid(response.result.length < limit, 'D1_INSIGHTS_INCOMPLETE_DATABASE_LIST');
  requireValid(validInt(response.result_info?.count) &&
    response.result_info.count === response.result.length, 'D1_INSIGHTS_COUNT_UNVERIFIED');
  const start = since || new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const window = response.result_info?.query_window;
  requireValid(Date.parse(window?.from) === Date.parse(start), 'D1_INSIGHTS_WRONG_DAY');
  const end = Date.parse(window?.to);
  requireValid(Number.isFinite(end) && end >= Date.parse(start) &&
    end <= now.getTime() + 5*60_000 && now.getTime() - end <= 15*60_000,
    'D1_INSIGHTS_STALE_OR_FUTURE');
  let rowsRead=0, rowsWritten=0;
  for (const db of response.result) {
    requireValid(typeof db.database_id === 'string' && db.database_id.length > 0 &&
      validInt(db.rows_read) && validInt(db.rows_written), 'D1_INSIGHTS_UNRELIABLE_ROW');
    rowsRead += db.rows_read;
    rowsWritten += db.rows_written;
    requireValid(Number.isSafeInteger(rowsRead) && Number.isSafeInteger(rowsWritten),
      'D1_INSIGHTS_TOTAL_OVERFLOW');
  }
  return {
    checked_by:'official_cloudflare_d1_insights_only',
    database_count:response.result.length,
    account_rows_read:rowsRead,
    account_rows_written:rowsWritten,
    maximum_rows_read_before_export:MAX_ROWS_BEFORE_EXPORT,
    budget_reserved_rows:EXPORT_SAFETY_RESERVE,
    allow_export:rowsRead <= MAX_ROWS_BEFORE_EXPORT,
    reason:rowsRead <= MAX_ROWS_BEFORE_EXPORT?'UNDER_CONSERVATIVE_ACCOUNT_QUOTA':'NEAR_FREE_QUOTA_LIMIT',
    production_d1_sql_queries:0,
    warning:'Insights data can lag; owner approval, independent backup integrity and isolated restore still required.'
  };
}

export async function queryD1ExportBudget({token,accountId,now=new Date(),transport=fetch}={}) {
  requireValid(typeof token === 'string' && token.length > 0 &&
    /^[a-f0-9]{32}$/i.test(accountId||''), 'D1_INSIGHTS_CREDENTIALS_MISSING');
  const since = new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())).toISOString();
  const url = new URL('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/d1/insights/databases');
  url.searchParams.set('since',since);
  url.searchParams.set('limit','1000');
  url.searchParams.set('order_by','rows_read');
  const response=await transport(url,{method:'GET',
    headers:{authorization:'Bearer '+token,accept:'application/json'},
    signal:AbortSignal.timeout(12_000)});
  requireValid(response?.ok, 'D1_INSIGHTS_HTTP_UNAVAILABLE');
  const payload=await response.json();
  return checkD1ExportBudget(payload,{now,since,limit:1000});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result=await queryD1ExportBudget({
      token:process.env.CLOUDFLARE_API_TOKEN,
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID
    });
    console.log(JSON.stringify(result));
    if (!result.allow_export) process.exitCode=2;
  } catch (error) {
    console.error('D1 budget check fail-closed: '+String(error?.message||'unknown'));
    process.exitCode=2;
  }
}
