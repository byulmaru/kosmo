## ADDED Requirements

### Requirement: main에서 수동 Terraform Apply 실행

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — Terraform workflow는 `workflow_dispatch`로 요청한 수동 recovery를 제공해야 한다(MUST). 수동 Apply는 `refs/heads/main`에서만 실행되어야 하며(MUST), 다른 branch/ref를 허용해서는 안 된다(MUST NOT). Dispatch event가 선택한 `github.sha`를 checkout source로 사용해야 하며(MUST), Apply 단계에서 실행 중 `main` ref를 다시 해석해서는 안 된다(MUST NOT).

#### Scenario: main에서 수동 실행

- **WHEN** 운영자가 Terraform workflow를 `main` ref에서 수동 실행한다
- **THEN** 기존 Apply job이 dispatch event의 `github.sha`를 checkout하고 수동 Apply 경로를 실행한다

#### Scenario: main 이외의 ref에서 수동 실행

- **WHEN** workflow dispatch가 `main` 이외의 ref를 대상으로 요청된다
- **THEN** cloud credential을 주입하거나 Terraform Apply를 실행하지 않고 수동 경로를 거부한다

### Requirement: 수동 Apply의 cloud credential 경계

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 Apply job은 기존 `terraform-apply` Environment를 사용해야 하며(MUST), credential 주입 전에 main-only 조건을 확인해야 한다(MUST). Terraform CI용 `kosmo-terraform` GCP Workload Identity provider 조건은 `assertion.repository_id == '${local.github_repository_id}' && (assertion.ref == 'refs/heads/main' || (assertion.event_name == 'pull_request' && assertion.base_ref == 'main'))`이어야 한다(MUST). owner ID, `workflow_ref`, `environment`와 main 경로의 event 이름은 GCP 조건에서 제한해서는 안 된다(MUST NOT). AWS는 기존 `repo:byulmaru/kosmo:environment:terraform-apply` subject를 재사용해야 하며(MUST); 이는 GCP WIF 조건과 별도다. GitHub issuer/provider와 service account IAM 연결, Firebase/native-distribution WIF provider 및 Firebase resource의 trust·상태·삭제 정책은 변경해서는 안 된다(MUST NOT). PR 예외는 read-only 권한을 보장하지 않는다.

#### Scenario: 수동 Apply 인증

- **WHEN** main dispatch의 Apply job이 cloud credential을 요청한다
- **THEN** 기존 `terraform-apply` Environment subject 경계 안에서 실행되고, GCP는 repository ID와 main ref 조건을 사용한다

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

### Requirement: 수동 Apply는 Terraform 직접 계획을 한 번 실행한다

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 수동 실행은 기존 Apply job의 인증·Terraform 초기화 뒤 `terraform apply -auto-approve`를 한 번 실행해야 한다(MUST). 수동 경로는 별도 `terraform plan`, Plan-only 입력, `confirm_apply` 입력, saved plan 파일, Plan artifact, `needs` 기반 Manual Plan job 또는 SHA metadata 전달을 두어서는 안 된다(MUST NOT). Terraform 자체의 Apply 내부 계획 계산은 허용한다.

#### Scenario: main 수동 직접 Apply

- **WHEN** main dispatch가 main guard와 기존 cloud credential·Terraform 초기화를 통과한다
- **THEN** 기존 Apply job이 `terraform apply -auto-approve`를 한 번 실행하고, 별도 Plan job이나 saved plan artifact를 조회하지 않는다

#### Scenario: 자동 경로 실패 뒤 명시적 recovery

- **WHEN** 기존 main push의 reviewed/current comparison이 실패한다
- **THEN** 수동 Apply가 자동으로 시작되지 않으며, 운영자가 별도로 main workflow dispatch를 요청해야 한다

#### Scenario: CI trust 선행 Apply 미완료

- **WHEN** 제한된 GCP CI provider 조건 변경이 기존 main push 자동 경로에서 아직 성공적으로 적용되지 않았다
- **THEN** 수동 dispatch는 bootstrap을 우회하지 않고 인증/준비 실패로 종료된다

### Requirement: 기존 PR/push 자동 계약 보존

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다), [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다), [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 새 수동 capability는 기존 pull request Plan artifact 생성과 main push의 reviewed PR plan 선택·현재 main semantic comparison·불일치 차단을 변경해서는 안 된다(MUST NOT). 기존 자동 comparison이 실패하면 current plan 또는 수동 Apply를 자동 적용해서는 안 되며(MUST NOT), 운영자가 명시적으로 수동 recovery를 dispatch할 수 있어야 한다(MUST).

#### Scenario: 기존 reviewed/current comparison 성공

- **WHEN** main push에서 선택된 reviewed PR plan과 현재 main plan이 기존 semantic comparison에 통과한다
- **THEN** 기존 자동 경로가 reviewed saved plan을 적용하고 수동 직접 Apply 경로를 사용하지 않는다

#### Scenario: 기존 reviewed/current comparison 불일치

- **WHEN** main push의 reviewed PR plan과 현재 main plan이 다르다
- **THEN** 기존 자동 Apply가 실패하고 current plan 또는 수동 Apply를 자동 시작하지 않는다

### Requirement: 기존 PR Plan/push Apply 출력 경계 보존

**Authority / Provenance:** 적용 canonical domain/design 없음; 운영 context `apps/terraform/README.md`; [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 기존 PR Plan과 push Apply의 Plan comment, workflow summary와 artifact 노출 경계를 변경해서는 안 된다(MUST). 수동 direct Apply는 Terraform command output에 새 plan JSON, 비교용 JSON 또는 cloud secret을 노출해서는 안 된다(MUST NOT).

#### Scenario: 수동 직접 Apply 출력

- **WHEN** 수동 Apply가 성공하거나 실패한다
- **THEN** 수동 경로의 Terraform command output에 별도 plan JSON·비교 JSON·secret을 노출하지 않는다
