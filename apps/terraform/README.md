# Kosmo application infrastructure

이 Terraform root는 Kosmo 애플리케이션 전용 클라우드 리소스를 관리한다.

## 관리 범위

- Firebase 활성화와 Android/iOS 앱 등록 (`moe.kos`)
- Firebase App Distribution 서비스 계정과 최소 IAM 권한
- `main`의 지정 workflow만 허용하는 GitHub Actions Workload Identity Federation
- Terraform plan/apply가 공유하는 GitHub Actions WIF 서비스 계정
- 관리자 bootstrap으로 만드는 GitHub environment와 Actions 변수 (`native-test-distribution`, 승인형 `ios-device-onboarding`)
- Firebase provider가 지원하지 않는 `native-testers` group의 멱등 REST bootstrap
- `kosmo` ECR 저장소와 Docker Build 전용 GitHub Actions OIDC push role
- ECR의 `main`/`stable` 이미지 보호, untagged 1일 만료, 나머지 이미지 7일 만료 정책
- `byulmaru-kosmo-prod-postgresql-backups-822638974464` PostgreSQL backup bucket과 `byulmaru-kosmo-prod-postgres-backup` EKS Pod Identity role
- Argo CD `kosmo` ApplicationSet이 생성하는 `kosmo-dev` Application과 별도 `kosmo-prod` Application의 선언

Firebase를 Google Cloud 프로젝트에 추가하는 작업은 되돌릴 수 없다. 앱 리소스에는 `PREVENT` 삭제 정책을 적용한다.

## 도구와 인증

```sh
cd apps/terraform
mise trust --all
mise install
gcloud auth login
```

GitHub bootstrap은 `gh auth token`을 사용한다. `gh auth status`가 성공해야 한다.

Terraform 실행 시에는 장기 credential 파일 대신 현재 `gcloud` 계정의 단기 token을 주입한다. Argo CD 리소스를 읽는 plan에는 `ARGOCD_SERVER=argocd-aws.tail1fdd55.ts.net:443`과 SSO로 발급받은 `ARGOCD_AUTH_TOKEN`도 필요하다. CI는 GitHub OIDC token을 Argo CD Dex에서 교환해 장기 token 없이 인증한다.

## 검증과 적용

최초 bootstrap에서는 Terraform state와 이 root가 소유하는 AWS 리소스만 관리할 수 있는 AWS OIDC role을 만든다. ECR 또는 push role 구성이 바뀌면 plan 전에 같은 스크립트를 다시 실행해 provisioning 권한을 동기화한다.

```sh
./scripts/ensure-ci-aws-role.sh
```

GCP 리소스를 적용한 뒤 관리 권한이 있는 로컬 `gh` 인증으로 GitHub environment와 Actions 변수를 bootstrap한다. 이 스크립트는 CI에서 실행하지 않는다.

```sh
./scripts/ensure-github.sh
```

main 브랜치를 push하면 Docker Build는 `main` 이미지 태그를 갱신한다. 다른 브랜치에서 수동 실행하면 dev 환경의 Vault build role로 shared 설정을 읽고 `branch-<브랜치명>`과 `sha-*` 태그로 ECR에도 이미지를 push한다. 이름과 관계없이 Git tag를 push하면 prod 환경의 Vault build role로 image를 build하고 `sha-*`, `stable` metadata를 발행한 뒤, `prod` Environment 승인 job이 같은 build digest를 Argo CD에 배포한다. Git tag 이름은 workflow 실행과 audit만 식별하며 container tag로 발행하지 않으므로 `main` 같은 운영 tag가 dev용 image tag를 덮어쓰지 않는다. Production workload identity는 tag가 아니라 build digest이며 `stable`은 현재 production 후보 image가 lifecycle로 삭제되지 않게 보존하는 표식일 뿐이다. ECR에서는 `main`, `stable`, `branch-*`, `sha-*`를 갱신할 수 있다. Lifecycle policy는 현재 `main`과 `stable` image를 보호하고, untagged image는 하루 뒤, 그 외 image는 7일 뒤 만료한다.

ECR repository URL과 push role ARN은 공개된 고정 식별자이므로 Docker Build workflow에 직접 선언한다. ECR 리소스가 생성된 뒤에는 별도 GitHub repository variable bootstrap 없이 GHCR과 ECR에 같은 태그를 함께 push한다.

