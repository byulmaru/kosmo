#!/usr/bin/env bash
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
render_dir="$(mktemp -d)"
trap 'rm -rf "${render_dir}"' EXIT
cd "${chart_dir}"

release_tag="1.2.3"
release_digest="sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
release_image="ghcr.io/byulmaru/kosmo@${release_digest}"
prod_web_domain="kos.moe"
prod_api_domain="api.kos.moe"

helm lint . --set env=dev
helm lint . \
  --set env=prod \
  --set-string version="${release_tag}" \
  --set-string imageDigest="${release_digest}" \
  --set-string webDomain="${prod_web_domain}" \
  --set-string apiDomain="${prod_api_domain}"
helm template kosmo . --namespace kosmo-dev --set env=dev >"${render_dir}/dev.yaml"
helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set-string version="${release_tag}" \
  --set-string imageDigest="${release_digest}" \
  --set-string webDomain="${prod_web_domain}" \
  --set-string apiDomain="${prod_api_domain}" \
  >"${render_dir}/prod.yaml"

if helm template kosmo . --namespace kosmo-prod --set env=prod >"${render_dir}/invalid-prod.yaml" 2>/dev/null; then
  echo "prod manifest rendered without an image digest" >&2
  exit 1
fi

if helm template kosmo . --namespace kosmo-prod --set env=prod --set-string imageDigest=sha256:invalid >"${render_dir}/invalid-prod.yaml" 2>/dev/null; then
  echo "prod manifest rendered with a malformed image digest" >&2
  exit 1
fi

helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set workloads.enabled=false \
  --set-string version="${release_tag}" \
  --set-string webDomain="${prod_web_domain}" \
  --set-string apiDomain="${prod_api_domain}" \
  >"${render_dir}/prod-runtime.yaml"

if grep -Eq '^kind: (Rollout|Service|HTTPRoute)$' "${render_dir}/prod-runtime.yaml"; then
  echo "prod runtime bootstrap unexpectedly rendered application workloads" >&2
  exit 1
fi

if grep -Fq 'kind: "argo.Rollout"' "${render_dir}/prod-runtime.yaml"; then
  echo "prod runtime bootstrap unexpectedly references workload restart targets" >&2
  exit 1
fi

for runtime_kind in Cluster ObjectStore ScheduledBackup VaultStaticSecret; do
  if ! grep -Fq "kind: ${runtime_kind}" "${render_dir}/prod-runtime.yaml"; then
    echo "prod runtime bootstrap is missing ${runtime_kind}" >&2
    exit 1
  fi
done

prod_runtime_markers=(
  "instances: 3"
  "argocd.argoproj.io/sync-options: Prune=confirm"
  "path: \"kubernetes/kosmo/prod\""
  "path: \"kubernetes/kosmo/prod/migration\""
  "type: \"kubernetes.io/basic-auth\""
  "cnpg.io/reload: \"true\""
  "kind: DatabaseRole"
  "name: kosmo_migration"
  "databaseRoleReclaimPolicy: retain"
  "- kosmo"
  "name: \"kosmo-postgres-migration\""
  "- \"^username$\""
  "- \"^password$\""
)

for marker in "${prod_runtime_markers[@]}"; do
  if ! grep -Fq -- "${marker}" "${render_dir}/prod-runtime.yaml"; then
    echo "prod runtime bootstrap is missing marker: ${marker}" >&2
    exit 1
  fi
done

for protected_kind in Cluster ObjectStore; do
  if ! awk -v kind="${protected_kind}" '
    $0 == "kind: " kind { in_resource = 1 }
    in_resource && /argocd.argoproj.io\/sync-options: Prune=confirm/ { found = 1 }
    in_resource && /^---$/ { exit }
    END { exit !found }
  ' "${render_dir}/prod-runtime.yaml"; then
    echo "prod ${protected_kind} must require explicit prune confirmation" >&2
    exit 1
  fi
done

for protected_resource in "DatabaseRole kosmo-postgres-migration" "VaultStaticSecret migration-database"; do
  read -r protected_kind protected_name <<<"${protected_resource}"
  if ! awk -v kind="${protected_kind}" -v name="${protected_name}" '
    $0 == "kind: " kind { in_resource = 1 }
    in_resource && $0 ~ "^  name: [\" ]*" name "[\" ]*$" { named = 1 }
    in_resource && /argocd.argoproj.io\/sync-options: Prune=confirm/ { protected = 1 }
    /^---$/ {
      if (in_resource && named && protected) { found = 1 }
      in_resource = named = protected = 0
    }
    END {
      if (in_resource && named && protected) { found = 1 }
      exit !found
    }
  ' "${render_dir}/prod-runtime.yaml"; then
    echo "prod ${protected_kind}/${protected_name} must require explicit prune confirmation" >&2
    exit 1
  fi
done

dev_forbidden_markers=(
  "instances: 3"
  "kubernetes/kosmo/prod"
  "kind: DatabaseRole"
  "kosmo-postgres-migration"
  "argocd.argoproj.io/sync-options: Prune=confirm"
)

