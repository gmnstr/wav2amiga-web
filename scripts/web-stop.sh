#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/out"
PID_FILE="$OUT/pids/web-dev.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No pid file found. Web dev server not running?"
  exit 0
fi

PID="$(cat "$PID_FILE" || true)"
if [[ -z "${PID:-}" ]]; then
  rm -f "$PID_FILE"
  echo "Stale pid file removed."
  exit 0
fi

# Graceful stop, then hard kill if needed
if kill -TERM "$PID" 2>/dev/null; then
  for _ in {1..50}; do
    sleep 0.1
    if ! kill -0 "$PID" 2>/dev/null; then
      rm -f "$PID_FILE"
      echo "Web dev server stopped."
      exit 0
    fi
  done
  kill -KILL "$PID" 2>/dev/null || true
fi

rm -f "$PID_FILE"
echo "Web dev server stopped."
