#!/usr/bin/env bash
set -euo pipefail

repository="byulmaru/kosmo"
native_environment="native-test-distribution"
onboarding_environment="ios-device-onboarding"
onboarding_reviewer="robin-maki"
production_environment="production"
production_reviewer="robin-maki"
terraform_environment="terraform-apply"
terraform_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

terraform_output() {
  terraform -chdir="${terraform_root}" output -raw "$1"
}

ensure_environment() {
  local environment="$1"
  local reviewer="${2:-}"

  if [[ -n "${reviewer}" ]]; then
    local reviewer_id
    reviewer_id="$(gh api "users/${reviewer}" --jq '.id')"

    gh api --method PUT "repos/${repository}/environments/${environment}" \
      -F can_admins_bypass=false \
      -F prevent_self_review=false \
      -F 'deployment_branch_policy[protected_branches]=false' \
      -F 'deployment_branch_policy[custom_branch_policies]=true' \
      -F 'reviewers[][type]=User' \
      -F "reviewers[][id]=${reviewer_id}" \
      >/dev/null
  else
    gh api --method PUT "repos/${repository}/environments/${environment}" \
      -F can_admins_bypass=false \
      -F 'deployment_branch_policy[protected_branches]=false' \
      -F 'deployment_branch_policy[custom_branch_policies]=true' \
      >/dev/null
  fi

  if ! gh api "repos/${repository}/environments/${environment}/deployment-branch-policies" \
    --paginate \
    --jq '.branch_policies[] | select(.name == "main") | .id' \
    | grep -q .; then
    gh api --method POST "repos/${repository}/environments/${environment}/deployment-branch-policies" \
      -f name=main \
      -f type=branch \
      >/dev/null
  fi
}

ensure_only_branch_policy() {
  local environment="$1"
  local required_branch="$2"

  while IFS=$'\t' read -r policy_id policy_type policy_name; do
    if [[ "${policy_type}" != "branch" || "${policy_name}" != "${required_branch}" ]]; then
      gh api --method DELETE "repos/${repository}/environments/${environment}/deployment-branch-policies/${policy_id}" >/dev/null
    fi
  done < <(
    gh api "repos/${repository}/environments/${environment}/deployment-branch-policies" \
      --paginate \
      --jq '.branch_policies[] | [.id, .type, .name] | @tsv'
  )
}

verify_production_environment() {
  local reviewer_id
  reviewer_id="$(gh api "users/${production_reviewer}" --jq '.id')"

  gh api "repos/${repository}/environments/${production_environment}" \
    | jq -e --argjson reviewer_id "${reviewer_id}" '
        .can_admins_bypass == false
        and .deployment_branch_policy.protected_branches == false
        and .deployment_branch_policy.custom_branch_policies == true
        and any(
          .protection_rules[];
          .type == "required_reviewers"
          and .prevent_self_review == false
          and any(.reviewers[]; .type == "User" and .reviewer.id == $reviewer_id)
        )
      ' >/dev/null

  local policies
  policies="$(
    gh api "repos/${repository}/environments/${production_environment}/deployment-branch-policies" \
      --paginate \
      --jq '[.branch_policies[] | {name, type}]'
  )"
  jq -e 'length == 1 and .[0].name == "main" and .[0].type == "branch"' <<<"${policies}" >/dev/null
}

ensure_immutable_releases() {
  gh api --method PUT "repos/${repository}/immutable-releases" >/dev/null

  if [[ "$(gh api "repos/${repository}/immutable-releases" --jq '.enabled')" != "true" ]]; then
    echo "immutable releases read-back verification failed" >&2
    exit 1
  fi
}

ensure_environment "${native_environment}"
ensure_environment "${onboarding_environment}" "${onboarding_reviewer}"
ensure_environment "${production_environment}" "${production_reviewer}"
ensure_only_branch_policy "${production_environment}" main
verify_production_environment
ensure_environment "${terraform_environment}"
ensure_immutable_releases

gh variable set FIREBASE_ANDROID_APP_ID --repo "${repository}" --env "${native_environment}" --body "$(terraform_output firebase_android_app_id)"
gh variable set FIREBASE_PROJECT_ID --repo "${repository}" --env "${native_environment}" --body "$(terraform_output firebase_project_id)"

for environment in "${native_environment}" "${onboarding_environment}"; do
  gh variable set FIREBASE_IOS_APP_ID --repo "${repository}" --env "${environment}" --body "$(terraform_output firebase_ios_app_id)"
  gh variable set FIREBASE_TESTER_GROUP --repo "${repository}" --env "${environment}" --body native-testers
  gh variable set GCP_SERVICE_ACCOUNT --repo "${repository}" --env "${environment}" --body "$(terraform_output gcp_service_account)"
  gh variable set GCP_WORKLOAD_IDENTITY_PROVIDER --repo "${repository}" --env "${environment}" --body "$(terraform_output gcp_workload_identity_provider)"
  gh variable set MATCH_GIT_URL --repo "${repository}" --env "${environment}" --body git@github.com:byulmaru/kosmo-ios-signing.git
done

gh variable set AWS_TERRAFORM_ROLE_ARN --repo "${repository}" --body arn:aws:iam::822638974464:role/github-actions-kosmo-terraform
gh variable set GCP_TERRAFORM_PROVIDER --repo "${repository}" --body "$(terraform_output terraform_gcp_workload_identity_provider)"
gh variable set GCP_TERRAFORM_SERVICE_ACCOUNT --repo "${repository}" --body "$(terraform_output terraform_gcp_service_account)"

gh api --method PUT "repos/${repository}/actions/permissions/fork-pr-contributor-approval" \
  -f approval_policy=all_external_contributors \
  >/dev/null
