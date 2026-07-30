#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:?usage: deploy-production-release.sh RELEASE_TAG IMAGE_REFERENCE}"
image_ref="${2:?usage: deploy-production-release.sh RELEASE_TAG IMAGE_REFERENCE}"
application=kosmo-prod
namespace=kosmo-prod
poll_interval="${PRODUCTION_POLL_INTERVAL:-5}"
wait_timeout="${PRODUCTION_WAIT_TIMEOUT:-600}"
audit_file="${PRODUCTION_AUDIT_FILE:-}"
digest="${image_ref#*@}"
previous_tag=""
previous_digest=""
previous_migration_enabled=""
previous_migration_command=""
previous_image="none"
deployment_changed=false
deployment_succeeded=false
recovery_result="not-required"

if [[ ! "${release_tag}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release tag must be a stable SemVer tag without a prefix: ${release_tag}" >&2
  exit 1
fi

if [[ ! "${image_ref}" =~ ^ghcr\.io/byulmaru/kosmo@sha256:[0-9a-f]{64}$ ]]; then
  echo "image reference must be the verified Kosmo GHCR digest identity" >&2
  exit 1
fi

argocd_prod() {
  argocd --server "${ARGOCD_SERVER:?ARGOCD_SERVER is required}" --grpc-web "$@"
}

parameter_value() {
  local app_json="$1"
  local parameter="$2"

  jq -r --arg parameter "${parameter}" '
    [.spec.source.helm.parameters[]? | select(.name == $parameter) | .value] | last // ""
  ' <<<"${app_json}"
}

set_release_parameters() {
  local tag="$1"
  local release_digest="$2"
  local enabled="$3"
  local command="$4"

  argocd_prod app set "${application}" \
    -p "version=${tag}" \
    -p "imageDigest=${release_digest}" \
    -p "migration.enabled=${enabled}" \
    -p "migration.command=${command}" \
    --validate >/dev/null

  verify_release_parameters "$@"
}

verify_release_parameters() {
  local tag="$1"
  local release_digest="$2"
  local enabled="$3"
  local command="$4"

  local app_json
  app_json="$(argocd_prod app get "${application}" --refresh -o json)"
  if [[ "$(parameter_value "${app_json}" version)" != "${tag}" \
    || "$(parameter_value "${app_json}" imageDigest)" != "${release_digest}" \
    || "$(parameter_value "${app_json}" migration.enabled)" != "${enabled}" \
    || "$(parameter_value "${app_json}" migration.command)" != "${command}" ]]; then
    echo "Argo CD did not preserve the requested production release parameters" >&2
    return 1
  fi
}

validate_desired_images() {
  local expected_image="$1"
  local manifests_file
  manifests_file="$(mktemp)"

  if ! argocd_prod app manifests "${application}" --source git >"${manifests_file}"; then
    rm -f "${manifests_file}"
    return 1
  fi

  local expected_count
  local kosmo_images
  local kosmo_image_count
  local presync_count
  kosmo_images="$(
    sed -En "s/^[[:space:]]*-?[[:space:]]*image:[[:space:]]*['\"]?([^'\"[:space:]]+)['\"]?[[:space:]]*$/\\1/p" "${manifests_file}" \
      | grep -E '^ghcr\.io/byulmaru/kosmo(@|:)' \
      || true
  )"
  expected_count="$(grep -Fxc "${expected_image}" <<<"${kosmo_images}" || true)"
  kosmo_image_count="$(grep -c . <<<"${kosmo_images}" || true)"
  presync_count="$(grep -Ec "argocd\\.argoproj\\.io/hook:[[:space:]]*['\"]?PreSync" "${manifests_file}" || true)"
  if [[ "${expected_count}" -ne 3 || "${kosmo_image_count}" -ne 3 || "${presync_count}" -ne 1 ]]; then
    rm -f "${manifests_file}"
    echo "production migration, API, and Web manifests must use exactly ${expected_image}" >&2
    return 1
  fi

  rm -f "${manifests_file}"
}

active_rollout_identity() {
  local rollout="$1"
  local rollout_data
  local stable_hash
  local replicaset_data

  rollout_data="$(rollout_json "${rollout}")"
  stable_hash="$(jq -r '.status.stableRS // ""' <<<"${rollout_data}")"
  [[ -n "${stable_hash}" ]] || return 1
  replicaset_data="$(argocd_prod app get-resource "${application}" \
    --group apps \
    --kind ReplicaSet \
    --resource-name "${rollout}-${stable_hash}" \
    -o json)"
  jq -er '
    (.spec.template.metadata.labels["app.kubernetes.io/version"] // "") as $tag
    | ([.spec.template.spec.containers[]?.image] | unique) as $images
    | select($tag | test("^[0-9]+\\.[0-9]+\\.[0-9]+$"))
    | if $images | length == 1 then [$tag, $images[0]] | @tsv else empty end
  ' <<<"${replicaset_data}"
}

rollout_json() {
  local rollout="$1"
  argocd_prod app get-resource "${application}" \
    --group argoproj.io \
    --kind Rollout \
    --resource-name "${rollout}" \
    -o json
}

rollout_state() {
  local rollout="$1"
  local expected_image="$2"
  local live
  live="$(rollout_json "${rollout}")"

  jq -r --arg image "${expected_image}" '
    if (.spec.template.spec.containers | map(.image) | unique) != [$image] then
      "waiting"
    elif ((.status.abort // false) == true) then
      "failed"
    elif ((.status.observedGeneration // 0) < (.metadata.generation // 1)) then
      "waiting"
    elif ((.status.availableReplicas // 0) < (.spec.replicas // 1))
      or ((.status.updatedReplicas // 0) < (.spec.replicas // 1)) then
      "waiting"
    elif (.status.currentPodHash // "") == (.status.stableRS // "")
      and (.status.stableRS // "") != "" then
      "active"
    elif any(.status.pauseConditions[]?; .reason == "BlueGreenPause") then
      "preview"
    else
      "waiting"
    end
  ' <<<"${live}"
}

wait_for_rollout() {
  local rollout="$1"
  local expected_image="$2"
  local expected_states="$3"
  local deadline=$((SECONDS + wait_timeout))
  local state

  while ((SECONDS <= deadline)); do
    state="$(rollout_state "${rollout}" "${expected_image}")"
    if [[ ",${expected_states}," == *",${state},"* ]]; then
      printf '%s\n' "${state}"
      return 0
    fi
    if [[ "${state}" == "failed" ]]; then
      echo "${rollout} entered a failed rollout state" >&2
      return 1
    fi
    sleep "${poll_interval}"
  done

  echo "timed out waiting for ${rollout} to reach ${expected_states}" >&2
  return 1
}

activate_rollouts() {
  local expected_image="$1"
  local rollout
  local state
  local api_state
  local web_state

  api_state="$(wait_for_rollout kosmo-api "${expected_image}" "preview,active")"
  web_state="$(wait_for_rollout kosmo-web "${expected_image}" "preview,active")"

  for rollout in kosmo-api kosmo-web; do
    if { [[ "${rollout}" == "kosmo-api" && "${api_state}" == "preview" ]] || [[ "${rollout}" == "kosmo-web" && "${web_state}" == "preview" ]]; }; then
      argocd_prod app actions run "${application}" promote-full \
        --group argoproj.io \
        --kind Rollout \
        --namespace "${namespace}" \
        --resource-name "${rollout}"
    fi
  done

  for rollout in kosmo-api kosmo-web; do
    state="$(wait_for_rollout "${rollout}" "${expected_image}" active)"
    [[ "${state}" == "active" ]]
  done
}

deploy_release() {
  deployment_changed=true
  set_release_parameters \
    "${release_tag}" \
    "${digest}" \
    true \
    migrate
  validate_desired_images "${image_ref}"
  argocd_prod app sync "${application}" --timeout "${wait_timeout}"
  verify_release_parameters \
    "${release_tag}" \
    "${digest}" \
    true \
    migrate
  validate_desired_images "${image_ref}"
  activate_rollouts "${image_ref}"
}

restore_previous_identity() {
  if [[ "${previous_digest}" =~ ^sha256:[0-9a-f]{64}$ && "${previous_tag}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    set_release_parameters \
      "${previous_tag}" \
      "${previous_digest}" \
      "${previous_migration_enabled}" \
      "${previous_migration_command}"
    argocd_prod app sync "${application}" \
      --resource argoproj.io:Rollout:kosmo-api \
      --resource argoproj.io:Rollout:kosmo-web \
      --timeout "${wait_timeout}"
    activate_rollouts "ghcr.io/byulmaru/kosmo@${previous_digest}"
    recovery_result="restored-${previous_tag}"
  else
    argocd_prod app unset "${application}" \
      -p version \
      -p imageDigest \
      -p migration.enabled \
      -p migration.command >/dev/null || true
    recovery_result="no-previous-release"
  fi
}

write_audit() {
  local result="$1"

  [[ -n "${audit_file}" ]] || return 0
  {
    echo "### Production release ${release_tag}"
    echo
    echo "- Requester: ${GITHUB_ACTOR:-unknown}"
    echo "- Approval gate: production environment"
    echo "- Release tag: ${release_tag}"
    echo "- Image identity: ${image_ref}"
    echo "- Previous identity: ${previous_image}"
    echo "- Result: ${result}"
    echo "- Recovery: ${recovery_result}"
    if [[ -n "${GITHUB_SERVER_URL:-}" && -n "${GITHUB_REPOSITORY:-}" && -n "${GITHUB_RUN_ID:-}" ]]; then
      echo "- Run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID} (attempt ${GITHUB_RUN_ATTEMPT:-1})"
    fi
  } >"${audit_file}"
}

on_exit() {
  local exit_code=$?
  trap - EXIT

  if [[ "${deployment_succeeded}" == "true" ]]; then
    write_audit succeeded
    exit 0
  fi

  if [[ "${deployment_changed}" == "true" ]]; then
    if ! restore_previous_identity; then
      recovery_result="failed"
    fi
  fi
  write_audit failed
  exit "${exit_code}"
}
trap on_exit EXIT

current_app="$(argocd_prod app get "${application}" --refresh -o json)"
previous_migration_enabled="$(parameter_value "${current_app}" migration.enabled)"
previous_migration_command="$(parameter_value "${current_app}" migration.command)"
api_active_identity="$(active_rollout_identity kosmo-api)"
web_active_identity="$(active_rollout_identity kosmo-web)"
if [[ "${api_active_identity}" != "${web_active_identity}" ]]; then
  echo "production API and Web must expose one recoverable active digest identity before deployment" >&2
  exit 1
fi
IFS=$'\t' read -r previous_tag previous_image <<<"${api_active_identity}"
if [[ ! "${previous_image}" =~ ^ghcr\.io/byulmaru/kosmo@sha256:[0-9a-f]{64}$ ]]; then
  echo "production API and Web must expose one recoverable active digest identity before deployment" >&2
  exit 1
fi
previous_digest="${previous_image#*@}"

deploy_release
deployment_succeeded=true
