## Why

PR #766 병합 뒤 Terraform 자동 apply가 reviewed PR plan과 최신 main plan의 의미 차이로 apply 전에 중단되었다. 기존 자동 경로의 안전한 불일치 차단은 유지하면서, 운영자가 `main`에서 명시적으로 수동 실행해 기존 Apply job의 Terraform 직접 적용을 수행할 수 있는 복구 경로가 필요하다.

## What Changes

- 기존 Terraform workflow에 `workflow_dispatch` 수동 경로를 추가한다.
- 수동 Apply는 `refs/heads/main`에서만 실행하고, dispatch 당시의 `github.sha`를 checkout한다. 실행 중 `main`을 다시 해석하지 않는다.
- 기존 Apply job을 재사용해 기존 인증·Terraform 초기화 뒤 `terraform apply -auto-approve`를 한 번 실행한다. 수동 Plan job, `needs` 의존성, saved plan 파일, artifact 생성·전달·SHA metadata 검증은 추가하지 않는다.
- 수동 Apply job은 기존 AWS `environment:terraform-apply` subject를 위해 Environment를 계속 사용한다. GCP WIF 조건은 `repository_id`, `repository_owner_id`, 정확한 `byulmaru/kosmo/.github/workflows/terraform.yml@` workflow ref prefix를 공통으로 요구하고, `pull_request` + `base_ref == main` 또는 `push`/`workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment만 허용한다. PR 예외는 read-only를 보장하지 않는다. 기존 push Apply의 Terraform native saved-plan stale validation은 그대로 유지한다.
- 다른 workflow, `workflow_run`, Environment 없는 main job, 다른 repository/owner, tag·feature ref의 non-PR 실행은 거부한다. AWS 기존 `environment:terraform-apply` subject, manual direct Apply, 기존 reviewed/current semantic comparison은 계속 재사용한다.
- 기존 pull request Plan과 push의 reviewed/current semantic comparison 및 불일치 차단은 변경하지 않는다.
- `apps/terraform/README.md`와 필요한 운영 설명을 수동 경로 및 trust 선행 순서에 맞춰 갱신하고, 최소 OpenSpec·위험 비례 검증을 함께 전달한다.

## Authority / Provenance

- Canonical: 없음. `docs/domain`과 `docs/design`을 확인했으며 적용되는 제품 도메인·UI 디자인 문서는 없다. 운영 context는 `apps/terraform/README.md`에서 확인한다.
- Linear Contract: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 recovery workflow와 direct Apply 순서, 기존 PR/push 경로 보존을 소유하며 전체 정합성·OpenSpec sync·completion 후 archive를 담당한다.
- Linear Contract: [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다) — repository/owner/workflow/event/ref/Environment WIF 경계와 관련 문서·검증을 승인한다.
- Related existing authority: [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다) — 현재 PR reviewed plan 선택과 push apply의 불일치 차단; [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다) — semantic comparison과 native stale validation의 상위 배경. PROD-609가 PROD-586의 최신 자동 경로 정리를 전달한다.
- Shared change responsibility: `PROD-898`은 이 기존 change의 전체 정합성, spec synchronization 및 completion 후 archive를 소유하고, `PROD-946`은 구현·운영 문서·검증 책임을 이 change에서 공유한다. 새 OpenSpec change는 만들지 않는다.

## Capabilities

### New Capabilities

- `manual-terraform-recovery`: main에서 기존 Apply job의 Terraform 직접 Apply를 실행하는 main-only Terraform recovery 경로.

### Modified Capabilities

- Terraform CI identity trust: `PROD-946`의 좁은 WIF 조건으로 기존 PR Plan·main push Apply·main manual Apply 세 경로만 허용하고, 기존 자동 comparison과 manual direct Apply를 보존한다.

## Impact

- `.github/workflows/terraform.yml`: 수동 dispatch, main-only guard, 기존 Apply job의 직접 Apply 경로, 기존 자동 경로 보존.
- `apps/terraform/main.tf`: `kosmo-terraform` GCP WIF 조건을 `repository_id`·`repository_owner_id`·정확한 workflow ref와 세 허용 event 경로로 정렬한다. GitHub issuer/provider와 service account IAM 연결, Firebase/native-distribution WIF 및 Firebase 리소스는 변경하지 않는다.
- `apps/terraform/README.md` 및 필요한 운영 문서: 수동 recovery, credential trust 선행 Apply, 검증·실제 Apply 증거의 경계를 문서화한다.
- OpenSpec capability/spec와 workflow validation: 소스 문자열·정규식·AST 존재 검사가 아니라 실행 조건, 수동 direct Apply와 push reviewed-plan artifact 흐름, event별 실패 경로와 기존 자동 경로 보존을 검증한다.
