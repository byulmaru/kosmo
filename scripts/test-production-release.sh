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
  upload)
    ;;
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

cat >"${fake_bin}/argocd" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo "$*" >>"${FAKE_LOG}"
shift 3
[[ "$1" == "app" ]]
shift
command="$1"
shift

state_value() {
  local name="$1"
  [[ -f "${FAKE_STATE}/${name}" ]] && cat "${FAKE_STATE}/${name}" || true
}

case "${command}" in
  get)
    if [[ "${DEPLOY_SCENARIO:-success}" == "readback-failure" && "$(state_value tag)" == "1.0.0" ]]; then
      exit 1
    fi
    tag="$(state_value tag)"
    digest="$(state_value digest)"
    migration_enabled="$(state_value migration-enabled)"
    cat <<JSON
{"spec":{"source":{"helm":{"parameters":[{"name":"version","value":"${tag}"},{"name":"imageDigest","value":"${digest}"},{"name":"migration.enabled","value":"${migration_enabled}"}]}}}}
JSON
    ;;
  set)
    for argument in "$@"; do
      case "${argument}" in
        version=*) printf '%s' "${argument#version=}" >"${FAKE_STATE}/tag" ;;
        imageDigest=*) printf '%s' "${argument#imageDigest=}" >"${FAKE_STATE}/digest" ;;
        migration.enabled=*) printf '%s' "${argument#migration.enabled=}" >"${FAKE_STATE}/migration-enabled" ;;
      esac
    done
    ;;
  unset)
    : >"${FAKE_STATE}/tag"
    : >"${FAKE_STATE}/digest"
    : >"${FAKE_STATE}/migration-enabled"
    ;;
  manifests)
    digest="$(state_value digest)"
    image="ghcr.io/byulmaru/kosmo@${digest}"
    migration_image="${image}"
    if [[ "${DEPLOY_SCENARIO:-success}" == "manifest-mismatch" && "$(state_value tag)" == "1.0.0" ]]; then
      migration_image="ghcr.io/byulmaru/kosmo@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    fi
    cat <<YAML
apiVersion: batch/v1
kind: Job
metadata:
  annotations:
    argocd.argoproj.io/hook: PreSync
spec:
  template:
    spec:
      containers:
        - image: ${migration_image}
---
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: kosmo-api
spec:
  template:
    spec:
      containers:
        - image: ${image}
---
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: kosmo-web
spec:
  template:
    spec:
      containers:
        - image: ${image}
