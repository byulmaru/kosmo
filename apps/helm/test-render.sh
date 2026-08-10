#!/usr/bin/env bash
set -euo pipefail

chart_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helm_bin="${HELM_BIN:-helm}"
render_dir="$(mktemp -d)"
trap 'rm -rf "${render_dir}"' EXIT

queue_values=(
  --set-string postgres.credentials.fedifyQueue.databaseUrl=postgres://queue
  --set-string postgres.credentials.fedifyQueue.passwordSecret.name=queue-secret
  --set-string postgres.credentials.fedifyQueue.passwordSecret.key=password
)

fail() {
  echo "helm render assertion failed: $*" >&2
  exit 1
}

assert_count() {
  local expected="$1"
  local needle="$2"
  local file="$3"
  local actual
  actual="$(grep -Fc -- "${needle}" "${file}" || true)"
  [[ "${actual}" == "${expected}" ]] || fail "expected ${expected} occurrences of '${needle}', got ${actual}"
}

"${helm_bin}" lint "${chart_dir}" --set env=dev
"${helm_bin}" lint "${chart_dir}" \
  --set env=prod \
  --set-string imageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

default_render="${render_dir}/default.yaml"
"${helm_bin}" template kosmo "${chart_dir}" --set env=dev >"${default_render}"
if grep -Fq 'FEDIFY_QUEUE_DATABASE_' "${default_render}"; then
  fail 'default values unexpectedly enable Fedify queue mode'
fi
if grep -Fq 'name: kosmo-fedify-consumer' "${default_render}"; then
  fail 'default values unexpectedly render the Fedify consumer'
fi

producer_render="${render_dir}/producer.yaml"
"${helm_bin}" template kosmo "${chart_dir}" \
  --set env=dev \
  --set fedify.producer.enabled=true \
  "${queue_values[@]}" \
  >"${producer_render}"
assert_count 2 'name: FEDIFY_QUEUE_DATABASE_URL' "${producer_render}"
assert_count 2 'name: FEDIFY_QUEUE_DATABASE_PASSWORD' "${producer_render}"
if grep -Fq 'name: kosmo-fedify-consumer' "${producer_render}"; then
  fail 'producer-only values unexpectedly render the Fedify consumer'
fi

consumer_render="${render_dir}/consumer.yaml"
"${helm_bin}" template kosmo "${chart_dir}" \
  --set env=dev \
  --set workloads.enabled=false \
  --set fedify.consumer.enabled=true \
  --set-string postgres.credentials.fedify.databaseUrl=postgres://trusted \
  --set-string postgres.credentials.fedify.passwordSecret.name=trusted-secret \
  --set-string postgres.credentials.fedify.passwordSecret.key=password \
  "${queue_values[@]}" \
  >"${consumer_render}"
assert_count 2 'name: kosmo-fedify-consumer' "${consumer_render}"
assert_count 1 'name: FEDIFY_QUEUE_DATABASE_URL' "${consumer_render}"
assert_count 1 'name: FEDIFY_QUEUE_DATABASE_PASSWORD' "${consumer_render}"
assert_count 1 'name: FEDIFY_DATABASE_PASSWORD' "${consumer_render}"
assert_count 1 '            - fedify-queue' "${consumer_render}"
assert_count 1 'value: "0.0.0.0"' "${consumer_render}"
assert_count 1 'value: "postgres://queue"' "${consumer_render}"
assert_count 1 'value: "postgres://trusted"' "${consumer_render}"
if grep -Eq '^kind: (Rollout|HTTPRoute|HPA)$' "${consumer_render}"; then
  fail 'consumer-only values unexpectedly render a normal workload or public route'
fi
if awk '
  /^kind: / { kind = $2 }
  /^  name: kosmo-fedify-consumer$/ && kind == "Service" { found = 1 }
  END { exit found ? 0 : 1 }
' "${consumer_render}"; then
  fail 'Fedify consumer unexpectedly renders a Service'
fi

if "${helm_bin}" template kosmo "${chart_dir}" \
  --set env=dev \
  --set fedify.consumer.enabled=true \
  --set-string postgres.credentials.fedifyQueue.databaseUrl=postgres://queue \
  >"${render_dir}/partial.yaml" 2>"${render_dir}/partial.err"; then
  fail 'incomplete queue credentials unexpectedly rendered'
fi
grep -Fq 'postgres.credentials.fedifyQueue' "${render_dir}/partial.err" \
  || fail 'incomplete queue credentials error did not identify the selector'

if "${helm_bin}" template kosmo "${chart_dir}" \
  --set env=dev \
  --set fedify.consumer.enabled=true \
  "${queue_values[@]}" \
  >"${render_dir}/missing-trusted.yaml" 2>"${render_dir}/missing-trusted.err"; then
  fail 'consumer without trusted domain credentials unexpectedly rendered'
fi
grep -Fq 'postgres.credentials.fedify' "${render_dir}/missing-trusted.err" \
  || fail 'missing trusted consumer credentials error did not identify the selector'

echo 'Helm Fedify queue render assertions passed.'
