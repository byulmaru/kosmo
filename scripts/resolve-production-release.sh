#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:?usage: resolve-production-release.sh RELEASE_TAG}"
repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
asset_name="docker-image-ref.txt"

if [[ ! "${release_tag}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release tag must be a stable SemVer tag without a prefix: ${release_tag}" >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT

gh release verify "${release_tag}" --repo "${repository}" >/dev/null
gh release download "${release_tag}" --repo "${repository}" --pattern "${asset_name}" --dir "${work_dir}" >/dev/null
gh release verify-asset "${release_tag}" "${work_dir}/${asset_name}" --repo "${repository}" >/dev/null

image_ref="$(<"${work_dir}/${asset_name}")"
expected_prefix="ghcr.io/${repository}@"
digest="${image_ref#"${expected_prefix}"}"
if [[ "${image_ref}" == "${digest}" || ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "verified release asset does not contain the expected GHCR digest reference" >&2
  exit 1
fi

printf '%s\n' "${image_ref}"
