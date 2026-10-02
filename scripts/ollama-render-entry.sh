#!/bin/bash
set -euo pipefail

export OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

ollama serve &
SERVE_PID=$!

for i in $(seq 1 60); do
  if curl -sf "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if [ -n "${OLLAMA_MODELS:-}" ]; then
  IFS=',' read -ra PULL_LIST <<< "${OLLAMA_MODELS}"
  for model in "${PULL_LIST[@]}"; do
    trimmed="$(echo "$model" | xargs)"
    if [ -n "$trimmed" ]; then
      ollama pull "$trimmed"
    fi
  done
fi

exec node /app/scripts/ollama-auth-proxy.mjs
