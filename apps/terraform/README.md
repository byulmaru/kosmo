# Kosmo application infrastructure

이 Terraform root는 Kosmo 애플리케이션 전용 클라우드 리소스를 관리한다.

## 관리 범위

- 기존 Firebase 활성화와 Android/iOS 앱 등록 (`moe.kos`)
- Google Play Developer API 활성화, Android Publisher 전용 service account와 최소 WIF 권한
- 각 store workflow에 필요한 GitHub Actions Workload Identity Federation. Android Play는 `main`의 정확한 workflow와 기존 `prod` Environment만 허용한다.
- Terraform plan/apply가 공유하는 GitHub Actions WIF 서비스 계정
- GitHub에서 직접 관리하는 Actions environment와 변수 (`terraform-apply`, 승인형 `prod` release)
- `byulmaru-kosmo-prod-postgresql-backups-822638974464` PostgreSQL backup bucket과 `byulmaru-kosmo-prod-postgres-backup` EKS Pod Identity role
- Argo CD `kosmo` ApplicationSet이 생성하는 `kosmo-dev` Application과 별도 `kosmo-prod` Application의 선언

Firebase를 Google Cloud 프로젝트에 추가하는 작업은 되돌릴 수 없다. 앱 리소스에는 `PREVENT` 삭제 정책을 적용한다.

iOS native 배포는 App Store Connect TestFlight 하나만 사용하며, native module 변경이 없는 업데이트는 OTA로 배포한다. 저장소의 Firebase App Distribution workflow와 Fastlane 경로는 제거했다. 해당 service account의 IAM 권한과 WIF provider는 이 설정에서 비활성화·제거했지만, App Distribution API와 `PREVENT` 리소스 선언은 Terraform state의 두 단계 정리를 위해 남아 있으며 외부 리소스 정리는 별도 reviewed plan으로 진행해야 한다.

## 도구와 인증

```sh
cd apps/terraform
mise trust --all
mise install
gcloud auth login
```

Terraform 실행 시에는 장기 credential 파일 대신 현재 `gcloud` 계정의 단기 token을 주입한다. Argo CD 리소스를 읽는 plan에는 `ARGOCD_SERVER=argocd-aws.tail1fdd55.ts.net:443`과 SSO로 발급받은 `ARGOCD_AUTH_TOKEN`도 필요하다. CI는 GitHub OIDC token을 Argo CD Dex에서 교환해 장기 token 없이 인증한다.

## 검증과 적용

최초 bootstrap에서는 Terraform state와 이 root가 소유하는 AWS 리소스만 관리할 수 있는 AWS OIDC role을 만든다. AWS backup bucket 또는 Pod Identity role 구성이 바뀌면 plan 전에 같은 스크립트를 다시 실행해 provisioning 권한을 동기화한다.

```sh
./scripts/ensure-ci-aws-role.sh
```

GCP 리소스를 적용한 뒤 store Environment와 변수는 각 workflow의 bootstrap 절차에 따라 GitHub에서 직접 관리한다. `terraform-apply` Environment는 `main`만 허용한다. Terraform workflow의 repository 변수 `GCP_TERRAFORM_PROVIDER`, `GCP_TERRAFORM_SERVICE_ACCOUNT`는 각 Terraform output을 기준으로 설정하고, `AWS_TERRAFORM_ROLE_ARN`은 `ensure-ci-aws-role.sh`의 마지막 출력값으로 설정한다. Production GitHub 설정은 [Production release 운영](../../docs/operations/production-release.md)의 첫 전환 절차에서 적용하고 live API로 검증한다.

`main`을 push하면 canonical Docker Build가 이미지를 한 번 build해 GHCR에 push하고 같은 run에 보존된 immutable digest manifest artifact를 발행한다. 기존 `Deploy Dev` 경로는 해당 triggering run의 full SHA와 digest를 사용해 자동 배포한다. Production release는 이 push로 시작하지 않으며, Main에 저장된 release workflow를 `main` ref에서 `workflow_dispatch`로 실행할 때만 요청된다. `target_sha`를 입력하면 해당 full SHA를 사용하고, 비워 두면 preflight가 실행 시점의 최신 `main` commit을 immutable target으로 확정한다. Preflight는 target SHA의 성공한 main push Docker Build run과 그 run에 보존된 digest manifest artifact를 검증한다. `prod` Environment required reviewer의 한 번의 승인 전에는 production source checkout, prod Vault/Sentry credential 접근과 image build를 수행하지 않는다. 승인 뒤 gated job은 target source를 checkout하거나 image를 재build·재push하지 않고, preflight가 확정한 canonical digest를 production migration과 모든 활성화 workload에 사용한다. Dev와 production은 같은 digest를 공유하며, Web의 공개 채널 설정은 image input이 아니라 Helm `ENVIRONMENT`와 BFF `/channel.js` 런타임 경계로 선택한다.

