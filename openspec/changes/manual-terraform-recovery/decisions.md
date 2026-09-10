## Context

이 decision log는 [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)의 최종 승인된 수동 recovery 범위와 [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다)의 Terraform WIF 경계를 현재 운영 context에 맞는 durable choice로 정리한다. 기존 자동 apply 계약은 [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다)가 최신 authority이고, [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다)는 semantic comparison과 native stale validation의 배경이다.

## Decision Records

### 수동 recovery는 기존 Apply job에서 직접 Apply한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) 최종 사용자 결정
- Status: Active
- Supersedes: `수동 recovery는 main의 선택된 SHA에서 Plan 후 즉시 Apply한다`
- Context / Problem: 기존 main push 자동 경로의 reviewed/current comparison이 실패했을 때, 운영자가 main에서 명시적으로 복구할 수 있는 경로가 필요하다. 별도 Plan job과 artifact 전달은 수동 경로의 복잡성을 키운다.
- Decision Outcome: `workflow_dispatch`는 `refs/heads/main`에서만 허용하고 dispatch 당시 `github.sha`를 checkout한다. 기존 Apply job의 인증·Terraform 초기화 뒤 수동 event에서 `terraform apply -auto-approve`를 한 번 실행한다. 수동 `terraform plan`, Plan-only 입력, `confirm_apply`, saved plan 파일, artifact, `needs` 기반 Manual Plan job과 SHA metadata 전달은 두지 않는다.
- Alternatives Considered: same-run Plan artifact 전달, 별도 Plan job, Plan-only 기본값, `confirm_apply`, 별도 reviewer approval과 임의 target SHA 입력은 최종 사용자가 선택한 기존 Apply job 직접 실행과 main 경계를 바꾸므로 제외한다.
- Consequences: 수동 직접 Apply는 saved plan과 Terraform native stale-plan validation을 사용하지 않는다. 명시적 main dispatch, main guard, 기존 credential boundary와 state concurrency가 남은 보호 경계이며, native stale validation은 기존 push reviewed saved plan 경로에만 유지된다.
- Confirmation / Follow-up: workflow 실행 조건과 direct Apply command를 정적 검증하고 실제 Apply 성공은 별도 운영 증거로 확인한다.

### 수동 Apply는 기존 AWS Environment와 CI identity 경계를 유지한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Superseded
- Superseded by: `Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다`
- Context / Problem: 수동 Apply는 기존 AWS Environment subject를 계속 사용해야 하지만, GCP CI identity는 workflow 경로와 Environment에 결합하지 않는 최종 조건이 필요하다.
- Decision Outcome: 수동 Apply job은 `terraform-apply` Environment를 사용하고 credential 주입 전에 main ref를 확인한다. GCP `kosmo-terraform` provider는 repository ID와 main ref 또는 main 대상 PR만 허용한다. AWS Environment subject와 GCP WIF 조건은 별도 경계다.
- Alternatives Considered: Firebase/native-distribution provider나 Firebase resource 수정, 새 provider, Environment 설정 변경과 광범위한 trust는 승인 범위를 벗어나므로 제외한다.
- Consequences: CI provider trust 변경은 기존 push 자동 경로의 reviewed/current comparison을 통과한 Terraform Apply로 먼저 반영되어야 한다. 그 전에는 수동 recovery가 인증되지 않는다.
- Confirmation / Follow-up: 구현 PR merge 후 기존 main push Apply 성공을 manual dispatch의 선행 증거로 기록한다. live GCP provider 상태와 실제 Apply는 정적 검증과 구분한다.

### Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다

