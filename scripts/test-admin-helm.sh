#!/bin/sh
set -eu

chart=apps/helm
fixture="$chart/test-values/admin.yaml"
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT

helm lint "$chart" --set env=dev --values "$fixture"
if helm template kosmo "$chart" --set env=dev --set admin.enabled=true >/dev/null 2>&1; then
  echo 'Admin render accepted missing hostname and proxy labels' >&2
  exit 1
fi
helm template kosmo "$chart" \
  --namespace kosmo-dev \
  --set env=dev \
  --values "$fixture" >"$rendered"

grep -q '^kind: Deployment$' "$rendered"
grep -q '^kind: Service$' "$rendered"
grep -q '^kind: Ingress$' "$rendered"
grep -q '^kind: NetworkPolicy$' "$rendered"
grep -q 'ingressClassName: tailscale' "$rendered"
grep -q 'path: /healthz' "$rendered"
grep -q 'app.kubernetes.io/name: admin' "$rendered"
if grep -q '^kind: HTTPRoute$' "$rendered"; then
  echo 'Admin fixture unexpectedly rendered a public HTTPRoute' >&2
  exit 1
fi

helm lint "$chart" \
  --set env=prod \
  --set imageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --values "$fixture"
helm template kosmo "$chart" \
  --namespace kosmo-prod \
  --set env=prod \
  --set imageDigest=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  --values "$fixture" >/dev/null
