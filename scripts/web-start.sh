#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/out"
PID_FILE="$OUT/pids/web-dev.pid"
LOG_FILE="$OUT/logs/web-dev.log"

mkdir -p "$OUT/pids" "$OUT/logs"

# If already running, exit cleanly
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE" || true)"
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "Web dev server already running (pid $PID)."
    exit 0
  else
    rm -f "$PID_FILE"
  fi
fi

# Start Vite dev server in background on :5173
nohup pnpm -w --filter @wav2amiga/web dev -- --host --port 5173 >>"$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"

echo "Web dev server starting on http://localhost:5173 (pid $(cat "$PID_FILE"))."
echo "Logs: $LOG_FILE"