Production PostgreSQL backup은 `s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/`에 저장한다. Bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket은 public access 차단, TLS-only policy, versioning과 lifecycle을 사용하며 Terraform destroy로 제거되지 않는다. `byulmaru-kosmo-prod-postgres-backup` role은 EKS Pod Identity 전용이며 `kosmo-prod/` prefix의 backup/WAL 객체만 관리한다. Bucket과 role ARN은 각각 `postgres_backup_bucket_arn`, `postgres_backup_role_arn` Terraform output으로 확인한다.

`ios-device-onboarding`은 `robin-maki`의 승인을 요구하며, Firebase WIF 입력과 `MATCH_GIT_URL`을 일반 배포 환경과 별도로 받는다. Apple signing secret과 공개 native test 설정은 `apps/app/README.md`의 iOS Ad Hoc 배포 절차에 따라 해당 environment에 수동으로 넣는다.

그 뒤 `apps/terraform/**` 또는 Terraform workflow가 바뀐 PR에서는 GCP/Firebase/IAM/WIF plan을 실행해 PR comment와 artifact로 남긴다. Merge queue에서는 최신 `main`과 PR을 합친 commit으로 plan을 다시 만들며, 그 commit이 `main`에 병합되면 같은 commit과 repository tree에서 만든 merge queue plan artifact만 찾아 그대로 apply한다. plan과 apply는 같은 GCP 서비스 계정과 AWS role을 사용한다.

Merge queue plan은 OIDC trust를 먼저 배포한 뒤 활성화한다. GCP WIF condition 변경을 기존 PR plan 경로로 apply하고, 관리자 AWS credential로 `./scripts/ensure-ci-aws-role.sh`를 다시 실행한 뒤 repository variable을 설정한다. 활성화 전 main apply는 기존 PR plan을 사용하되 동일한 repository tree인지 계속 검증한다.

```sh
gh variable set TERRAFORM_MERGE_GROUP_PLAN_ENABLED --repo byulmaru/kosmo --body true
```

외부 기여자의 PR workflow는 기여 이력과 무관하게 저장소 관리자의 실행 승인을 받아야 한다. 이 정책은 GitHub Actions의 `all_external_contributors` 설정으로 관리하며, 조직 구성원의 PR만 자동 실행한다.

로컬 bootstrap 또는 복구가 필요할 때는 아래 순서로 실행한다.

```sh
export AWS_PROFILE=default
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export ARGOCD_SERVER=argocd-aws.tail1fdd55.ts.net:443
export ARGOCD_AUTH_TOKEN='<SSO access token>'

terraform fmt -check
terraform init
terraform validate
terraform plan -input=false -out=terraform.tfplan
terraform apply -auto-approve terraform.tfplan
./scripts/ensure-github.sh
./scripts/ensure-tester-group.sh
terraform plan -input=false -detailed-exitcode
```

Firebase 약관을 아직 수락하지 않았다면 먼저 Firebase Console에서 같은 계정으로 약관을 수락한다.

## State backend

state는 기존 조직 S3 bucket의 Kosmo Terraform 전용 key에 저장한다.

```sh
AWS_PROFILE=default terraform init
```

bucket은 `byulmaru-terraform-state`, state key는 `kosmo/terraform.tfstate`이며 S3 native lockfile을 사용한다. AWS profile 이름이 다르면 `AWS_PROFILE`만 바꾼다. credential, `*.tfvars`, state, plan 파일은 커밋하지 않는다.

## Rotation과 revocation

정적 Google credential은 없으므로 정기 key rotation은 필요하지 않다. repository, workflow, branch 또는 environment가 바뀌면 WIF provider의 숫자 ID 기반 trust condition을 먼저 수정하고 저장한 plan을 적용한다. 현재 distribution provider는 `main`의 `ios-ad-hoc-distribution.yml`과 승인형 `ios-device-onboarding.yml`만 허용한다.

긴급 차단은 WIF provider에 `disabled = true`를 추가해 적용한다. 영구 폐기는 service account의 `roles/iam.workloadIdentityUser` binding을 제거한 plan을 먼저 적용한 뒤, 별도 검토로 보호된 provider와 service account의 deletion policy를 해제한다.
