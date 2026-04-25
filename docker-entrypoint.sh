#!/bin/sh
set -eu

app="${1:-expo}"
app_dir="/app/apps/${app}"

if [ ! -d "${app_dir}" ]; then
  echo "Unknown app: ${app}" >&2
  exit 1
fi

cd "${app_dir}"
exec bun run start
