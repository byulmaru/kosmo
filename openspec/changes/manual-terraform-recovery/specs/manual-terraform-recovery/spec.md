## ADDED Requirements

### Requirement: main에서 선택한 commit의 수동 Terraform 실행

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — Terraform workflow는 `workflow_dispatch`로 요청한 수동 recovery를 제공해야 한다(MUST). 수동 Plan과 Apply는 `refs/heads/main`에서만 실행되어야 하며(MUST), 별도 SHA 입력이나 다른 branch/ref를 허용해서는 안 된다(MUST NOT). Dispatch event가 선택한 `github.sha`는 Plan과 Apply가 같은 실행에서 사용하는 유일한 source commit이어야 하며(MUST), Apply 단계에서 branch ref를 다시 해석해서는 안 된다(MUST NOT). Dispatch 후 `main` ref가 변경되더라도 선택된 SHA를 다시 조회하거나 재해석해서는 안 된다(MUST NOT).

#### Scenario: main에서 수동 실행

- **WHEN** 운영자가 Terraform workflow를 `main` ref에서 수동 실행한다
- **THEN** Plan과 Apply는 dispatch event의 동일한 `github.sha`를 checkout하고 그 commit을 기준으로 실행한다

#### Scenario: main 이외의 ref에서 수동 실행

- **WHEN** workflow dispatch가 `main` 이외의 ref를 대상으로 요청된다
- **THEN** cloud credential을 주입하거나 Terraform Plan/Apply를 실행하지 않고 수동 경로를 거부한다

### Requirement: 수동 경로의 cloud credential 경계

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행한다) — 수동 Plan과 Apply job은 기존 `terraform-apply` Environment를 사용해야 하며(MUST), credential 주입 전에 main-only 조건을 확인해야 한다(MUST). Terraform CI용 `kosmo-terraform` GCP Workload Identity provider 조건은 `assertion.repository_id == '${local.github_repository_id}' && (assertion.ref == 'refs/heads/main' || (assertion.event_name == 'pull_request' && assertion.base_ref == 'main'))`이어야 한다(MUST). owner ID, `workflow_ref`, `environment`와 main 경로의 event 이름은 GCP 조건에서 제한해서는 안 된다(MUST NOT). AWS는 기존 `repo:byulmaru/kosmo:environment:terraform-apply` subject를 재사용해야 하며(MUST); 이는 GCP WIF 조건과 별도다. GitHub issuer/provider와 service account IAM 연결, Firebase/native-distribution WIF provider 및 Firebase resource의 trust·상태·삭제 정책은 변경해서는 안 된다(MUST NOT). PR 예외는 read-only 권한을 보장하지 않는다.

#### Scenario: 수동 Plan과 Apply의 인증

- **WHEN** main dispatch의 Plan 또는 Apply job이 cloud credential을 요청한다
- **THEN** 두 job 모두 기존 AWS `terraform-apply` Environment subject 경계 안에서 실행되고, GCP는 repository ID와 main ref 또는 main 대상 PR 조건을 사용한다

#### Scenario: 기존 자동 Terraform 인증

- **WHEN** pull request Plan 또는 main push Apply가 실행된다
- **THEN** PR의 `pull_request` + `base_ref == main` 조건과 main push의 repository ID + main ref 조건이 계속 허용되고, 수동 경로를 위해 PR 조건을 완화하지 않는다

#### Scenario: 다른 repository

- **WHEN** 다른 repository의 OIDC token이 main ref 또는 main 대상 pull request에서 GCP credential을 요청한다
- **THEN** `repository_id`가 일치하지 않으므로 GCP credential을 거부한다

#### Scenario: main tag 또는 feature ref의 non-PR 실행

- **WHEN** 같은 repository의 non-PR workflow가 tag 또는 feature branch ref에서 GCP credential을 요청한다
- **THEN** `ref == refs/heads/main`이 아니므로 GCP credential을 거부한다

#### Scenario: main의 Environment 없는 실행 또는 다른 workflow

- **WHEN** 같은 repository의 workflow가 `refs/heads/main`에서 실행되고 `terraform-apply` Environment를 사용하지 않거나 Terraform workflow가 아니다
- **THEN** GCP WIF는 Environment 또는 workflow ref를 확인하지 않으므로 credential 요청을 허용하고, AWS credential은 기존 subject로 별도 판단한다

#### Scenario: main 대상 pull request 예외

- **WHEN** 같은 repository의 pull request workflow가 `base_ref == main`으로 GCP credential을 요청한다
- **THEN** `ref`가 `refs/heads/main`이 아니어도 pull request 예외로 credential 요청을 허용하며, 이 예외는 read-only 권한을 보장하지 않는다

