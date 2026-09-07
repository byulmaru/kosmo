## Context

이 decision log는 [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)의 승인된 수동 recovery 범위와 현재 Terraform 운영 context를 구현 가능한 durable choice로 정리한다. 기존 자동 apply 계약은 [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다)가 최신 authority이고, [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다)는 semantic comparison과 native stale validation의 배경이다.

## Decision Records

### 수동 recovery는 main의 선택된 SHA에서 Plan 후 즉시 Apply한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Active
- Context / Problem: 기존 main push 자동 경로의 reviewed/current comparison이 실패했을 때, 최신 main을 운영자가 명시적으로 복구할 수 있는 경로가 필요하다. 다른 run·PR의 artifact를 고르면 reviewed plan 경계를 다시 섞을 수 있다.
- Decision Outcome: `workflow_dispatch`는 `refs/heads/main`에서만 허용하고, 별도 target SHA나 확인 입력 없이 dispatch가 선택한 `github.sha`를 기준으로 항상 Plan을 먼저 만든 뒤 성공한 same-run saved plan만 즉시 Apply한다. Apply는 다른 run·PR artifact를 검색하지 않고 dispatch SHA와 saved plan source SHA를 확인한다.
- Alternatives Considered: Plan-only 기본값, `confirm_apply` 입력, 별도 reviewer approval, 임의 target SHA 입력은 사용자가 선택한 항상 Plan 후 Apply와 main/선택 SHA 경계를 바꾸므로 제외한다. 기존 merged-PR/latest artifact lookup 재사용도 same-run 계약과 맞지 않아 제외한다.
- Consequences: 수동 실행에는 별도 사람 승인 단계가 없으며, main branch policy·explicit dispatch·same-run artifact·native stale validation이 남은 보호 경계가 된다. 기존 push Apply의 job dependency 구조는 이 결정에서 고정하지 않는다.
- Confirmation / Follow-up: workflow 실행 조건, checkout SHA와 Plan/Apply 연결을 정적 검증하고 실제 Apply 성공은 별도 운영 증거로 확인한다.

### 수동 Plan과 Apply는 기존 terraform-apply Environment와 제한된 CI identity를 사용한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Superseded
- Superseded By: GCP WIF는 repository와 main 또는 main 대상 PR만 신뢰한다
- Context / Problem: 최신 main의 `kosmo-terraform` GCP provider 조건은 pull request와 Environment가 있는 main push만 허용하므로 `workflow_dispatch`의 identity가 기존 조건에 맞지 않는다. AWS role은 Environment subject를 이미 사용한다.
- Decision Outcome: 두 수동 job 모두 `terraform-apply` Environment를 사용하고, credential 주입 전에 main ref를 확인한다. GCP `kosmo-terraform` provider에만 `workflow_dispatch + refs/heads/main + terraform-apply` 조건을 추가하며 기존 PR/push 조건과 AWS Environment subject를 유지한다.
- Alternatives Considered: Firebase/native-distribution provider나 Firebase resource를 수정하는 방식, 새 provider·광범위한 trust·Environment 설정 변경은 승인 범위를 벗어나므로 제외한다.
- Consequences: CI provider trust 변경은 별도 resource apply가 아니라 기존 push 자동 경로의 reviewed/current comparison을 통과한 Terraform Apply로 먼저 반영되어야 한다. 그 전에는 수동 recovery가 인증되지 않는다.
- Confirmation / Follow-up: 구현 PR merge 후 기존 main push Apply 성공을 manual dispatch의 선행 증거로 기록한다. live GCP provider 상태는 현재 재인증 불가로 미확인인 사실을 실제 적용 증거와 구분한다.

### GCP WIF는 repository와 main 또는 main 대상 PR만 신뢰한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Active
- Supersedes: 수동 Plan과 Apply는 기존 terraform-apply Environment와 제한된 CI identity를 사용한다
- Context / Problem: manual Plan/Apply의 AWS 인증에는 `terraform-apply` Environment가 계속 필요하지만, GCP WIF의 목표는 특정 workflow나 Environment가 아니라 이 repository의 main 작업과 main 대상 PR을 허용하는 것이다. PR 예외는 read-only를 보장하지 않는다.
- Decision Outcome: `kosmo-terraform` GCP provider는 기존 `assertion.repository_id == '${local.github_repository_id}'`를 유지하고, `assertion.ref == 'refs/heads/main'` 또는 `(assertion.event_name == 'pull_request' && assertion.base_ref == 'main')`만 허용한다. owner ID, `workflow_ref`, `environment`와 비-PR event 이름은 GCP 조건에서 제한하지 않는다. GitHub issuer/provider와 service account IAM 연결은 그대로 유지하며, AWS Environment/subject는 별도 계약으로 유지한다.
- Alternatives Considered: owner ID, workflow ref, Environment 또는 `push`/`workflow_dispatch` event를 추가로 고정하는 방식은 repository-wide main/PR 목표와 맞지 않아 제외한다. PR 예외를 제거하는 방식도 main 대상 PR Plan의 인증 계약을 깨뜨리므로 제외한다. Firebase/native-distribution WIF, service account 권한·분리, AWS Environment 설정 변경은 범위 밖이다.
- Consequences: 다른 repository는 거부되지만 같은 repository의 main ref 작업과 main 대상 PR은 workflow, Environment, event 이름과 무관하게 GCP trust를 만족할 수 있다. main tag/feature 같은 non-PR ref는 거부된다. 기존 main push Apply가 trust 변경을 먼저 반영해야 manual path를 사용할 수 있다는 bootstrap 선행 조건과 기존 PR/push 실행 계약은 유지한다.
- Confirmation / Follow-up: 구현 시 다른 repository 거부, main tag/feature non-PR 거부, Environment 없는 main 및 다른 workflow 허용, main 대상 PR 예외를 정적 검증한다. 실제 dispatch·Apply 또는 live trust 상태는 별도 운영 증거로 확인한다.

### 기존 PR/push 자동 계약은 수동 경로와 독립적으로 보존한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다), [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다), [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Active
- Context / Problem: manual recovery를 추가하면서 reviewed PR plan과 current main plan의 의미 비교 및 mismatch fail-closed 경계를 약화시키면 기존 production safety contract가 깨진다.
- Decision Outcome: 기존 pull request Plan, main push의 merged PR head artifact 선택, semantic comparison, mismatch 차단과 native stale validation을 그대로 유지한다. 자동 경로가 실패해도 수동 경로를 자동 시작하거나 current plan을 자동 적용하지 않는다.
- Alternatives Considered: mismatch 시 current plan 자동 적용, 기존 comparison skip, merge-group 경로 복원은 PROD-609의 현재 계약과 충돌하므로 제외한다.
- Consequences: 자동 경로 실패 후 운영자는 별도의 명시적 dispatch를 해야 하며, trust 선행 Apply가 실패하면 수동 경로도 사용할 수 없다.
- Confirmation / Follow-up: PR/push event matrix와 mismatch failure path를 실행 동작 또는 workflow validator로 확인하고 소스 문자열 존재 검사는 사용하지 않는다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `수동 Plan과 Apply는 기존 terraform-apply Environment와 제한된 CI identity를 사용한다` → `GCP WIF는 repository와 main 또는 main 대상 PR만 신뢰한다`
