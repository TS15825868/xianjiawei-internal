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
export N8N_CONCURRENCY_PRODUCTION_LIMIT N8N_RUNNERS_MAX_CONCURRENCY N8N_RUNNERS_MAX_OLD_SPACE_SIZE
exec n8n start