### Requirement: same-run 성공 Plan만 Apply

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 실행은 항상 Plan을 먼저 성공시킨 뒤 그 same workflow run에서 생성된 saved plan artifact를 Apply해야 한다(MUST). Apply는 다른 run, PR 또는 저장소 artifact를 검색·선택해서는 안 되며(MUST NOT), saved plan이 생성된 dispatch `github.sha`와 현재 checkout SHA가 일치하는지 확인해야 한다(MUST). 별도 Plan-only 입력이나 `confirm_apply` 입력은 제공하지 않는다(MUST NOT).

#### Scenario: 수동 Plan 성공 후 Apply

- **WHEN** main dispatch의 Plan이 성공하고 saved plan artifact가 현재 run과 선택된 SHA에 연결되어 있다
- **THEN** Apply가 그 artifact만 내려받아 Terraform native saved-plan validation과 함께 적용한다

#### Scenario: 다른 run의 artifact만 존재

- **WHEN** 현재 dispatch run에 성공한 Plan artifact가 없고 다른 run에만 Plan artifact가 있다
- **THEN** Apply를 실행하지 않고 해당 수동 실행을 실패시킨다

### Requirement: Plan 실패와 stale plan의 차단

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 Apply는 Plan job의 성공에 의존해야 하며(MUST), Plan 실패·artifact 누락·artifact 검증 실패가 있으면 건너뛰어야 한다(MUST). Apply는 Terraform의 native saved-plan stale validation을 우회해서는 안 된다(MUST NOT). 수동 경로는 자동 경로가 실패했을 때 자동으로 시작되거나 current plan을 자동 적용해서는 안 되며(MUST NOT), 운영자가 명시적으로 dispatch한 recovery는 허용해야 한다(MUST).

#### Scenario: Plan 실패

- **WHEN** 수동 Plan이 non-zero 결과로 끝난다
- **THEN** Apply job은 실행되지 않는다

#### Scenario: 다른 Apply로 state snapshot이 변경됨

- **WHEN** Plan 성공 뒤 다른 Terraform Apply가 같은 state의 lineage 또는 serial을 변경한다
- **THEN** Terraform native saved-plan stale validation이 Apply를 거부하고 수동 경로는 state 검증을 우회하지 않는다

Terraform native stale-plan validation이 state에 기록되지 않은 remote-only drift까지 항상 거부한다는 보장은 이 requirement의 범위가 아니다.

#### Scenario: CI trust 선행 Apply 미완료

- **WHEN** 제한된 GCP CI provider 조건 변경이 기존 main push 자동 경로에서 아직 성공적으로 적용되지 않았다
- **THEN** 수동 dispatch는 bootstrap 또는 기존 자동 비교를 우회하지 않고 인증/준비 실패로 종료된다

### Requirement: 기존 PR/push 자동 계약 보존

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다), [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다), [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 새 수동 capability는 기존 pull request Plan artifact 생성과 main push의 reviewed PR plan 선택·현재 main semantic comparison·불일치 차단을 변경해서는 안 된다(MUST NOT). 기존 자동 comparison이 실패하면 current plan 또는 수동 Plan을 자동 적용해서는 안 되며(MUST NOT), 운영자가 명시적으로 수동 recovery를 dispatch할 수 있어야 한다(MUST).

#### Scenario: 기존 reviewed/current comparison 성공

- **WHEN** main push에서 선택된 reviewed PR plan과 현재 main plan이 기존 semantic comparison에 통과한다
- **THEN** 기존 자동 경로가 reviewed saved plan을 적용하고 수동 artifact 선택 로직을 사용하지 않는다

#### Scenario: 기존 reviewed/current comparison 불일치

- **WHEN** main push의 reviewed PR plan과 현재 main plan이 다르다
- **THEN** 기존 자동 Apply가 실패하고 current plan 또는 다른 Plan을 자동 적용하지 않는다

### Requirement: 기존 Plan 출력 노출 경계 보존

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 경로는 기존 Plan comment, workflow summary와 artifact의 노출 경계를 유지해야 한다(MUST). Terraform plan JSON, 비교용 중간 JSON 또는 cloud secret을 새 로그·artifact·summary에 노출해서는 안 된다(MUST NOT).

#### Scenario: 수동 Plan 출력 저장

- **WHEN** 수동 Plan이 성공한다
- **THEN** 기존에 허용된 human-readable Plan 출력과 Apply에 필요한 saved plan만 남고 Plan JSON·비밀은 새 공개 위치에 저장되지 않는다
