#!/bin/sh
set -eu

app="${1:-web}"
app_dir="/app/apps/${app}"

if [ ! -d "${app_dir}" ]; then
  echo "Unknown app: ${app}" >&2
  exit 1
fi

cd "${app_dir}"
if [ "${app}" = "web" ]; then
  exec node build/index.js
fi

if [ "${app}" = "api" ]; then
  exec node --import tsx src/index.ts
fi

exec pnpm start
