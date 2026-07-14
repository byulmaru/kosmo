# Kosmo Firebase infrastructure

이 Terraform root는 `byulmaru-kosmo` 프로젝트의 네이티브 테스트 배포 기반을 관리한다.

## 관리 범위

- Firebase 활성화와 Android/iOS 앱 등록 (`moe.kos`)
- Firebase App Distribution 서비스 계정과 최소 IAM 권한
- `main`의 지정 workflow만 허용하는 GitHub Actions Workload Identity Federation
- Terraform plan/apply가 공유하는 GitHub Actions WIF 서비스 계정
- 관리자 bootstrap으로 만드는 GitHub environment와 Actions 변수 (`native-test-distribution`, 승인형 `ios-device-onboarding`)
- Firebase provider가 지원하지 않는 `native-testers` group의 멱등 REST bootstrap

Firebase를 Google Cloud 프로젝트에 추가하는 작업은 되돌릴 수 없다. 앱 리소스에는 `PREVENT` 삭제 정책을 적용한다.

## 도구와 인증

```sh
cd apps/terraform
mise trust --all
mise install
gcloud auth login
```

GitHub bootstrap은 `gh auth token`을 사용한다. `gh auth status`가 성공해야 한다.

Terraform 실행 시에는 장기 credential 파일 대신 현재 `gcloud` 계정의 단기 token을 주입한다.

## 검증과 적용

최초 bootstrap에서는 Terraform state만 접근할 수 있는 AWS OIDC role을 한 번 만든다.

```sh
./scripts/ensure-ci-aws-role.sh
```

GCP 리소스를 적용한 뒤 관리 권한이 있는 로컬 `gh` 인증으로 GitHub environment와 Actions 변수를 bootstrap한다. 이 스크립트는 CI에서 실행하지 않는다.

```sh
./scripts/ensure-github.sh
```

`ios-device-onboarding`은 `robin-maki`의 승인을 요구하며, Firebase WIF 입력과 `MATCH_GIT_URL`을 일반 배포 환경과 별도로 받는다. Apple signing secret과 공개 native test 설정은 `apps/app/README.md`의 iOS Ad Hoc 배포 절차에 따라 해당 environment에 수동으로 넣는다.

그 뒤 `apps/terraform/**` 또는 Terraform workflow가 바뀐 PR에서는 GCP/Firebase/IAM/WIF plan을 실행해 PR comment와 artifact로 남긴다. PR이 `main`에 병합되면 같은 repository tree에서 만든 성공한 plan artifact만 찾아 그대로 apply한다. plan과 apply는 같은 GCP 서비스 계정과 AWS role을 사용한다.

외부 기여자의 PR workflow는 기여 이력과 무관하게 저장소 관리자의 실행 승인을 받아야 한다. 이 정책은 GitHub Actions의 `all_external_contributors` 설정으로 관리하며, 조직 구성원의 PR만 자동 실행한다.

로컬 bootstrap 또는 복구가 필요할 때는 아래 순서로 실행한다.

```sh
export AWS_PROFILE=default
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"

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
