#!/usr/bin/env bash
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
render_dir="$(mktemp -d)"
trap 'rm -rf "${render_dir}"' EXIT
cd "${chart_dir}"

helm lint . --set env=dev
helm lint . --set env=prod
helm template kosmo . --namespace kosmo-dev --set env=dev >"${render_dir}/dev.yaml"
helm template kosmo . --namespace kosmo-prod --set env=prod >"${render_dir}/prod.yaml"

backup_markers=(
  "apiVersion: barmancloud.cnpg.io/v1"
  "kind: ScheduledBackup"
  "name: kosmo-postgres-backup"
  "serviceAccountName: kosmo-postgres-backup"
  "barman-cloud.cloudnative-pg.io"
)

for marker in "${backup_markers[@]}"; do
  if grep -Fq "${marker}" "${render_dir}/dev.yaml"; then
    echo "dev manifest unexpectedly contains backup marker: ${marker}" >&2
    exit 1
  fi
done

required_prod_markers=(
  "kind: ServiceAccount"
  "name: kosmo-postgres-backup"
  "kind: ObjectStore"
  "destinationPath: s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/"
  "inheritFromIAMRole: true"
  "retentionPolicy: 7d"
  "serviceAccountName: kosmo-postgres-backup"
  "archive_timeout: 4min"
  "name: barman-cloud.cloudnative-pg.io"
  "isWALArchiver: true"
  "barmanObjectName: kosmo-postgres-backup"
  "kind: ScheduledBackup"
  'schedule: "0 0 18 * * *"'
  "backupOwnerReference: self"
  "immediate: true"
  "method: plugin"
)

for marker in "${required_prod_markers[@]}"; do
  if ! grep -Fq "${marker}" "${render_dir}/prod.yaml"; then
    echo "prod manifest is missing backup marker: ${marker}" >&2
    exit 1
  fi
done

echo "Helm dev/prod backup render checks passed."
