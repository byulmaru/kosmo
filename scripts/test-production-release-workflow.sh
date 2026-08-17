#!/usr/bin/env bash
# shellcheck disable=SC2016 # GitHub expressions and shell variables are intentional literal assertions.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docker_workflow="${repo_root}/.github/workflows/docker-build.yml"
release_workflow="${repo_root}/.github/workflows/production-release.yml"

fail() {
  echo "${1}" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local value="$2"
  rg -Fq -- "${value}" "${file}" || fail "${file} is missing: ${value}"
}

assert_not_contains() {
  local file="$1"
  local value="$2"
  if rg -Fq -- "${value}" "${file}"; then
    fail "${file} unexpectedly contains: ${value}"
  fi
}

line_number() {
  local file="$1"
  local value="$2"
  rg -n -F -- "${value}" "${file}" | head -n 1 | cut -d: -f1
}

[[ -f "${docker_workflow}" ]] || fail "Docker Build workflow is missing"
[[ -f "${release_workflow}" ]] || fail "Production Release workflow is missing"

# Docker Build owns only the main/dev build and its existing Trivy artifact.
assert_contains "${docker_workflow}" 'branches: [main]'
assert_contains "${docker_workflow}" 'ENVIRONMENT: dev'
assert_contains "${docker_workflow}" 'role: kosmo-build-dev'
assert_contains "${docker_workflow}" 'type=raw,value=main'
assert_contains "${docker_workflow}" 'name: docker-image-ref'
assert_not_contains "${docker_workflow}" 'branches: [main, production]'
assert_not_contains "${docker_workflow}" 'refs/heads/production'
assert_not_contains "${docker_workflow}" 'stable'
assert_not_contains "${docker_workflow}" 'deploy_production:'

# Automatic production candidates are main-only, separately tagged and gated only
# at the deploy job. The candidate job has the allowed pre-approval build secrets,
# but cannot obtain an Argo token or mutate production state.
assert_contains "${release_workflow}" 'push:'
assert_contains "${release_workflow}" 'branches: [main]'
assert_contains "${release_workflow}" 'workflow_dispatch:'
assert_contains "${release_workflow}" 'target_sha:'
assert_contains "${release_workflow}" 'type=raw,value=prod-sha-${{ github.sha }}-${{ github.run_id }}-${{ github.run_attempt }}'
assert_contains "${release_workflow}" 'image_digest: ${{ steps.build.outputs.digest }}'
assert_contains "${release_workflow}" '^sha256:[0-9a-f]{64}$'
assert_contains "${release_workflow}" 'TARGET_SHA: ${{ needs.automatic_candidate.outputs.target_sha }}'
assert_contains "${release_workflow}" 'IMAGE_DIGEST: ${{ needs.automatic_candidate.outputs.image_digest }}'
assert_contains "${release_workflow}" 'role: kosmo-build-prod'
assert_contains "${release_workflow}" 'group: production-release'
assert_contains "${release_workflow}" 'cancel-in-progress: false'
assert_not_contains "${release_workflow}" 'branches: [production]'

automatic_candidate="$(sed -n '/^  automatic_candidate:/,/^  automatic_deploy:/p' "${release_workflow}")"
automatic_deploy="$(sed -n '/^  automatic_deploy:/,/^  manual_preflight:/p' "${release_workflow}")"
manual_preflight="$(sed -n '/^  manual_preflight:/,/^  manual_deploy:/p' "${release_workflow}")"
manual_deploy="$(sed -n '/^  manual_deploy:/,$p' "${release_workflow}")"

if rg -n '^    environment:' <<<"${automatic_candidate}"; then
  fail "automatic candidate must build before the prod Environment gate"
fi
assert_not_contains <(printf '%s\n' "${automatic_candidate}") 'actions/github-script'
assert_not_contains <(printf '%s\n' "${automatic_candidate}") 'ARGOCD_SERVER'
assert_contains <(printf '%s\n' "${automatic_deploy}") 'environment:'
assert_contains <(printf '%s\n' "${automatic_deploy}") 'name: prod'
assert_contains <(printf '%s\n' "${automatic_deploy}") 'app set kosmo-prod'
assert_contains <(printf '%s\n' "${automatic_deploy}") '--revision "${TARGET_SHA}"'
assert_contains <(printf '%s\n' "${automatic_deploy}") '-p "imageDigest=${IMAGE_DIGEST}"'
assert_contains <(printf '%s\n' "${automatic_deploy}") '--image-tag stable'

# Both production paths must use the same non-canceling queue and promote stable
# only after the migration-gated Argo sync and revision/digest readback.
[[ "$(rg -c '^      group: production-release$' "${release_workflow}")" == 2 ]] || fail "automatic/manual deploy must share production-release concurrency"
[[ "$(rg -c '^      cancel-in-progress: false$' "${release_workflow}")" == 2 ]] || fail "automatic/manual deploy must not cancel running releases"

automatic_sync_line="$(line_number "${release_workflow}" 'Sync migration and production workloads')"
automatic_stable_line="$(line_number "${release_workflow}" 'Promote approved digest to ECR stable')"
[[ "${automatic_sync_line}" -lt "${automatic_stable_line}" ]] || fail "automatic stable promotion must follow sync"

manual_sync_line="$(rg -n -F 'Sync migration and production workloads' "${release_workflow}" | tail -n 1 | cut -d: -f1)"
manual_stable_line="$(rg -n -F 'Promote approved digest to ECR stable' "${release_workflow}" | tail -n 1 | cut -d: -f1)"
[[ "${manual_sync_line}" -lt "${manual_stable_line}" ]] || fail "manual stable promotion must follow sync"

# Manual preflight may validate only main/ref/SHA/repository existence. It must
# not checkout or request OIDC before the Environment approval job starts.
assert_contains <(printf '%s\n' "${manual_preflight}") 'context.ref !== "refs/heads/main"'
assert_contains <(printf '%s\n' "${manual_preflight}") '/^[0-9a-f]{40}$/'
assert_contains <(printf '%s\n' "${manual_preflight}") 'github.rest.repos.getCommit'
assert_contains <(printf '%s\n' "${manual_preflight}") 'Target code checkout/build: deferred until prod Environment approval'
assert_not_contains <(printf '%s\n' "${manual_preflight}") 'actions/checkout'
assert_not_contains <(printf '%s\n' "${manual_preflight}") 'id-token: write'

assert_contains <(printf '%s\n' "${manual_deploy}") 'name: prod'
assert_contains <(printf '%s\n' "${manual_deploy}") 'ref: ${{ needs.manual_preflight.outputs.target_sha }}'
assert_contains <(printf '%s\n' "${manual_deploy}") 'SENTRY_RELEASE: kosmo@${{ needs.manual_preflight.outputs.target_sha }}'
assert_contains <(printf '%s\n' "${manual_deploy}") 'type=raw,value=prod-sha-${{ needs.manual_preflight.outputs.target_sha }}-${{ github.run_id }}-${{ github.run_attempt }}'
assert_contains <(printf '%s\n' "${manual_deploy}") 'IMAGE_DIGEST: ${{ steps.build.outputs.digest }}'
assert_not_contains <(printf '%s\n' "${manual_deploy}") 'github.sha'

approval_line="$(rg -n '^    environment:$' "${release_workflow}" | tail -n 1 | cut -d: -f1)"
checkout_line="$(rg -n -F 'Checkout target commit after approval' "${release_workflow}" | cut -d: -f1)"
[[ "${approval_line}" -lt "${checkout_line}" ]] || fail "manual checkout must be after its Environment gate"

echo "Production release workflow trigger, approval, identity, concurrency, and stable-promotion checks passed."
