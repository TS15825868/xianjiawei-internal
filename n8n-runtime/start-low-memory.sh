#!/bin/sh
set -eu
# Conservative defaults; retain protected platform settings when provided.
# No pruning, historical data deletion, TLS override or send switch is changed.
: "${N8N_CONCURRENCY_PRODUCTION_LIMIT:=1}"
: "${N8N_RUNNERS_MAX_CONCURRENCY:=1}"
# Cap the JavaScript task-runner old-space heap on Render Free (512 MiB).
# This does not cap total RSS or prove the service will avoid OOM.
# Keep task runners enabled for Code node isolation; do not disable TLS.
: "${N8N_RUNNERS_MAX_OLD_SPACE_SIZE:=128}"
# Observed 2026-10-24 Render cold start: task broker appeared at 07:28:22 UTC,
# JS runner did not register until 07:34:02 UTC (> 300s). The previous 300s
# grant expired with WebSocket 403 during that same slow database startup.
# Allow 480s for one bounded bootstrap, rather than repeated auth failures.
# This does not cure PostgreSQL timeout, memory exhaustion or Render builds.
# Allow the existing operator configuration to take precedence.
: "${N8N_RUNNERS_GRANT_TOKEN_TTL:=480}"
# n8n itself is a separate Node.js process. On a 512 MiB free instance,
# constrain its old-space heap independently of task-runner limits. This cannot
# bound native/child-process RSS and is NOT proof of OOM recovery.
# A separate opt-in build heap may be set for npm install on a low-RAM Render build.
# NEVER apply that build heap to the running n8n process. Without the opt-in,
# retain operator-provided NODE_OPTIONS unchanged for backward compatibility.
if [ "${XJW_N8N_SEPARATE_BUILD_HEAP:-}" = "1" ]; then
  NODE_OPTIONS="${XJW_N8N_RUNTIME_NODE_OPTIONS:---max-old-space-size=256}"
else
  : "${NODE_OPTIONS:=--max-old-space-size=256}"
fi
export NODE_OPTIONS N8N_CONCURRENCY_PRODUCTION_LIMIT N8N_RUNNERS_MAX_CONCURRENCY N8N_RUNNERS_MAX_OLD_SPACE_SIZE N8N_RUNNERS_GRANT_TOKEN_TTL
# npm install may intentionally disable all dependency lifecycle scripts on Free
# to avoid unrelated Kafka native compilation. Always enforce the same source
# policy before n8n starts, including after cold restarts.
node verify-monitor-sources.cjs >&2
exec n8n start
