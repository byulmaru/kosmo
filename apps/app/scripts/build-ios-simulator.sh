#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "${APP_DIR}/../.." && pwd)"
LOG_DIR="${KOSMO_IOS_BUILD_LOG_DIR:-${APP_DIR}/.native-build/ios}"
DERIVED_DATA_PATH="${APP_DIR}/ios/DerivedData"

log() {
  printf '==> %s\n' "$*"
}

fail() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  set +e

  if [[ "${KOSMO_KEEP_IOS_BUILD:-0}" == "1" ]]; then
    log "Keeping generated iOS project because KOSMO_KEEP_IOS_BUILD=1"
    return
  fi

  rm -rf "${APP_DIR}/ios"
}

trap 'status=$?; cleanup; exit "${status}"' EXIT

require_command() {
  local command_name="$1"
  local install_hint="$2"

  if ! command -v "${command_name}" >/dev/null 2>&1; then
    fail "${command_name} is required. ${install_hint}"
  fi
}

ensure_generated_ios_project_is_untracked() {
  local tracked_files

  tracked_files="$(git -C "${REPO_ROOT}" ls-files apps/app/ios)"
  if [[ -n "${tracked_files}" ]]; then
    printf '%s\n' "${tracked_files}" >&2
    fail "apps/app/ios must remain generated and untracked."
  fi

  if ! git -C "${REPO_ROOT}" check-ignore -q apps/app/ios/; then
    fail "apps/app/ios must stay ignored so Expo CNG output does not become source of truth."
  fi
}

preflight_xcode() {
  require_command xcodebuild "Install Xcode on the macOS runner and select it with xcode-select."
  require_command xcrun "Install Xcode command line tools with the selected Xcode."

  local developer_dir
  if [[ -n "${DEVELOPER_DIR:-}" ]]; then
    developer_dir="${DEVELOPER_DIR}"
    log "DEVELOPER_DIR override: ${developer_dir}"
  else
    developer_dir="$(xcode-select -p 2>/dev/null)" ||
      fail "No Xcode developer directory is selected. Run sudo xcode-select -s /Applications/Xcode.app/Contents/Developer."
    log "xcode-select developer directory: ${developer_dir}"
  fi

  [[ -d "${developer_dir}" ]] ||
    fail "Selected Xcode developer directory does not exist: ${developer_dir}"

  local license_output
  local license_status
  set +e
  license_output="$(xcodebuild -license check 2>&1)"
  license_status=$?
  set -e

  if [[ "${license_status}" -ne 0 ]]; then
    printf '%s\n' "${license_output}" >&2
    if [[ "${license_output}" == *"requires Xcode"* ]] ||
      [[ "${license_output}" == *"command line tools instance"* ]]; then
      fail "xcodebuild requires a full Xcode installation. Select Xcode with sudo xcode-select -s /Applications/Xcode.app/Contents/Developer."
    fi

    fail "Xcode license is not accepted. Run sudo xcodebuild -license accept on the runner."
  fi

  local xcode_version_output
  local xcode_version_status
  set +e
  xcode_version_output="$(xcodebuild -version 2>&1)"
  xcode_version_status=$?
  set -e

  if [[ "${xcode_version_status}" -ne 0 ]]; then
    printf '%s\n' "${xcode_version_output}" >&2
    fail "xcodebuild could not run with ${developer_dir}. Select a full Xcode installation, not Command Line Tools."
  fi

  log "Xcode version:"
  printf '%s\n' "${xcode_version_output}"

  local sdk_path
  sdk_path="$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null)" ||
    fail "iPhone simulator SDK is not available from the selected Xcode."

  local sdk_version
  sdk_version="$(xcrun --sdk iphonesimulator --show-sdk-version 2>/dev/null)" ||
    fail "Could not determine the iPhone simulator SDK version."

  log "iPhone simulator SDK: ${sdk_version} (${sdk_path})"
  xcodebuild -showsdks >"${LOG_DIR}/xcode-sdks.txt"

  local simulator_runtimes_output
  local simulator_runtimes_status
  set +e
  simulator_runtimes_output="$(xcrun simctl list runtimes 2>&1)"
  simulator_runtimes_status=$?
  set -e

  printf '%s\n' "${simulator_runtimes_output}" >"${LOG_DIR}/simulator-runtimes.txt"

  if [[ "${simulator_runtimes_status}" -ne 0 ]]; then
    printf '%s\n' "${simulator_runtimes_output}" >&2
    fail "iOS simulator support is not initialized for the selected Xcode. Run xcodebuild -runFirstLaunch on the runner."
  fi

  if ! printf '%s\n' "${simulator_runtimes_output}" |
    grep -Eq 'com\.apple\.CoreSimulator\.SimRuntime\.iOS|^[[:space:]]*iOS[[:space:]][0-9]'; then
    printf '%s\n' "${simulator_runtimes_output}" >&2
    fail "No iOS simulator runtime is installed. Install one with xcodebuild -downloadPlatform iOS or Xcode > Settings > Components."
  fi
}

preflight_cocoapods() {
  require_command pod "Install CocoaPods on the macOS runner, for example with brew install cocoapods."

  local pod_path
  pod_path="$(command -v pod)"
  local pod_version
  pod_version="$(pod --version 2>&1)" ||
    fail "CocoaPods exists at ${pod_path}, but pod --version failed: ${pod_version}"

  log "CocoaPods: ${pod_version} (${pod_path})"
}

run_logged() {
  local log_name="$1"
  shift

  log "$*"
  "$@" 2>&1 | tee "${LOG_DIR}/${log_name}.log"
}

run_logged_to_file() {
  local log_name="$1"
  shift

  local log_file="${LOG_DIR}/${log_name}.log"

  log "$*"
  set +e
  "$@" >"${log_file}" 2>&1
  local status=$?
  set -e

  if [[ "${status}" -ne 0 ]]; then
    printf 'error: command failed with exit code %s. Last 200 log lines from %s:\n' "${status}" "${log_file}" >&2
    tail -n 200 "${log_file}" >&2 || true
    return "${status}"
  fi

  log "Log saved to ${log_file}"
}

main() {
  cd "${APP_DIR}"
  rm -rf "${LOG_DIR}"
  mkdir -p "${LOG_DIR}"

  preflight_xcode
  ensure_generated_ios_project_is_untracked
  preflight_cocoapods

  log "Cleaning generated iOS project and local DerivedData"
  rm -rf ios "${DERIVED_DATA_PATH}"

  run_logged relay pnpm relay
  run_logged expo-prebuild pnpm exec expo prebuild --clean --platform ios

  [[ -d ios/Kosmo.xcworkspace ]] ||
    fail "Expo prebuild did not produce ios/Kosmo.xcworkspace."

  log "Removing any generated-project DerivedData before xcodebuild"
  rm -rf "${DERIVED_DATA_PATH}"

  run_logged_to_file xcodebuild \
    xcodebuild \
    -workspace ios/Kosmo.xcworkspace \
    -scheme Kosmo \
    -configuration Debug \
    -sdk iphonesimulator \
    -destination "generic/platform=iOS Simulator" \
    -derivedDataPath "${DERIVED_DATA_PATH}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGN_IDENTITY= \
    build
}

main "$@"
