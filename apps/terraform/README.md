# Kosmo application infrastructure

이 Terraform root는 Kosmo 애플리케이션 전용 클라우드 리소스를 관리한다.

## 관리 범위

- Firebase 활성화와 Android/iOS 앱 등록 (`moe.kos`)
- Firebase App Distribution 서비스 계정과 최소 IAM 권한
- `main`에 저장된 지정 workflow와 `prod` Environment의 승인된 release만 허용하는 GitHub Actions Workload Identity Federation
- Terraform plan/apply가 공유하는 GitHub Actions WIF 서비스 계정
- GitHub에서 직접 관리하는 Actions environment와 변수 (`native-test-distribution`, 승인형 `ios-device-onboarding`, `terraform-apply`, 승인형 `prod` release)
- Firebase provider가 지원하지 않는 `native-testers` group의 멱등 REST bootstrap
- `kosmo` ECR 저장소와 Docker Build 전용 GitHub Actions OIDC push role
- ECR의 `main`/`stable` 및 환경별 candidate metadata, untagged 1일 만료, 나머지 이미지 7일 만료 정책
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

Terraform 실행 시에는 장기 credential 파일 대신 현재 `gcloud` 계정의 단기 token을 주입한다. Argo CD 리소스를 읽는 plan에는 `ARGOCD_SERVER=argocd-aws.tail1fdd55.ts.net:443`과 SSO로 발급받은 `ARGOCD_AUTH_TOKEN`도 필요하다. CI는 GitHub OIDC token을 Argo CD Dex에서 교환해 장기 token 없이 인증한다.

## 검증과 적용

최초 bootstrap에서는 Terraform state와 이 root가 소유하는 AWS 리소스만 관리할 수 있는 AWS OIDC role을 만든다. ECR 또는 push role 구성이 바뀌면 plan 전에 같은 스크립트를 다시 실행해 provisioning 권한을 동기화한다.

```sh
./scripts/ensure-ci-aws-role.sh
```

GCP 리소스를 적용한 뒤 native/onboarding Environment와 변수는 [앱의 iOS Ad Hoc 관리자 설정](../app/README.md#one-time-administrator-setup)에 따라 GitHub에서 직접 관리한다. `terraform-apply` Environment는 `main`만 허용한다. Terraform workflow의 repository 변수 `GCP_TERRAFORM_PROVIDER`, `GCP_TERRAFORM_SERVICE_ACCOUNT`는 각 Terraform output을 기준으로 설정하고, `AWS_TERRAFORM_ROLE_ARN`은 `ensure-ci-aws-role.sh`의 마지막 출력값으로 설정한다. Production GitHub 설정은 [Production release 운영](../../docs/operations/production-release.md)의 첫 전환 절차에서 적용하고 live API로 검증한다.

`main`을 push하면 Docker Build는 같은 full SHA에서 dev image와 prod production candidate image를 환경별 설정으로 각각 build한다. Dev image는 기존 `Deploy Dev` 경로로 자동 배포하고, prod candidate는 `prod` Environment required reviewer의 한 번의 승인 뒤에만 Argo CD migration·workload를 변경한다. 두 image는 환경별 Web 설정을 포함하므로 동일 digest일 필요가 없으며, production migration과 모든 활성화 workload만 해당 release의 하나의 prod digest를 사용한다. Candidate build에서는 `stable`을 이동하지 않고, 승인된 production sync와 post-deploy 검증이 성공한 digest에만 `stable` 보존 metadata를 적용한다.

Main에 저장된 release workflow를 `main` ref에서 수동 실행하면 repository에 존재하는 정확한 40자리 commit SHA를 production target으로 선택할 수 있다. Manual 경로는 `prod` Environment 승인 전에는 target checkout·prod secret 접근·build를 하지 않으며, 승인 뒤 target SHA에서 build한 digest를 같은 migration·workload 경로로 배포한다. Workflow definition ref와 target SHA, automatic/manual trigger를 audit summary에 구분해 남긴다. Git tag, `production` branch와 일반 branch push는 production source·approval·배포를 시작하지 않으며, production workload identity는 tag가 아니라 full SHA와 build digest다. Lifecycle policy는 dev/prod SHA metadata와 `stable` image를 필요한 기간 보호하고, untagged image는 하루 뒤, 그 외 candidate image는 7일 뒤 만료한다.

ECR repository URL과 push role ARN은 공개된 고정 식별자이므로 Docker Build workflow에 직접 선언한다. ECR 리소스가 생성된 뒤에는 별도 GitHub repository variable bootstrap 없이 GHCR과 ECR에 같은 태그를 함께 push한다.

Production PostgreSQL backup은 `s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/`에 저장한다. Bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket은 public access 차단, TLS-only policy, versioning과 lifecycle을 사용하며 Terraform destroy로 제거되지 않는다. `byulmaru-kosmo-prod-postgres-backup` role은 EKS Pod Identity 전용이며 Barman의 bucket 확인을 위한 bucket-level list 권한과 `kosmo-prod/` prefix의 backup/WAL 객체 관리 권한만 가진다. Bucket과 role ARN은 각각 `postgres_backup_bucket_arn`, `postgres_backup_role_arn` Terraform output으로 확인한다.

`ios-device-onboarding`은 `robin-maki`의 승인을 요구한다. Firebase WIF 입력, `MATCH_GIT_URL`, Apple signing secret과 공개 native test 설정은 `apps/app/README.md`의 iOS Ad Hoc 배포 절차에 따라 각 environment에 직접 넣는다.

그 뒤 `apps/terraform/**` 또는 Terraform workflow가 바뀐 PR에서는 GCP/Firebase/IAM/WIF plan을 실행해 PR comment와 artifact로 남긴다. Plan artifact는 저장소의 Actions 보존 기간만큼 유지하며 apply는 병합된 PR head와 일치하는 미만료 artifact만 선택한다.

PR이 `main`에 병합되면 현재 main에서 plan을 새로 만들고, configuration, variables, 실제 action이 `no-op`이 아닌 resource changes, output changes와 checks가 reviewed plan과 같은지 확인한다. 이 JSON 비교는 sensitive value의 차이를 보존하되 Argo CD Application의 resource version이나 reconcile 시각처럼 실행 사이에 바뀌는 no-op 관측 상태는 제외한다. plan이 다르면 current plan을 자동 적용하지 않고 중단하며, 같으면 reviewed saved plan을 그대로 apply하므로 Terraform의 native stale-plan 검증도 유지된다. 여러 Terraform PR이 같은 merge queue 배치에 포함되어 plan이 달라지면 즉시 apply하지 않고 실패한다. 비교용 JSON은 로그나 artifact에 남기지 않고 job 안에서 삭제한다. plan과 apply는 같은 GCP 서비스 계정과 AWS role을 사용한다.

외부 기여자의 PR workflow는 기여 이력과 무관하게 저장소 관리자의 실행 승인을 받아야 한다. Repository의 Actions 설정에서 fork pull request 승인 정책을 `all_external_contributors`로 직접 관리하며, 조직 구성원의 PR만 자동 실행한다.

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
