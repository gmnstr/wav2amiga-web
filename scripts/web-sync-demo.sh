#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
DIST_DIR="$WEB_DIR/dist"
DOCS_APP_DIR="$ROOT/docs/app"

MODE="${1:-sync}"

usage() {
  cat <<'EOF'
Usage:
  scripts/web-sync-demo.sh sync   # Build web app and copy dist -> docs/app
  scripts/web-sync-demo.sh check  # Build web app and verify docs/app matches dist
EOF
}

build_web() {
  pnpm --dir "$WEB_DIR" run build
}

sync_demo() {
  mkdir -p "$DOCS_APP_DIR/assets"
  rm -rf "$DOCS_APP_DIR/assets"
  mkdir -p "$DOCS_APP_DIR/assets"
  cp -R "$DIST_DIR/assets/." "$DOCS_APP_DIR/assets/"
  cp "$DIST_DIR/index.html" "$DOCS_APP_DIR/index.html"
  echo "Synced docs/app from apps/web/dist"
}

check_demo() {
  if diff -qr --exclude '.DS_Store' "$DIST_DIR" "$DOCS_APP_DIR" >/dev/null; then
    echo "docs/app is in sync with apps/web/dist"
    return 0
  fi

  echo "docs/app is out of sync with apps/web/dist"
  echo "Run: pnpm run web:sync-demo"
  diff -qr --exclude '.DS_Store' "$DIST_DIR" "$DOCS_APP_DIR" || true
  return 1
}

case "$MODE" in
  sync)
    build_web
    sync_demo
    ;;
  check)
    build_web
    check_demo
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