for marker in "${dev_forbidden_markers[@]}"; do
  if grep -Fq "${marker}" "${render_dir}/dev.yaml"; then
    echo "dev manifest unexpectedly contains production marker: ${marker}" >&2
    exit 1
  fi
done

if ! awk '
  $0 == "kind: Cluster" { in_cluster = 1 }
  in_cluster && $0 == "  resources:" { resources = 1 }
  resources && $0 == "    limits:" { limits = 1; requests = 0; seen_limits = 1 }
  resources && $0 == "    requests:" { requests = 1; limits = 0; seen_requests = 1 }
  limits && $0 == "      cpu: 250m" { limit_cpu = 1 }
  limits && $0 == "      memory: 1Gi" { limit_memory = 1 }
  requests && $0 == "      cpu: 250m" { request_cpu = 1 }
  requests && $0 == "      memory: 1Gi" { request_memory = 1 }
  in_cluster && /^---$/ { exit }
  END { exit !(resources && seen_limits && seen_requests && limit_cpu && limit_memory && request_cpu && request_memory) }
' "${render_dir}/dev.yaml"; then
  echo "dev PostgreSQL must render the expected resource requests and limits" >&2
  exit 1
fi

if ! awk '
  $0 == "kind: Cluster" { in_cluster = 1 }
  in_cluster && $0 == "  resources:" { found = 1 }
  in_cluster && /^---$/ { exit }
  END { exit found }
' "${render_dir}/prod.yaml"; then
  echo "prod PostgreSQL unexpectedly inherited dev resource settings" >&2
  exit 1
fi

if [[ "$(grep -Fc 'image: "ghcr.io/byulmaru/kosmo:main"' "${render_dir}/dev.yaml")" -ne 3 ]]; then
  echo "dev migration, API, and Web must keep the mutable main image" >&2
  exit 1
fi

if [[ "$(grep -Fc "image: \"${release_image}\"" "${render_dir}/prod.yaml")" -ne 2 ]]; then
  echo "prod API and Web must use the selected digest image" >&2
  exit 1
fi

if grep -Fq -- "-ro:5432" "${render_dir}/prod.yaml"; then
  echo "prod API or Web unexpectedly uses the read-only database service" >&2
  exit 1
fi

if [[ "$(grep -Fc 'kosmo-postgres-rw:5432' "${render_dir}/prod.yaml")" -ne 2 ]]; then
  echo "prod API and Web must both use the read-write database service" >&2
  exit 1
fi

if grep -Fq 'autoPromotionEnabled:' "${render_dir}/dev.yaml" || grep -Fq 'autoPromotionEnabled:' "${render_dir}/prod.yaml"; then
  echo "API and Web rollouts must use the controller's default activation" >&2
  exit 1
fi

if grep -Fq "image: \"ghcr.io/byulmaru/kosmo:${release_tag}\"" "${render_dir}/prod.yaml"; then
  echo "prod workload identity must not use the mutable SemVer container tag" >&2
  exit 1
fi

image_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set-string version="${release_tag}" \
  --set imageDigest="${image_digest}" \
  --set migration.enabled=true \
  >"${render_dir}/prod-migration.yaml"
helm template kosmo . \
  --namespace kosmo-prod \
  --show-only templates/database-migration-job.yaml \
  --set env=prod \
  --set-string version="${release_tag}" \
  --set imageDigest="${image_digest}" \
  --set migration.enabled=true \
  >"${render_dir}/prod-migration-job.yaml"

if helm template kosmo . \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest=sha256:invalid \
  --set migration.enabled=true \
  >"${render_dir}/invalid-prod-migration.yaml" 2>/dev/null; then
  echo "prod migration unexpectedly rendered with an invalid image digest" >&2
  exit 1
fi

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
  if ! grep -Fq "${marker}" "${render_dir}/prod-runtime.yaml"; then
    echo "prod manifest is missing backup marker: ${marker}" >&2
    exit 1
  fi
done

required_migration_markers=(
  "ghcr.io/byulmaru/kosmo@${image_digest}"
  "name: \"kosmo-postgres-migration\""
  "name: PGHOST"
  'value: "kosmo-postgres-rw"'
  "name: PGDATABASE"
  'value: "kosmo"'
  "name: DATABASE_MIGRATION_ROLE"
  "name: PGUSER"
  "key: username"
  "name: PGPASSWORD"
  "key: password"
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

migration_secret_count="$(grep -Fc 'name: "kosmo-postgres-migration"' "${render_dir}/prod-migration-job.yaml")"
if [[ "${migration_secret_count}" -ne 2 ]]; then
  echo "expected the migration Job to read only username and password from its Secret; found ${migration_secret_count} references" >&2
  exit 1
fi

if grep -Fq "kosmo-postgres-app" "${render_dir}/prod-migration-job.yaml"; then
  echo "prod migration unexpectedly references the runtime database Secret" >&2
  exit 1
fi

echo "Helm dev/prod backup and migration render checks passed."
