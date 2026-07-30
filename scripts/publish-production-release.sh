#!/usr/bin/env bash
set -euo pipefail

release_tag="${1:?usage: publish-production-release.sh RELEASE_TAG IMAGE_REFERENCE}"
image_ref="${2:?usage: publish-production-release.sh RELEASE_TAG IMAGE_REFERENCE}"
repository="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
asset_name="docker-image-ref.txt"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! "${release_tag}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "release tag must be a stable SemVer tag without a prefix: ${release_tag}" >&2
  exit 1
fi

expected_prefix="ghcr.io/${repository}@"
digest="${image_ref#"${expected_prefix}"}"
if [[ "${image_ref}" == "${digest}" || ! "${digest}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
  echo "image reference must be ghcr.io/${repository}@sha256:<64 lowercase hex characters>" >&2
  exit 1
fi

if [[ "$(gh api "repos/${repository}/immutable-releases" --jq '.enabled')" != "true" ]]; then
  echo "repository immutable releases must be enabled before publishing ${release_tag}" >&2
  exit 1
fi

if [[ -n "${GITHUB_SHA:-}" ]]; then
  tag_commit="$(gh api "repos/${repository}/commits/${release_tag}" --jq '.sha')"
  if [[ "${tag_commit}" != "${GITHUB_SHA}" ]]; then
    echo "release tag ${release_tag} no longer identifies the commit that produced the image" >&2
    exit 1
  fi
fi

work_dir="$(mktemp -d)"
trap 'rm -rf "${work_dir}"' EXIT
asset_path="${work_dir}/${asset_name}"
printf '%s\n' "${image_ref}" >"${asset_path}"

verify_immutable_release() {
  local attempt

  for attempt in {1..12}; do
    if gh release verify "${release_tag}" --repo "${repository}" >/dev/null 2>&1; then
      return 0
    fi
    [[ "${attempt}" -eq 12 ]] || sleep 5
  done
  return 1
}

release_exists=false
release_is_draft=false
if release_is_draft="$(gh release view "${release_tag}" --repo "${repository}" --json isDraft --jq '.isDraft' 2>/dev/null)"; then
  release_exists=true
fi

if [[ "${release_exists}" == "true" && "${release_is_draft}" != "true" ]]; then
  existing_image_ref="$("${script_dir}"/resolve-production-release.sh "${release_tag}")"
  if [[ "${existing_image_ref}" != "${image_ref}" ]]; then
    echo "immutable release ${release_tag} already exists with a different image identity" >&2
    exit 1
  fi

  echo "immutable release ${release_tag} already publishes ${image_ref}"
  exit 0
fi

if [[ "${release_exists}" != "true" ]]; then
  gh release create "${release_tag}" \
    --repo "${repository}" \
    --draft \
    --verify-tag \
    --title "${release_tag}" \
    --generate-notes >/dev/null
fi

gh release upload "${release_tag}" "${asset_path}#${asset_name}" --repo "${repository}" --clobber
gh release edit "${release_tag}" --repo "${repository}" --draft=false >/dev/null
if ! verify_immutable_release; then
  echo "published release ${release_tag} did not become verifiably immutable" >&2
  exit 1
fi
gh release verify-asset "${release_tag}" "${asset_path}" --repo "${repository}" >/dev/null

echo "published immutable release ${release_tag} with ${image_ref}"
