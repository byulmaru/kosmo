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

최초 bootstrap에서는 Terraform state와 이 root가 소유하는 AWS 리소스만 관리할 수 있는 AWS OIDC role을 만든다. ECR 또는 push role 구성이 바뀌면 plan 전에 같은 스크립트를 다시 실행해 provisioning 권한을 동기화한다.

```sh
./scripts/ensure-ci-aws-role.sh
```

GCP 리소스를 적용한 뒤 관리 권한이 있는 로컬 `gh` 인증으로 GitHub environment와 Actions 변수를 bootstrap한다. 이 스크립트는 CI에서 실행하지 않는다.

```sh
./scripts/ensure-github.sh
```

main 브랜치를 push하면 Docker Build는 `main` 이미지 태그를 갱신한다. 다른 브랜치에서 수동 실행하면 `branch-<브랜치명>`과 `sha-*` 태그로 ECR에도 이미지를 push한다. `1.2.0` 형식의 정식 SemVer Git tag를 push하면 `1.2.0`과 `stable` 이미지 태그를 함께 발행하며, `v1.2.0` 형식은 지원하지 않는다. ECR에서는 `main`, `stable`, `branch-*`, `sha-*` 태그를 갱신할 수 있고 정식 버전 태그는 덮어쓸 수 없다. Lifecycle policy는 현재 `main` 이미지와 현재 `stable` 릴리스 이미지를 보호하고, 이전 버전 이미지는 push 후 7일이 지나면 만료한다.

정식 버전 태그는 일회성 발행을 원칙으로 한다. GHCR과 ECR 중 한쪽에만 이미지가 발행된 부분 실패를 같은 Git tag에서 복구해야 할 때만 `aws ecr batch-delete-image --repository-name kosmo --image-ids imageTag=1.2.0 --region ap-northeast-2`로 ECR의 해당 버전 태그를 제거한 뒤 workflow를 재실행한다.

ECR repository URL과 push role ARN은 공개된 고정 식별자이므로 Docker Build workflow에 직접 선언한다. ECR 리소스가 생성된 뒤에는 별도 GitHub repository variable bootstrap 없이 GHCR과 ECR에 같은 태그를 함께 push한다.

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
