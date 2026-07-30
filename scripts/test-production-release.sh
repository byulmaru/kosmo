#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "${test_dir}"' EXIT
fake_bin="${test_dir}/bin"
mkdir "${fake_bin}"

fail() {
  echo "$1" >&2
  exit 1
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    fail "command unexpectedly succeeded: $*"
  fi
}

assert_contains() {
  local file="$1"
  local value="$2"
  grep -Fq -- "${value}" "${file}" || fail "${file} is missing: ${value}"
}

cat >"${fake_bin}/gh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "$*" >>"${FAKE_LOG}"
scenario="${GH_SCENARIO:-immutable}"

if [[ "$1" == "api" ]]; then
  [[ "${scenario}" != "setting-disabled" ]]
  if [[ "$2" == repos/*/commits/* ]]; then
    echo "${GH_TAG_COMMIT:-${GITHUB_SHA:-}}"
  else
    echo true
  fi
  exit 0
fi

shift
case "$1" in
  verify)
    [[ "${scenario}" == "immutable" || -f "${FAKE_STATE}/immutable" ]]
    ;;
  verify-asset)
    [[ "${scenario}" != "attestation-failure" ]]
    ;;
  download)
    shift
    while (($#)); do
      if [[ "$1" == "--dir" ]]; then
        destination="$2"
        break
      fi
      shift
    done
    mkdir -p "${destination}"
    printf '%s\n' "${GH_ASSET_CONTENT}" >"${destination}/docker-image-ref.txt"
    ;;
  view)
    if [[ "${scenario}" == fresh* && ! -f "${FAKE_STATE}/draft" ]]; then
      exit 1
    fi
    if [[ "$*" == *"--json isDraft"* ]]; then
      [[ "${scenario}" == "draft" || -f "${FAKE_STATE}/draft" ]] && echo true || echo false
    fi
    ;;
  create)
    touch "${FAKE_STATE}/draft"
    ;;
  upload) ;;
  edit)
    touch "${FAKE_STATE}/immutable"
    ;;
  *)
    echo "unexpected fake gh command: $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "${fake_bin}/gh"

export PATH="${fake_bin}:${PATH}"
export GITHUB_REPOSITORY=byulmaru/kosmo
unset GITHUB_SHA
valid_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
valid_image="ghcr.io/byulmaru/kosmo@${valid_digest}"

run_release_test() {
  local scenario="$1"
  export GH_SCENARIO="${scenario}"
  export FAKE_STATE="${test_dir}/${scenario}"
  export FAKE_LOG="${FAKE_STATE}/commands.log"
  export GH_ASSET_CONTENT="${valid_image}"
  mkdir -p "${FAKE_STATE}"
}

run_release_test immutable
[[ "$("${repo_root}/scripts/resolve-production-release.sh" 1.0.0)" == "${valid_image}" ]] || fail "valid immutable release did not resolve"

run_release_test attestation-failure
expect_failure "${repo_root}/scripts/resolve-production-release.sh" 1.0.0

run_release_test immutable
export GH_ASSET_CONTENT=ghcr.io/byulmaru/kosmo:1.0.0
expect_failure "${repo_root}/scripts/resolve-production-release.sh" 1.0.0

run_release_test fresh
"${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}" >/dev/null
command_order="$(sed -E 's/ --repo.*//' "${FAKE_LOG}" | grep -E 'release (create|upload|edit|verify)' | sed -E 's/.*release ([^ ]+).*/\1/' | tr '\n' ' ')"
[[ "${command_order}" == "create upload edit verify verify-asset " ]] || fail "release publish order changed: ${command_order}"

run_release_test setting-disabled
expect_failure "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}"

run_release_test fresh-tag-match
GITHUB_SHA=build-commit GH_TAG_COMMIT=build-commit \
  "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}" >/dev/null

run_release_test fresh-tag-mismatch
GITHUB_SHA=build-commit GH_TAG_COMMIT=moved-tag \
  expect_failure "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}"

deploy_workflow="${repo_root}/.github/workflows/deploy-production.yml"
build_workflow="${repo_root}/.github/workflows/docker-build.yml"
github_setup="${repo_root}/apps/terraform/scripts/ensure-github.sh"

assert_contains "${build_workflow}" 'publish_release:'
assert_contains "${build_workflow}" 'needs: docker_build'
assert_contains "${build_workflow}" 'scripts/publish-production-release.sh'
assert_contains "${deploy_workflow}" 'group: production-release'
assert_contains "${deploy_workflow}" 'cancel-in-progress: false'
assert_contains "${deploy_workflow}" 'needs: verify_release'
assert_contains "${deploy_workflow}" 'runs-on: self-hosted'
assert_contains "${deploy_workflow}" 'environment: production'
assert_contains "${deploy_workflow}" 'scripts/resolve-production-release.sh'
assert_contains "${deploy_workflow}" 'app set kosmo-prod'
assert_contains "${deploy_workflow}" 'app manifests kosmo-prod --source git'
assert_contains "${deploy_workflow}" 'app sync kosmo-prod --timeout 600'
assert_contains "${deploy_workflow}" 'if: always()'
assert_contains "${deploy_workflow}" 'Image identity: ${IMAGE_REF}'
assert_contains "${github_setup}" "ensure_environment \"\${production_environment}\" \"\${production_reviewer}\""
assert_contains "${github_setup}" 'ensure_immutable_releases'

environment_count="$(grep -Ec '^[[:space:]]+environment:' "${deploy_workflow}")"
production_environment_count="$(grep -Ec '^[[:space:]]+environment: production$' "${deploy_workflow}")"
if [[ "${environment_count}" -ne 1 || "${production_environment_count}" -ne 1 ]]; then
  fail "the production release must use exactly one production Environment approval"
fi

verify_job="$(sed -n '/^  verify_release:/,/^  deploy_production:/p' "${deploy_workflow}")"
if grep -Fq 'id-token: write' <<<"${verify_job}"; then
  fail "release verification job must not receive production OIDC permission"
fi

if grep -Eq 'docker/build-push-action|deploy-production-release|app (get-resource|actions|unset)|--resource argoproj.io:Rollout' "${deploy_workflow}"; then
  fail "production deployment must not rebuild or directly orchestrate Rollouts and ReplicaSets"
fi

if grep -Eq 'production-contract|contract_approval|migration_context_json|MIGRATION_CONTEXT_JSON|migration_secret_name|MIGRATION_SECRET_NAME|production-migration-gate|migration\.(command|phase|schemaAuthority|restorePointName)' "${deploy_workflow}"; then
  fail "production release must not add a schema-specific migration gate or approval"
fi

if rg -q 'autoPromotionEnabled:' "${repo_root}/apps/helm/templates/api/rollout.yaml" "${repo_root}/apps/helm/templates/web/rollout.yaml"; then
  fail "production Rollouts must use controller default activation"
fi

echo "Production release identity, approval, PreSync sync, default activation, and audit checks passed."
