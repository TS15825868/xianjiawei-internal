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
# Observed Render Free starts sometimes exceed the default 180s broker grant
# lifetime: expired grant tokens return a WebSocket 403 to the JS runner.
# n8n 2.35.x supports the broker TTL setting. This bounded fallback only
# addresses slow startup; it cannot repair PostgreSQL/TLS or memory exhaustion.
# Allow the existing operator configuration to take precedence.
: "${N8N_RUNNERS_GRANT_TOKEN_TTL:=300}"
# n8n itself is a separate Node.js process. On a 512 MiB free instance,
# constrain its old-space heap independently of task-runner limits. This cannot
# bound native/child-process RSS and is NOT proof of OOM recovery.
# Explicit NODE_OPTIONS supplied by an operator always wins.
: "${NODE_OPTIONS:=--max-old-space-size=256}"
export NODE_OPTIONS N8N_CONCURRENCY_PRODUCTION_LIMIT N8N_RUNNERS_MAX_CONCURRENCY N8N_RUNNERS_MAX_OLD_SPACE_SIZE N8N_RUNNERS_GRANT_TOKEN_TTL
exec n8n start
