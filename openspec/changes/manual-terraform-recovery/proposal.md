## Why

PR #766 병합 뒤 Terraform 자동 apply가 reviewed PR plan과 최신 main plan의 의미 차이로 apply 전에 중단되었다. 기존 자동 경로의 안전한 불일치 차단은 유지하면서, 운영자가 선택한 최신 `main` commit을 한 번의 수동 실행에서 Plan하고 그 same-run saved plan만 Apply할 수 있는 복구 경로가 필요하다.

## What Changes

- 기존 Terraform workflow에 `workflow_dispatch` 수동 경로를 추가한다.
- 수동 Plan과 Apply는 `refs/heads/main`에서만 실행하고, dispatch 시 선택된 `github.sha`를 Plan과 Apply 양쪽에서 고정한다.
- 수동 Apply는 같은 workflow run에서 성공한 Plan이 만든 artifact만 사용하며, Plan 실패·artifact 누락·artifact 불일치 시 Apply하지 않는다.
- 수동 Plan과 Apply job은 기존 AWS `environment:terraform-apply` subject를 위해 Environment를 계속 사용하고, Environment의 main branch policy와 Terraform native saved-plan stale validation을 유지한다. GCP WIF 조건은 Environment에 의존하지 않으며, 현재 Environment에 required reviewer가 없다는 사실을 승인 경계로 오해하지 않는다.
- Terraform CI용 `kosmo-terraform` GCP WIF 조건은 기존 `repository_id`만 고정하고 `refs/heads/main` 또는 `pull_request` + `base_ref == main`만 허용한다. owner ID, workflow ref, Environment와 비-PR event 이름은 조건에서 제한하지 않는다. 따라서 같은 repository의 main/PR인 다른 workflow도 GCP trust를 만족할 수 있고, PR 예외는 read-only를 보장하지 않는다. AWS 기존 `environment:terraform-apply` subject는 계속 재사용한다.
- 기존 pull request Plan과 push의 reviewed/current semantic comparison 및 불일치 차단은 변경하지 않는다.
- `apps/terraform/README.md`와 필요한 운영 설명을 수동 경로 및 trust 선행 순서에 맞춰 갱신하고, 최소 OpenSpec·위험 비례 검증을 함께 전달한다.

## Authority / Provenance

- Canonical: 없음. `docs/domain`과 `docs/design`을 확인했으며 적용되는 제품 도메인·UI 디자인 문서는 없다. 운영 context는 `apps/terraform/README.md`에서 확인한다.
- Linear Contract: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 recovery workflow, 운영 문서, 검증, 전체 정합성, OpenSpec 작성·구현·archive를 단일 이슈가 소유한다.
- Related existing authority: [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다) — 현재 PR reviewed plan 선택과 push apply의 불일치 차단; [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다) — semantic comparison과 native stale validation의 상위 배경. PROD-609가 PROD-586의 최신 자동 경로 정리를 전달한다.
- Linear Implementations: `PROD-898` 자체가 implementation, verification, cross-slice consistency, spec synchronization 및 completion 후 archive를 소유한다. 별도 구현·통합·archive 이슈는 없다.

## Capabilities

### New Capabilities

- `manual-terraform-recovery`: 최신 main commit을 수동으로 Plan한 뒤 같은 run의 성공한 saved plan만 Apply하는 main-only Terraform recovery 경로.

### Modified Capabilities

- 없음. 기존 자동 PR/push Terraform apply 계약은 새 수동 capability와 병렬로 보존한다.

## Impact

- `.github/workflows/terraform.yml`: 수동 dispatch, main-only guards, same-run Plan artifact와 Apply 연결, 기존 자동 경로 보존.
- `apps/terraform/main.tf`: `kosmo-terraform` GCP WIF 조건을 기존 `repository_id`와 main ref 또는 main 대상 PR 분기로 정렬한다. GitHub issuer/provider와 service account IAM 연결, Firebase/native-distribution WIF 및 Firebase 리소스는 변경하지 않는다.
- `apps/terraform/README.md` 및 필요한 운영 문서: 수동 recovery, credential trust 선행 Apply, 검증·실제 Apply 증거의 경계를 문서화한다.
- OpenSpec capability/spec와 workflow validation: 소스 문자열·정규식·AST 존재 검사가 아니라 실행 조건, artifact 흐름, 실패 경로와 기존 자동 경로 보존을 검증한다.
