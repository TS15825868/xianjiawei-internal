#!/bin/sh
set -eu
# Conservative defaults; retain protected platform settings when provided.
# No pruning, historical data deletion, TLS override or send switch is changed.
: "${N8N_CONCURRENCY_PRODUCTION_LIMIT:=1}"
: "${N8N_RUNNERS_MAX_CONCURRENCY:=1}"
export N8N_CONCURRENCY_PRODUCTION_LIMIT N8N_RUNNERS_MAX_CONCURRENCY
exec n8n start
