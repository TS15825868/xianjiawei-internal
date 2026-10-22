# API repair and worker preparation — 2026-10-22 (Asia/Taipei)

Base main: 916016e1dc6204a0423e3c793b2d0b4660f6494f.

## Actual Instagram diagnostics
- Both sampled media IDs originated from the authenticated official account's GET /v25.0/me/media. IDs were not obtained from a Facebook endpoint.
- Media 18021869576878974 reported comments_count=1; media 18424106062133871 reported comments_count=2. The page contained 44 media and no next-page URL.
- Simplified GET /v25.0/18424106062133871/comments with fields=id,text,username,timestamp and limit=100 still returned data=[] with cursor metadata. Removing replies field expansion did not resolve the problem. No next-page URL was returned.
- GET /v25.0/me/permissions with fields=permission,status returned Bad request: Tried accessing nonexisting field (permissions). This is an unsupported edge, not evidence that the existing token is invalid or that a permission is absent.
- Meta App dashboard visibly says unpublished. App Review shows an unsubmitted draft containing manage_fundraisers, public_profile, Marketing API Access Tier. No customer-service permission approval was established from that page. The draft was not changed or submitted.
- Instagram setup and publication-page observations encounter browser credential protection. No token, App Secret or protected page data was extracted.
- Root cause of empty comments remains UNCONFIRMED. Do not present unpublished mode alone as proof of the cause. Actual granted scopes, expiry, hidden/deleted comment state and role restrictions remain unresolved.
- The existing token was neither rotated nor regenerated.
- All temporary diagnosis URL/field changes in PCN2mDcrCj8oDo08 were restored to me/media, fields=id,comments_count, limit=100. Saved database metadata was reread to verify restoration.

## n8n restart observed
- Execution 131 was interrupted; Render restarted n8n around 13:40 Taiwan. Startup recovery marked it crashed at 13:42. It produced no valid permission result.
- Existing service recovered; no paid upgrade or manual redeploy was performed. The exact restart cause is not established.
- After restart, database inventory still contains original four workflows (three monitors active, immediate publishing inactive), three inactive QA/read-only workflows, and one httpBearerAuth credential.
- This proves retention of n8n configuration/credential metadata only; it does NOT establish application-ledger deduplication after restart.

## Dedicated private ledger worker
- Applied migration xjw_social_worker_least_privilege, source comment-ledger-worker-role.sql.
- xjw_social_worker is NOLOGIN, no password provisioned, NOSUPERUSER/NOCREATEDB/NOCREATEROLE/NOINHERIT/NOBYPASSRLS, connection limit 3.
- Grants are schema usage, control read, ledger read/insert and limited mutable-column updates. No platform_control UPDATE, DELETE/TRUNCATE, account-ID UPDATE, n8n schema access, public-role grant or role membership.
- Seven role-specific RLS policies added. Existing RLS and denial of anon/authenticated remain.
- Privilege queries verified can_update_status=true; can_enable_send=false; can_delete=false; can_change_account=false; n8n_schema=false; rolcanlogin=false.
- Attempted SET LOCAL ROLE validation was denied by the database's role membership protections. No permission bypass or additional role membership was introduced. No successful runtime insert/concurrency result is claimed.
- Supabase official dashboard login succeeded via user's selected GitHub method; project Healthy, Free. Database-settings navigation subsequently required manual handoff due browser credential protection.
- n8n PostgreSQL credential is still absent. Protected password provisioning and credential creation remain necessary before runtime integration tests.

## Safety and remaining scope
All three platform switches remain disabled. No webhook subscription, customer reply, public test post, Meta automation, Metricool schedule, original workflow, paid resource or subscription was changed. No official reply ID obtained. Facebook/Threads API verification, worker connection, concurrency/restart deduplication, controlled receipts and full E2E remain incomplete. Extra spend NT$0 / US$0.