Main에 저장된 release workflow를 `main` ref에서 `workflow_dispatch`로 실행하면 `target_sha`를 선택할 수 있다. 입력하면 repository에 존재하는 정확한 40자리 commit SHA를 production target으로 사용하고, 비워 두면 preflight가 최신 `main`을 resolve한 뒤 성공한 canonical Docker Build run과 그 run에 보존된 digest manifest artifact를 검증한다. Dispatch 경로는 `prod` Environment 승인 전에는 target checkout·prod Vault/Sentry credential 접근·image build를 하지 않으며, 승인 뒤 preflight가 확정한 target SHA와 canonical digest를 같은 migration·workload 경로로 재빌드 없이 배포한다. Workflow summary에는 requester, workflow definition ref, trigger, canonical build run·digest와 resolved target SHA를 남기고, 명시적 `target_sha` 입력과 dispatch의 `github.sha` 구분은 Actions run/event metadata에서 확인한다. Git tag, `production` branch와 일반 branch push는 production source·approval·배포를 시작하지 않으며, production workload identity는 tag가 아니라 full SHA와 canonical GHCR digest다.

Production PostgreSQL backup은 `s3://byulmaru-kosmo-prod-postgresql-backups-822638974464/kosmo-prod/`에 저장한다. Bucket 객체는 S3의 기본 SSE-S3 암호화를 사용하며 별도 default encryption resource를 관리하지 않는다. Bucket은 public access 차단, TLS-only policy, versioning과 lifecycle을 사용하며 Terraform destroy로 제거되지 않는다. `byulmaru-kosmo-prod-postgres-backup` role은 EKS Pod Identity 전용이며 Barman의 bucket 확인을 위한 bucket-level list 권한과 `kosmo-prod/` prefix의 backup/WAL 객체 관리 권한만 가진다. Bucket과 role ARN은 각각 `postgres_backup_bucket_arn`, `postgres_backup_role_arn` Terraform output으로 확인한다.

## Google Play 내부 테스트 bootstrap

Android store 배포는 [Google Play Developer API](https://developers.google.com/android-publisher/getting_started)와 Google Play Console을 사용한다. Terraform은 API 활성화, 전용 service account, `main`의 정확한 workflow와 기존 `prod` Environment만 신뢰하는 WIF provider, 그리고 해당 service account의 `roles/iam.workloadIdentityUser` binding만 관리한다. Play Console app·첫 AAB·app signing·upload key·tester·track·권한과 `supply` 선행 조건은 [앱의 Android Google Play 배포 절차](../app/README.md)에서 수동으로 관리한다. 정적 service account JSON key는 만들거나 저장하지 않는다.

Terraform 적용 후 다음 값을 확인한다.

```sh
terraform output -raw android_play_service_account
terraform output -raw android_play_workload_identity_provider
```

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

정적 Google credential은 없으므로 정기 key rotation은 필요하지 않다. repository, workflow, branch 또는 environment가 바뀌면 WIF provider의 숫자 ID 기반 trust condition을 먼저 수정하고 저장한 plan을 적용한다. Android Play provider는 `main`의 `.github/workflows/android-play-internal-distribution.yml`과 기존 `prod` Environment만 허용한다. Firebase App Distribution provider는 disabled 상태이고 해당 service account의 GitHub Actions binding은 제거됐으며, 두 리소스는 `PREVENT` 삭제 정책의 후속 state 정리 전까지 deprecated 상태로 유지한다.

긴급 차단은 WIF provider에 `disabled = true`를 추가해 적용한다. 현재 Firebase App Distribution provider는 이 상태이며 GitHub Actions와 project IAM binding도 제거되어 있다. 영구 폐기는 외부 사용 중단을 확인한 뒤 별도 검토로 보호된 provider·service account·API 리소스를 state에서 제거한다.
