#!/bin/sh
set -eu

case "${1:-web}" in
  web)
    cd /app/apps/web
    exec node --import tsx dist/server/index.mjs
    ;;
  api)
    cd /app/apps/api
    exec node --import tsx dist/server/index.mjs
    ;;
  migrate)
    cd /app/packages/core
    exec node --import tsx db/migrate.ts
    ;;
  *)
    echo "Unknown app: $1" >&2
    exit 1
    ;;
esac
