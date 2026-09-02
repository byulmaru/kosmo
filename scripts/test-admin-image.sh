#!/bin/sh
set -eu

image=kosmo-admin-smoke
port=18080
container=''
tmpdir=''

cleanup() {
  if [ -n "$container" ]; then
    docker stop "$container" >/dev/null 2>&1 || true
  fi
  if [ -n "$tmpdir" ] && [ -d "$tmpdir" ]; then
    rm -rf "$tmpdir"
  fi
}
trap cleanup EXIT

tmpdir="$(mktemp -d)"

docker build --target runtime --tag "$image" .
container="$(docker run --detach --rm --publish "127.0.0.1:$port:8080" "$image" admin)"

attempt=0
until test "$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/healthz")" = 200; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Admin image did not become healthy' >&2
    exit 1
  fi
  sleep 1
done

base_url="http://127.0.0.1:$port"

health_body="$(curl --fail --silent --show-error "$base_url/healthz")"
test "$health_body" = ok

health_post_headers="$tmpdir/health-post.headers"
health_post_status="$(curl --silent --show-error --dump-header "$health_post_headers" --output /dev/null --write-out '%{http_code}' --request POST "$base_url/healthz")"
test "$health_post_status" = 405
grep -Eiq '^allow:[[:space:]]*GET([[:space:]]|$)' "$health_post_headers"

shell_headers="$tmpdir/shell.headers"
shell_body="$tmpdir/shell.body"
curl --fail --silent --show-error --dump-header "$shell_headers" --output "$shell_body" "$base_url/"
grep -Fq 'Kosmo Admin Console' "$shell_body"
grep -Fq '식별 정보 없는 Admin Console Viewer' "$shell_body"
grep -Eiq '^cache-control:[[:space:]]*.*no-store' "$shell_headers"
csp="$(grep -i '^content-security-policy:' "$shell_headers" | sed -E 's/^[^:]+:[[:space:]]*//' | tr -d '\r')"
test -n "$csp"

assert_csp_source() {
  directive="$1"
  source="$2"
  if ! printf '%s\n' "$csp" | grep -Eiq "(^|;[[:space:]]*)${directive}[^;]*${source}"; then
    echo "Admin shell CSP is missing ${directive} ${source}" >&2
    exit 1
  fi
}

assert_csp_source script-src "'self'"
assert_csp_source style-src "'self'"
assert_csp_source connect-src "'self'"
assert_csp_source object-src "'none'"
assert_csp_source frame-ancestors "'none'"
if ! printf '%s\n' "$csp" | grep -Eiq "(^|;[[:space:]]*)script-src[^;]*'nonce-[^']+'" \
  && ! printf '%s\n' "$csp" | grep -Eiq "(^|;[[:space:]]*)script-src[^;]*'sha256-[^']+'"; then
  echo 'Admin shell CSP must authorize generated inline scripts with a nonce or hash' >&2
  exit 1
fi

identity_body="$tmpdir/identity.body"
curl --fail --silent --show-error \
  --header 'Tailscale-User-Login: viewer@example.com' \
  --header 'Tailscale-User-Name: =?UTF-8?B?7Jq07JiB7J6Q?=' \
  --header 'Tailscale-User-Profile-Pic: https://example.com/profile.png' \
  --output "$identity_body" "$base_url/"
grep -Fq '운영자' "$identity_body"
grep -Fq 'viewer@example.com' "$identity_body"
if grep -Fq 'profile.png' "$identity_body"; then
  echo 'Admin shell must not render the Tailscale profile picture' >&2
  exit 1
fi

malformed_body="$tmpdir/malformed.body"
curl --fail --silent --show-error \
  --header 'Tailscale-User-Name: =?UTF-8?B?not base64?=' \
  --output "$malformed_body" "$base_url/"
grep -Fq '식별 정보 없는 Admin Console Viewer' "$malformed_body"

escaped_body="$tmpdir/escaped.body"
curl --fail --silent --show-error \
  --header 'Tailscale-User-Name: <script>alert(1)</script>' \
  --output "$escaped_body" "$base_url/"
grep -Fq '&lt;script>alert(1)&lt;/script>' "$escaped_body"
if grep -Fq '<script>alert(1)</script>' "$escaped_body"; then
  echo 'Admin shell must escape identity display values' >&2
  exit 1
fi

shell_post_headers="$tmpdir/shell-post.headers"
shell_post_status="$(curl --silent --show-error --dump-header "$shell_post_headers" --output /dev/null --write-out '%{http_code}' --request POST "$base_url/")"
test "$shell_post_status" = 405
grep -Eiq '^allow:[[:space:]]*GET([[:space:]]|$)' "$shell_post_headers"

unknown_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' "$base_url/graphql")"
test "$unknown_status" = 404
