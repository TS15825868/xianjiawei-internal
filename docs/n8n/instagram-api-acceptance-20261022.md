# Instagram official API acceptance — 2026-10-22

This record contains no credentials or customer comment text.

## Verified

- User saved one n8n HTTP Bearer Auth credential, restricted to graph.instagram.com.
- GET /v25.0/me returned username xianjiawei.tw and user_id 17841478328163000. App-scoped id was also returned; it is not substituted for the verified user_id.
- Identity-only n8n workflow GCsknLdrK81wi4qp completed all three nodes.
- Isolated comments workflow PCN2mDcrCj8oDo08 is imported, saved, inactive, GET-only, and saves neither successful nor failed execution payloads.
- Media enumeration identified two posts with nonzero comments_count. Both comments queries returned an empty data array. No actual comment text or brand reply was obtained via this token.
- The summary explicitly separates commentsEndpointResponded=true from commentReadVerified=false. Full history, human attribution, reply capability and E2E remain false.
- A missing credential binding on the comment node was corrected through the n8n UI; the subsequent complete run reached the summary.
- 26 existing policy/storage tests passed again.
- Database inventory: original four workflows retain three active monitors and inactive immediate publishing. Three added read-only/QA workflows remain inactive. One httpBearerAuth credential exists; no PostgreSQL credential exists.
- All xjw_social.platform_control send switches remain false. comment_ledger remains empty.

## Not verified / blockers

- Empty comment data despite nonzero counts requires access-scope/App-mode investigation; no specific cause is established.
- Token expiry and exact granted scopes have not yet been established.
- Facebook and Threads official API identity, tokens and reply receipts remain unverified.
- The private Supabase schema exists, but a least-privilege n8n PostgreSQL credential is not yet bound. No restart/concurrency E2E through n8n is claimed.
- No official webhook, controlled reply receipt, or low-risk auto-send acceptance is complete.
- Meta page observation was restricted by browser credential protection; no bypass or further secret inspection was attempted.

## Preservation

No original workflow, Meta automation, Metricool schedule, posting system, subscription or paid resource was modified. All automatic customer sends remain disabled. No customer test reply was sent. Extra spend: NT$0 / US$0.
