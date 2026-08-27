#!/bin/sh
set -eu

image=kosmo-admin-smoke
port=18080
container=''

cleanup() {
  if [ -n "$container" ]; then
    docker stop "$container" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

docker build --target runtime --tag "$image" .
container="$(docker run --detach --rm --publish "127.0.0.1:$port:8080" "$image" admin)"

attempt=0
until curl --fail --silent --show-error "http://127.0.0.1:$port/healthz" >/dev/null; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 30 ]; then
    echo 'Admin image did not become healthy' >&2
    exit 1
  fi
  sleep 1
done

curl --fail --silent --show-error "http://127.0.0.1:$port/" | grep -q 'Kosmo Admin Console'
status="$(curl --silent --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/graphql")"
test "$status" = 404
