#!/usr/bin/env bash
set -euo pipefail

role_name="github-actions-kosmo-terraform"
policy_name="terraform-kosmo-state"
infrastructure_policy_name="terraform-kosmo-infrastructure"

trust_policy='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Federated":"arn:aws:iam::822638974464:oidc-provider/token.actions.githubusercontent.com"},"Action":"sts:AssumeRoleWithWebIdentity","Condition":{"StringEquals":{"token.actions.githubusercontent.com:aud":"sts.amazonaws.com"},"StringLike":{"token.actions.githubusercontent.com:sub":["repo:byulmaru/kosmo:pull_request","repo:byulmaru/kosmo:environment:terraform-apply"]}}}]}'
state_policy='{"Version":"2012-10-17","Statement":[{"Sid":"TerraformStateBucket","Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::byulmaru-terraform-state","Condition":{"StringLike":{"s3:prefix":"kosmo/terraform.tfstate*"}}},{"Sid":"TerraformState","Effect":"Allow","Action":["s3:GetObject","s3:PutObject"],"Resource":"arn:aws:s3:::byulmaru-terraform-state/kosmo/terraform.tfstate"},{"Sid":"TerraformStateLock","Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::byulmaru-terraform-state/kosmo/terraform.tfstate.tflock"}]}'
infrastructure_policy='{"Version":"2012-10-17","Statement":[{"Sid":"ListGitHubActionsOidcProviders","Effect":"Allow","Action":"iam:ListOpenIDConnectProviders","Resource":"*"},{"Sid":"ReadGitHubActionsOidcProvider","Effect":"Allow","Action":"iam:GetOpenIDConnectProvider","Resource":"arn:aws:iam::822638974464:oidc-provider/token.actions.githubusercontent.com"},{"Sid":"ManageKosmoEcrRepository","Effect":"Allow","Action":["ecr:CreateRepository","ecr:DeleteRepository","ecr:DescribeRepositories","ecr:GetLifecyclePolicy","ecr:PutLifecyclePolicy","ecr:DeleteLifecyclePolicy","ecr:PutImageScanningConfiguration","ecr:PutImageTagMutability","ecr:ListTagsForResource","ecr:TagResource","ecr:UntagResource"],"Resource":"arn:aws:ecr:ap-northeast-2:822638974464:repository/kosmo"},{"Sid":"ManageKosmoEcrPushRole","Effect":"Allow","Action":["iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:UpdateAssumeRolePolicy","iam:GetRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy","iam:ListRolePolicies","iam:ListAttachedRolePolicies","iam:ListInstanceProfilesForRole","iam:ListRoleTags","iam:TagRole","iam:UntagRole"],"Resource":"arn:aws:iam::822638974464:role/github-actions-kosmo-ecr-push"},{"Sid":"ManagePostgresBackupBucket","Effect":"Allow","Action":["s3:CreateBucket","s3:DeleteBucket","s3:GetAccelerateConfiguration","s3:GetBucketAcl","s3:GetBucketCORS","s3:GetBucketLocation","s3:GetBucketLogging","s3:GetBucketObjectLockConfiguration","s3:GetBucketPolicy","s3:GetBucketPolicyStatus","s3:GetBucketPublicAccessBlock","s3:GetBucketRequestPayment","s3:GetBucketTagging","s3:GetBucketVersioning","s3:GetBucketWebsite","s3:GetEncryptionConfiguration","s3:GetLifecycleConfiguration","s3:GetReplicationConfiguration","s3:ListBucket","s3:PutBucketPolicy","s3:DeleteBucketPolicy","s3:PutBucketPublicAccessBlock","s3:DeleteBucketPublicAccessBlock","s3:PutBucketTagging","s3:DeleteBucketTagging","s3:PutBucketVersioning","s3:PutLifecycleConfiguration"],"Resource":"arn:aws:s3:::byulmaru-kosmo-prod-postgresql-backups-822638974464"},{"Sid":"ManagePostgresBackupRole","Effect":"Allow","Action":["iam:CreateRole","iam:DeleteRole","iam:GetRole","iam:UpdateAssumeRolePolicy","iam:GetRolePolicy","iam:PutRolePolicy","iam:DeleteRolePolicy","iam:ListRolePolicies","iam:ListAttachedRolePolicies","iam:ListInstanceProfilesForRole","iam:ListRoleTags","iam:TagRole","iam:UntagRole"],"Resource":"arn:aws:iam::822638974464:role/byulmaru-kosmo-prod-postgres-backup"}]}'

if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "${role_name}" \
    --policy-document "${trust_policy}"
else
  aws iam create-role \
    --role-name "${role_name}" \
    --assume-role-policy-document "${trust_policy}" \
    >/dev/null
fi

aws iam put-role-policy \
  --role-name "${role_name}" \
  --policy-name "${policy_name}" \
  --policy-document "${state_policy}"

aws iam put-role-policy \
  --role-name "${role_name}" \
  --policy-name "${infrastructure_policy_name}" \
  --policy-document "${infrastructure_policy}"

aws iam get-role --role-name "${role_name}" --query 'Role.Arn' --output text