- Decision Date: 2026-09-10
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다), [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Active
- Context / Problem: repository ID와 main/PR ref만 확인하면 같은 repository의 다른 workflow와 Environment 없는 main job이 Terraform service account를 impersonate할 수 있다. 수동 recovery와 기존 PR/push 계약을 유지하면서 Terraform workflow의 실제 owner·workflow·event·Environment 경계를 복원해야 한다.
- Decision Outcome: `kosmo-terraform` GCP WIF provider는 `assertion.repository_id == '${local.github_repository_id}'`, `assertion.repository_owner_id == '${local.github_owner_id}'`, `assertion.workflow_ref.startsWith('byulmaru/kosmo/.github/workflows/terraform.yml@')`를 공통으로 요구한다. 그 뒤 `assertion.event_name == 'pull_request' && assertion.base_ref == 'main'` 또는 `(assertion.event_name == 'push' || assertion.event_name == 'workflow_dispatch') && assertion.ref == 'refs/heads/main' && assertion.environment == '${local.terraform_apply_environment}'`만 허용한다. 따라서 Terraform PR Plan, main push Apply, main manual Apply의 세 경로만 인증하고 다른 workflow, `workflow_run`, Environment 없는 main job, 다른 repository/owner, tag·feature ref의 non-PR 실행은 거부한다. PR 예외는 read-only를 보장하지 않는다.
- Alternatives Considered: repository ID만 확인하는 기존 wide condition, owner/workflow/event/Environment 검증을 생략하는 방식, `workflow_run` 또는 Environment 없는 main 허용은 다른 workflow의 impersonation 경계를 남기므로 제외한다. PR 예외 제거, Firebase/native-distribution WIF 변경과 service account 권한 분리는 범위 밖이다.
- Consequences: CI trust 변경은 기존 main push Apply의 reviewed-plan comparison을 통과해 먼저 반영되어야 manual recovery를 사용할 수 있다. AWS `terraform-apply` Environment/subject와 Firebase/native-distribution provider·IAM 역할은 별도 경계로 유지한다.
- Confirmation / Follow-up: 허용 세 경로와 다른 workflow·workflow_run·Environment 없는 main·다른 repository/owner·tag/feature non-PR 거부를 검증한다. 실제 dispatch·Apply와 live provider 상태는 별도 운영 증거로 확인한다.

### GCP WIF는 repository와 main 또는 main 대상 PR만 신뢰한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Superseded
- Superseded by: `Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다`
- Context / Problem: manual Apply를 위해 GCP WIF가 특정 workflow나 Environment에 묶이지 않아야 한다. PR 예외는 read-only를 보장하지 않는다.
- Decision Outcome: `kosmo-terraform` GCP provider는 기존 `assertion.repository_id == '${local.github_repository_id}'`를 유지하고, `assertion.ref == 'refs/heads/main'` 또는 `(assertion.event_name == 'pull_request' && assertion.base_ref == 'main')`만 허용한다. owner ID, `workflow_ref`, `environment`와 비-PR event 이름은 GCP 조건에서 제한하지 않는다. GitHub issuer/provider와 service account IAM 연결, AWS Environment/subject는 그대로 유지한다.
- Alternatives Considered: owner ID, workflow ref, Environment 또는 `push`/`workflow_dispatch` event를 추가로 고정하는 방식은 repository-wide main/PR 목표와 맞지 않아 제외한다. PR 예외 제거, Firebase/native-distribution WIF 변경과 service account 권한 분리도 범위 밖이다.
- Consequences: 다른 repository는 거부되지만 같은 repository의 main ref 작업과 main 대상 PR은 workflow, Environment, event 이름과 무관하게 GCP trust를 만족할 수 있다. main tag/feature 같은 non-PR ref는 거부된다. 기존 main push Apply가 trust 변경을 먼저 반영해야 manual path를 사용할 수 있다.
- Confirmation / Follow-up: 다른 repository 거부, main tag/feature non-PR 거부, Environment 없는 main 및 다른 workflow 허용, main 대상 PR 예외를 정적 검증한다. 실제 dispatch·Apply 또는 live trust 상태는 별도 운영 증거로 확인한다.

### 기존 PR/push 자동 계약은 수동 경로와 독립적으로 보존한다

- Decision Date: 2026-09-07
- Decision Class: Derived Contract
- Authority / Provenance: [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다), [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다), [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- Status: Active
- Context / Problem: manual recovery를 추가하면서 reviewed PR plan과 current main plan의 의미 비교 및 mismatch fail-closed 경계를 약화시키면 기존 production safety contract가 깨진다.
- Decision Outcome: 기존 pull request Plan, main push의 merged PR head artifact 선택, semantic comparison, mismatch 차단과 native stale validation을 그대로 유지한다. 자동 경로가 실패해도 수동 Apply를 자동 시작하거나 current plan을 자동 적용하지 않는다.
- Alternatives Considered: mismatch 시 current plan 자동 적용, 기존 comparison skip, merge-group 경로 복원은 PROD-609의 현재 계약과 충돌하므로 제외한다.
- Consequences: 자동 경로 실패 후 운영자는 별도의 명시적 main dispatch를 해야 하며, trust 선행 Apply가 실패하면 수동 경로도 사용할 수 없다.
- Confirmation / Follow-up: PR/push event matrix와 mismatch failure path를 실행 동작 또는 workflow validator로 확인하고 소스 문자열 존재 검사는 사용하지 않는다.

## Remaining Decisions

없음.

## Superseded Decisions

- `수동 recovery는 main의 선택된 SHA에서 Plan 후 즉시 Apply한다` — 최종 사용자 결정으로 별도 Manual Plan·same-run artifact·SHA metadata 전달을 제거하고 기존 Apply job 직접 Apply로 대체했다.
- `수동 Plan과 Apply는 기존 terraform-apply Environment와 제한된 CI identity를 사용한다` — 이전 두-job 표현은 기존 Apply job 직접 Apply로 대체했고, WIF 경계는 `Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다`로 정렬했다.
- `수동 Apply는 기존 AWS Environment와 CI identity 경계를 유지한다` — AWS Environment/subject와 direct Apply는 유지하지만 GCP identity의 넓은 조건 표현은 `Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다`로 대체했다.
- `GCP WIF는 repository와 main 또는 main 대상 PR만 신뢰한다` — PROD-946의 owner ID·workflow ref·event·Environment 경계를 반영한 `Terraform WIF는 저장소·소유자·정확한 workflow와 세 허용 경로만 신뢰한다`로 대체했다.
