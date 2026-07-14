#!/usr/bin/env bash
set -euo pipefail

project_id="byulmaru-kosmo"
group_alias="native-testers"
group_display_name="Kosmo Native Testers"

project_number="$(gcloud projects describe "${project_id}" --format='value(projectNumber)')"
access_token="$(gcloud auth print-access-token)"
group_url="https://firebaseappdistribution.googleapis.com/v1/projects/${project_number}/groups/${group_alias}"
response_file="$(mktemp)"
trap 'rm -f "${response_file}"' EXIT

status="$(curl --silent --show-error --output "${response_file}" --write-out '%{http_code}' \
  --header "Authorization: Bearer ${access_token}" \
  --header "x-goog-user-project: ${project_id}" \
  "${group_url}")"

case "${status}" in
  200)
    echo "Firebase tester group ${group_alias} already exists."
    ;;
  404)
    curl --fail --silent --show-error \
      --header "Authorization: Bearer ${access_token}" \
      --header 'Content-Type: application/json' \
      --header "x-goog-user-project: ${project_id}" \
      --data "{\"displayName\":\"${group_display_name}\"}" \
      "https://firebaseappdistribution.googleapis.com/v1/projects/${project_number}/groups?groupId=${group_alias}" \
      >/dev/null
    echo "Created Firebase tester group ${group_alias}."
    ;;
  *)
    cat "${response_file}" >&2
    echo "Failed to inspect Firebase tester group ${group_alias}: HTTP ${status}" >&2
    exit 1
    ;;
esac
