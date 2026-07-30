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

image_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest="${image_digest}" \
  --set migration.enabled=true \
  --set migration.secretName=kosmo-postgres-migration \
  >"${render_dir}/prod-migration.yaml"
helm template kosmo . \
  --namespace kosmo-prod \
  --show-only templates/database-migration-job.yaml \
  --set env=prod \
  --set imageDigest="${image_digest}" \
  --set migration.enabled=true \
  --set migration.secretName=kosmo-postgres-migration \
  >"${render_dir}/prod-migration-job.yaml"

helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest="${image_digest}" \
  --set migration.enabled=true \
  >"${render_dir}/invalid-prod-migration.yaml" 2>/dev/null && {
  echo "prod migration unexpectedly rendered without migration.secretName" >&2
  exit 1
}

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

required_migration_markers=(
  "ghcr.io/byulmaru/kosmo@${image_digest}"
  "name: \"kosmo-postgres-migration\""
  'key: "url"'
  '- migrate'
)

for marker in "${required_migration_markers[@]}"; do
  if ! grep -Fq -- "${marker}" "${render_dir}/prod-migration.yaml"; then
    echo "prod migration manifest is missing marker: ${marker}" >&2
    exit 1
  fi
done

rendered_digest_count="$(grep -Fc "image: \"ghcr.io/byulmaru/kosmo@${image_digest}\"" "${render_dir}/prod-migration.yaml")"
if [[ "${rendered_digest_count}" -ne 3 ]]; then
  echo "expected migration, API, and Web to render the same digest; found ${rendered_digest_count}" >&2
  exit 1
fi

migration_secret_count="$(grep -Fc 'name: "kosmo-postgres-migration"' "${render_dir}/prod-migration.yaml")"
if [[ "${migration_secret_count}" -ne 1 ]]; then
  echo "expected only the migration Job to reference the migration Secret; found ${migration_secret_count}" >&2
  exit 1
fi

if grep -Fq "kosmo-postgres-app" "${render_dir}/prod-migration-job.yaml"; then
  echo "prod migration unexpectedly references the runtime database Secret" >&2
  exit 1
fi

for forbidden_marker in contract-restore-point RESTORE_POINT_NAME kosmo.dev/migration-phase kosmo.dev/schema-authority; do
  if grep -Fq -- "${forbidden_marker}" "${render_dir}/prod-migration-job.yaml"; then
    echo "prod migration Job unexpectedly contains gate concern: ${forbidden_marker}" >&2
    exit 1
  fi
done

echo "Helm dev/prod backup and migration render checks passed."
