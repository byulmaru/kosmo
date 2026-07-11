#!/bin/sh
set -eu

case "${1:-web}" in
  web)
    cd /app/apps/web
    exec node --import tsx src/server/index.ts
    ;;
  api)
    cd /app/apps/api
    exec node --import tsx src/index.ts
    ;;
  *)
    echo "Unknown app: $1" >&2
    exit 1
    ;;
esac
