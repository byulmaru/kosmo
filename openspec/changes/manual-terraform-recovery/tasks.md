## 1. PROD-898 수동 workflow 경로

**Authority / Provenance**

- [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- 운영 context: `apps/terraform/README.md`
- 이 기존 change는 PROD-898의 구현·운영 문서·검증 책임을 유지하고, PROD-946의 WIF 구현·문서·검증 책임과 공유한다. 새 OpenSpec change는 만들지 않는다.

**Deliverable**

`main`에서 명시적으로 dispatch한 기존 Apply job이 선택된 `github.sha`를 checkout하고, 기존 인증·Terraform 초기화 뒤 직접 Apply하는 수동 recovery 결과.

**Guardrails**

- 수동 Apply는 `refs/heads/main`에서만 동작하고 credential 주입 전에 ref를 확인한다.
- 별도 target SHA, Plan-only 기본값, `confirm_apply` 입력, Manual Plan job, `needs`, saved plan artifact와 SHA metadata 전달을 추가하지 않는다.
- 수동 경로는 `terraform apply -auto-approve`를 한 번 실행한다.
- 기존 pull request Plan과 push reviewed/current semantic comparison 경로를 변경하거나 우회하지 않는다.
- Plan JSON, 비교용 JSON, OIDC token과 cloud secret을 새 로그·summary·artifact에 노출하지 않는다.

**Verification**

- actionlint 또는 동등한 표준 workflow validator로 dispatch·PR·push event의 문법과 job 조건을 확인한다.
- main dispatch, non-main dispatch, 직접 Apply command와 push의 기존 mismatch 차단을 실행 동작 또는 검증 가능한 event matrix로 확인한다. source 문자열·정규식·AST 존재 검사는 사용하지 않는다.
- 실제 workflow dispatch·rerun·Apply는 별도 운영 승인 전까지 수행하지 않으며, 정적 검증을 실제 Apply 성공으로 표현하지 않는다.

- [x] 1.1 `workflow_dispatch` 수동 Apply 경로와 main-only `github.sha` checkout을 구현한다.
- [x] 1.2 기존 Apply job에서 수동 `terraform apply -auto-approve`를 한 번 실행하고 Manual Plan/artifact/needs 경로를 두지 않는다.
- [ ] 1.3 PR/push 자동 경로와 Plan 출력 노출 경계를 보존하고 event별 실행 동작을 검증한다.

## 2. PROD-946 Terraform CI identity 선행 조건

**Authority / Provenance**

- [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다)
- [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다) — 기존 manual recovery와 Apply 순서
- [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다)
- 운영 context: `apps/terraform/README.md`

**Deliverable**

Terraform CI용 `kosmo-terraform` GCP WIF provider가 `repository_id`, `repository_owner_id`, 정확한 `byulmaru/kosmo/.github/workflows/terraform.yml@` workflow ref prefix와 세 허용 경로를 요구하고, manual 사용 전 기존 자동 push Apply로 그 변경을 반영하는 운영 순서. 허용 경로는 `pull_request` + `base_ref == main`, `push` + `refs/heads/main` + `terraform-apply` Environment, `workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment다. 다른 workflow·`workflow_run`·Environment 없는 main job·다른 repository/owner·tag/feature ref의 non-PR 실행은 거부하며, PR 예외는 read-only가 아니다.

**Guardrails**

- 새 조건은 `repository_id`, `repository_owner_id`, `workflow_ref.startsWith('byulmaru/kosmo/.github/workflows/terraform.yml@')`와 `pull_request` + `base_ref == main` 또는 `push`/`workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment로 제한한다.
- 다른 workflow·`workflow_run`·Environment 없는 main job·다른 repository/owner·tag/feature ref의 non-PR 실행은 허용하지 않는다. PR 예외는 read-only를 보장하지 않는다.
- AWS 기존 `repo:byulmaru/kosmo:environment:terraform-apply` subject를 재사용한다.
- Firebase/native-distribution WIF provider, Firebase resource, Environment 설정, secrets·variables, Kubernetes repository는 변경하지 않는다.
- CI trust 선행 Apply가 실패하면 manual dispatch로 bootstrap을 우회하지 않는다.

**Verification**

- Terraform formatter/validator와 reviewed plan으로 CI provider만 변경되는지, 세 허용 event 경로와 다른 repository·owner·ref·workflow·Environment 시나리오 및 AWS Environment 분리를 확인한다. Firebase/native-distribution resource 변경은 없어야 한다.
- 기존 main push의 reviewed/current semantic comparison을 통과해 CI trust 변경을 실제 반영해야 한다는 선행 조건과, 그 증거가 없을 때 manual 경로를 사용하지 않는 운영 문서를 확인한다. 이 task에서는 실제 Apply를 수행하지 않는다.

- [x] 2.1 승인된 `kosmo-terraform` GCP WIF repository/owner/workflow 조건과 PR Plan·main push Apply·main manual Apply의 세 허용 경로를 구현하고, 다른 workflow·workflow_run·Environment 없는 main job·다른 repository/owner·tag/feature ref의 non-PR 실행을 거부한다.
- [x] 2.2 수동 Apply의 `terraform-apply` Environment 및 credential 순서를 문서·workflow에 정렬한다.
- [ ] 2.3 Terraform fmt/validate와 reviewed plan 범위 검토로 CI provider만 변경되는지 확인하고 trust 선행 Apply 절차를 운영 문서에 기록한다.

## 3. PROD-898/PROD-946 운영 문서와 OpenSpec 정합성

**Authority / Provenance**

- [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다)
- 운영 context: `apps/terraform/README.md`

**Deliverable**

운영자가 PR Plan·main push Apply·main manual Apply의 세 허용 WIF 경로, 기존 인증·초기화, push reviewed saved-plan 경로, CI trust 선행 순서와 실제 운영 증거의 경계를 이해할 수 있는 문서와 구현·spec의 정합성. PROD-898은 전체 정합성·spec sync·archive를 소유하고, PROD-946은 이 기존 change의 구현·문서·검증 책임을 공유한다.

**Guardrails**

- `terraform-apply` Environment에 required reviewer가 없다는 현재 사실을 사람 승인으로 표현하지 않는다.
- 기존 자동 PR/push 계약과 manual direct Apply의 별도 lifecycle을 섞지 않는다.
- 실제 dispatch·Apply 증거가 없는 상태에서 성공을 주장하지 않는다.

**Verification**

- Markdown formatting/link validation과 OpenSpec requirement·decision·task cross-check를 수행한다.
- 운영 문서의 포함·제외 범위가 PROD-898과 PROD-946에 일치하고, Firebase/native-distribution WIF 보존·trust 선행 조건·실제 Apply 증거 경계가 명시되어 있는지 검토한다.

- [x] 3.1 `apps/terraform/README.md` 및 필요한 운영 설명을 승인된 direct Apply 흐름과 선행 조건에 맞춰 갱신한다.
- [x] 3.2 구현 diff, 운영 문서와 OpenSpec의 requirement/decision/task를 독립 대조해 누락·과장·범위 확장을 제거한다.

## 4. PROD-898 통합 검증과 완료·archive

**Authority / Provenance**

- [PROD-898](https://linear.app/byulmaru/issue/PROD-898/최신-main-terraform-계획을-수동-실행으로-적용한다)
- [PROD-946](https://linear.app/byulmaru/issue/PROD-946/security-terraform-gcp-wif를-terraformyml-실행으로-제한한다)
- [PROD-609](https://linear.app/byulmaru/issue/PROD-609/terraform-apply에서-merge-group-plan-경로를-제거한다)
- [PROD-586](https://linear.app/byulmaru/issue/PROD-586/검토된-terraform-plan과-현재-plan이-같으면-main-apply를-허용한다)

**Deliverable**

수동 direct Apply와 기존 자동 경로를 함께 검증한 구현 PR, 정합성 확인 결과, 그리고 전체 범위가 완료된 뒤 archive 가능한 OpenSpec change.

**Guardrails**

- static/CI 검증과 실제 cloud Apply evidence를 분리한다.
- source string/regex/AST 존재 검사를 테스트로 추가하지 않는다.
- PROD-898의 전체 정합성·spec sync·archive와 PROD-946의 구현·문서·검증 책임을 다른 부모·자식·통합 이슈로 분산하지 않는다.

**Verification**

- actionlint, Terraform fmt/validate, OpenSpec strict validation 및 저장소 표준 checks를 통과한다.
- 독립 review에서 main-only, direct Apply command, CI trust 선행, 기존 PR/push compare 보존과 범위 제외를 확인한다.
- 구현 PR merge 후 CI trust 선행 Apply가 완료되었는지와 manual run을 아직 수행하지 않았다는 운영 상태를 분리해 기록한다. 이 task에서는 실제 manual dispatch·Apply를 실행하거나 그 성공을 주장하지 않는다.

- [ ] 4.1 표준 workflow/Terraform/OpenSpec validation과 event·direct-Apply/failure-path 검증을 통과시킨다.
- [x] 4.2 독립 검토 결과를 반영하고 PROD-898 전체 변경과 기존 자동 계약의 정합성을 최종 확인한다.
- [ ] 4.3 구현 PR merge 후 CI trust 선행 Apply 요구와 manual run 미실행 상태를 분리해 기록한다.
- [ ] 4.4 전체 requirement·task·검증·문서 sync가 완료되고 미해결 Blocked/Upstream Change Required decision이 없을 때 PROD-898이 OpenSpec change를 archive하며, 실제 manual Apply 성공은 주장하지 않는다.