YAML
    ;;
  sync)
    if [[ "${DEPLOY_SCENARIO:-success}" == "migration-failure" && "$(state_value tag)" == "1.0.0" ]] \
      || [[ "${DEPLOY_SCENARIO:-success}" == "recovery-sync-failure" ]]; then
      exit 1
    fi
    ;;
  get-resource)
    rollout=""
    kind=""
    while (($#)); do
      [[ "$1" == "--resource-name" ]] && rollout="$2"
      [[ "$1" == "--kind" ]] && kind="$2"
      shift
    done
    if [[ "${kind}" == "ReplicaSet" ]]; then
      replicaset="${rollout}"
      hash="${replicaset##*-}"
      rollout="${replicaset%-${hash}}"
      rollout="${rollout%-}"
      if [[ "${hash}" == "new" ]]; then
        replicaset_digest="$(state_value digest)"
        replicaset_tag="$(state_value tag)"
      else
        replicaset_digest="$(state_value active-digest)"
        replicaset_tag="$(state_value active-tag)"
      fi
      available=1
      if [[ "${DEPLOY_SCENARIO:-success}" == "preview-rs-unready" && "${hash}" == "new" && "${replicaset_tag}" == "1.0.0" && "${rollout}" == "kosmo-web" ]]; then
        available=0
      fi
      if [[ "${DEPLOY_SCENARIO:-success}" == "preview-regression" && "${hash}" == "new" && "${replicaset_tag}" == "1.0.0" ]]; then
        if [[ "${rollout}" == "kosmo-web" ]]; then
          touch "${FAKE_STATE}/web-preview-observed"
        elif [[ -f "${FAKE_STATE}/web-preview-observed" ]]; then
          available=0
        fi
      fi
      if [[ "${DEPLOY_SCENARIO:-success}" == "legacy-stable-label" && "${hash}" == "old" ]]; then
        labels='{}'
      else
        labels="{\"app.kubernetes.io/version\":\"${replicaset_tag}\"}"
      fi
      cat <<JSON
{"metadata":{"generation":1},"spec":{"replicas":1,"template":{"metadata":{"labels":${labels}},"spec":{"containers":[{"image":"ghcr.io/byulmaru/kosmo@${replicaset_digest}"}]}}},"status":{"observedGeneration":1,"readyReplicas":${available},"availableReplicas":${available}}}
JSON
      exit 0
    fi
    digest="$(state_value digest)"
    tag="$(state_value tag)"
    image="ghcr.io/byulmaru/kosmo@${digest}"
    if [[ "${DEPLOY_SCENARIO:-success}" == "active-mismatch" && "${tag}" == "1.0.0" && "${rollout}" == "kosmo-web" && -f "${FAKE_STATE}/promoted-${rollout}-${tag}" ]]; then
      image="ghcr.io/byulmaru/kosmo@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
    fi
    if [[ ("${DEPLOY_SCENARIO:-success}" == "preview-failure" || "${DEPLOY_SCENARIO:-success}" == "desired-mismatch") && "${tag}" == "1.0.0" && "${rollout}" == "kosmo-web" ]]; then
      abort=true
    else
      abort=false
    fi
    if [[ "${DEPLOY_SCENARIO:-success}" == "rerun" || -f "${FAKE_STATE}/promoted-${rollout}-${tag}" ]]; then
      current=new
      stable=new
      pauses='[]'
    else
      current=new
      stable=old
      pauses='[{"reason":"BlueGreenPause"}]'
    fi
    cat <<JSON
{"metadata":{"generation":2,"labels":{"app.kubernetes.io/version":"${tag}"}},"spec":{"replicas":1,"template":{"spec":{"containers":[{"image":"${image}"}]}}},"status":{"abort":${abort},"observedGeneration":2,"availableReplicas":1,"updatedReplicas":1,"currentPodHash":"${current}","stableRS":"${stable}","pauseConditions":${pauses}}}
JSON
    ;;
  actions)
    tag="$(state_value tag)"
    rollout=""
    while (($#)); do
      if [[ "$1" == "--resource-name" ]]; then
        rollout="$2"
        break
      fi
      shift
    done
    if [[ "${DEPLOY_SCENARIO:-success}" == "promotion-failure" && "${tag}" == "1.0.0" && "${rollout}" == "kosmo-web" ]]; then
      exit 1
    fi
    touch "${FAKE_STATE}/promoted-${rollout}-${tag}"
    ;;
  *)
    echo "unexpected fake argocd command: ${command} $*" >&2
    exit 1
    ;;
esac
EOF
chmod +x "${fake_bin}/argocd"

export PATH="${fake_bin}:${PATH}"
export GITHUB_REPOSITORY=byulmaru/kosmo
export ARGOCD_SERVER=argocd.example.test
unset GITHUB_SHA
valid_digest="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
previous_digest="sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
valid_image="ghcr.io/byulmaru/kosmo@${valid_digest}"

run_release_test() {
  local scenario="$1"
  export GH_SCENARIO="${scenario}"
  export FAKE_STATE="${test_dir}/release-${scenario}"
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
[[ "${command_order}" == "create upload edit verify verify-asset " ]] || fail "release was not drafted, populated, published, and verified in order: ${command_order}"

run_release_test setting-disabled
expect_failure "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}"

run_release_test fresh-tag-match
GITHUB_SHA=build-commit GH_TAG_COMMIT=build-commit \
  "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}" >/dev/null

run_release_test fresh-tag-mismatch
GITHUB_SHA=build-commit GH_TAG_COMMIT=moved-tag \
  expect_failure "${repo_root}/scripts/publish-production-release.sh" 1.0.0 "${valid_image}"

run_deploy_test() {
  local scenario="$1"
  local expected_result="$2"
  export DEPLOY_SCENARIO="${scenario}"
  export FAKE_STATE="${test_dir}/deploy-${scenario}"
  export FAKE_LOG="${FAKE_STATE}/commands.log"
  export PRODUCTION_AUDIT_FILE="${FAKE_STATE}/audit.md"
  export PRODUCTION_POLL_INTERVAL=0
  export PRODUCTION_WAIT_TIMEOUT=1
  mkdir -p "${FAKE_STATE}"
  if [[ "${scenario}" == "rerun" ]]; then
    printf '%s' 1.0.0 >"${FAKE_STATE}/tag"
    printf '%s' "${valid_digest}" >"${FAKE_STATE}/digest"
    printf '%s' "${valid_digest}" >"${FAKE_STATE}/active-digest"
    printf '%s' 1.0.0 >"${FAKE_STATE}/active-tag"
  else
    printf '%s' 0.9.0 >"${FAKE_STATE}/tag"
    if [[ "${scenario}" == "desired-mismatch" ]]; then
      printf '%s' sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc >"${FAKE_STATE}/digest"
    else
      printf '%s' "${previous_digest}" >"${FAKE_STATE}/digest"
    fi
    printf '%s' "${previous_digest}" >"${FAKE_STATE}/active-digest"
    printf '%s' 0.9.0 >"${FAKE_STATE}/active-tag"
  fi
  printf '%s' true >"${FAKE_STATE}/migration-enabled"

  if [[ "${expected_result}" == "success" ]]; then
    "${repo_root}/scripts/deploy-production-release.sh" 1.0.0 "${valid_image}" >/dev/null
    grep -Fq -- '- Result: succeeded' "${PRODUCTION_AUDIT_FILE}" || fail "${scenario} did not record success"
  elif [[ "${expected_result}" == "failure" ]]; then
    expect_failure "${repo_root}/scripts/deploy-production-release.sh" 1.0.0 "${valid_image}"
    grep -Fq -- '- Result: failed' "${PRODUCTION_AUDIT_FILE}" || fail "${scenario} did not record failure"
    grep -Fq -- '- Recovery: restored-0.9.0' "${PRODUCTION_AUDIT_FILE}" || fail "${scenario} did not restore the previous release"
    [[ "$(cat "${FAKE_STATE}/digest")" == "${previous_digest}" ]] || fail "${scenario} restored desired state instead of the previous active identity"
  else
    expect_failure "${repo_root}/scripts/deploy-production-release.sh" 1.0.0 "${valid_image}"
    grep -Fq -- '- Result: failed' "${PRODUCTION_AUDIT_FILE}" || fail "${scenario} did not record failure"
    grep -Fq -- '- Recovery: failed' "${PRODUCTION_AUDIT_FILE}" || fail "${scenario} reported a failed recovery as successful"
  fi
  if grep -Eq 'migration\.(command|phase|schemaAuthority|secretName|restorePointName)=' "${FAKE_LOG}"; then
    fail "${scenario} changed PROD-564-owned migration policy or credential parameters"
  fi
}

run_deploy_test success success
run_deploy_test rerun success
if grep -q 'actions run' "${FAKE_LOG}"; then
  fail "same-identity rerun unexpectedly promoted an already active rollout"
fi
run_deploy_test migration-failure failure
run_deploy_test legacy-stable-label success
run_deploy_test readback-failure failure
run_deploy_test desired-mismatch failure
run_deploy_test preview-failure failure
run_deploy_test preview-rs-unready failure
run_deploy_test preview-regression failure
run_deploy_test promotion-failure failure
run_deploy_test active-mismatch failure
run_deploy_test manifest-mismatch failure
run_deploy_test recovery-sync-failure recovery-failure

deploy_workflow="${repo_root}/.github/workflows/deploy-production.yml"
build_workflow="${repo_root}/.github/workflows/docker-build.yml"
github_setup="${repo_root}/apps/terraform/scripts/ensure-github.sh"

assert_contains "${build_workflow}" 'publish_release:'
assert_contains "${build_workflow}" 'needs: docker_build'
assert_contains "${build_workflow}" 'scripts/publish-production-release.sh'
assert_contains "${deploy_workflow}" 'group: production-release'
assert_contains "${deploy_workflow}" 'cancel-in-progress: false'
assert_contains "${deploy_workflow}" 'needs: verify_release'
assert_contains "${deploy_workflow}" 'scripts/resolve-production-release.sh'
assert_contains "${deploy_workflow}" 'scripts/deploy-production-release.sh'
assert_contains "${deploy_workflow}" 'Record release verification audit'
assert_contains "${github_setup}" "ensure_environment \"\${production_environment}\" \"\${production_reviewer}\""
assert_contains "${github_setup}" 'ensure_immutable_releases'

environment_count="$(grep -Ec '^[[:space:]]+environment:' "${deploy_workflow}")"
production_environment_count="$(grep -Ec '^[[:space:]]+environment: production$' "${deploy_workflow}")"
if [[ "${environment_count}" -ne 1 || "${production_environment_count}" -ne 1 ]]; then
  fail "the whole production release must use exactly one production Environment approval"
fi

verify_job="$(sed -n '/^  verify_release:/,/^  deploy_production:/p' "${deploy_workflow}")"
if grep -Fq 'id-token: write' <<<"${verify_job}"; then
  fail "release verification job must not receive production OIDC permission"
fi
if grep -Fq 'docker/build-push-action' "${deploy_workflow}"; then
  fail "production deployment must not rebuild the selected release"
fi
if grep -Fq 'contract-restore-point' "${deploy_workflow}"; then
  fail "the general release workflow must not replace migration with contract evidence preparation"
fi
if grep -Eq 'production-contract|contract_approval|APPROVED_CONTRACT_CONTEXT_SHA256|PRODUCTION_CONTRACT_PREFLIGHT' "${deploy_workflow}"; then
  fail "the production release workflow must not add a contract-only approval path"
fi
if grep -Eq 'migration_context_json|MIGRATION_CONTEXT_JSON|migration_secret_name|MIGRATION_SECRET_NAME|production-migration-gate' "${deploy_workflow}"; then
  fail "the production release workflow must not accept or assemble migration gate inputs"
fi
if grep -Eq 'PRODUCTION_MIGRATION_CONTEXT_FILE|PRODUCTION_MIGRATION_GATE_COMMAND|PRODUCTION_MIGRATION_SECRET_NAME|production-migration-gate' "${repo_root}/scripts/deploy-production-release.sh"; then
  fail "the production deploy script must use the Argo CD PreSync Job as its migration barrier"
fi
if grep -Eq 'migration\.(command|phase|schemaAuthority|restorePointName)' "${repo_root}/scripts/deploy-production-release.sh"; then
  fail "the production deploy script must not configure removed migration Job interfaces"
fi

echo "Production release publish, verification, rerun, failure recovery, and audit checks passed."
