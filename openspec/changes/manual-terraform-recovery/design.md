## Context

현재 `.github/workflows/terraform.yml`은 pull request에서 Plan artifact를 만들고 `main` push에서 `terraform-apply` Environment를 사용해 reviewed plan을 선택한다. Apply job은 현재 main에서 다시 만든 plan을 reviewed plan과 semantic 비교하고, 차이가 있으면 두 plan 모두 적용하지 않는다. PR #766 병합 run은 이 비교에서 중단되어 기존 artifact를 같은 run에서 재시도하는 것으로는 최신 main을 적용할 수 없었다.

새 경로는 이 자동 계약을 우회하거나 완화하지 않고, 운영자가 `main`의 선택된 commit을 명시적으로 dispatch했을 때만 Plan과 Apply를 연결하는 recovery 흐름이다. 수동 Plan/Apply job은 기존 AWS `environment:terraform-apply` subject를 위해 Environment를 사용하지만, GCP CI identity는 기존 `repository_id`와 `refs/heads/main` 또는 `pull_request` + `base_ref == main`만 확인한다. owner ID, workflow ref, GCP Environment와 비-PR event 이름은 GCP 조건에서 제한하지 않으며, Firebase/native-distribution provider와 Firebase resource는 별도 소유 경계다.

## Goals / Non-Goals

**Goals:**

- main ref에서 선택된 `github.sha`를 Plan과 Apply 양쪽에 고정한다.
- 두 job 모두 기존 `terraform-apply` Environment를 사용하고 main guard를 credential 주입보다 앞에 둔다.
- 같은 workflow run에서 성공한 Plan artifact만 Apply하고, Plan 실패·artifact 검증 실패·Terraform stale-plan을 차단한다.
- GCP CI provider는 기존 `repository_id`를 유지하고 `refs/heads/main` 또는 `pull_request` + `base_ref == main`만 허용한다. owner ID, workflow ref, Environment와 비-PR event 이름은 제한하지 않으며, 같은 repository의 main/PR인 다른 workflow도 GCP trust를 만족할 수 있고 PR 예외는 read-only를 보장하지 않는다는 trade-off를 기록한다.
- 기존 push Apply의 reviewed/current semantic comparison과 Plan 출력 노출 경계를 보존한다.

**Non-Goals:**

- Plan-only 또는 `confirm_apply` 입력, 별도 사람 승인, target SHA/NAT/replace 입력을 추가하지 않는다.
- 기존 자동 comparison 실패를 자동 Apply로 우회하지 않는다.
- Firebase/native-distribution WIF, Firebase resource, Environment 설정, secret·variable 또는 Kubernetes 저장소를 변경하지 않는다.
- 실제 dispatch, rerun, Apply 또는 live trust/resource 상태를 이 change의 정적 검증으로 주장하지 않는다.

## Implementation Guidance

### Current Constraints

- `workflow_dispatch`에는 pull request/push처럼 선언적인 branch filter가 없으므로 수동 Plan과 Apply job 모두에서 `refs/heads/main`을 확인해야 한다. 이 확인은 AWS/GCP/Tailscale/Argo credential 단계보다 앞서야 한다.
- Plan job을 dispatch까지 확장할 때 PR comment 전용 단계가 manual event에서 실행되지 않도록 event 조건을 분리한다.
- 기존 push Apply job에 `needs: plan`을 바로 추가하면 push event에서 Plan job이 skipped라 Apply도 skipped될 수 있다. 반대로 무조건 `always()`를 사용하면 실패한 Plan을 우회할 위험이 있다.
- GCP `kosmo-terraform` condition은 변경 후 `repository_id`가 일치하면서 `ref == refs/heads/main`이거나 `event_name == pull_request && base_ref == main`인 token을 허용한다. `environment`, `workflow_ref`, `repository_owner_id`와 비-PR `event_name`은 조건에 사용하지 않는다. AWS role은 기존 `environment:terraform-apply` subject를 이미 사용하므로 manual Plan/Apply에 같은 Environment를 계속 부여하되, 이를 GCP WIF 조건과 혼동하지 않는다.
- Terraform saved plan은 state lineage/serial과 연결된다. native stale validation은 state snapshot이 바뀐 경우를 보호하지만, state에 기록되지 않은 모든 remote-only drift를 항상 검출한다는 의미는 아니다.

### Recommended Approach

1. workflow dispatch를 추가하고, 수동 경로가 선택한 main commit의 `github.sha`를 workflow context와 checkout에 동일하게 사용한다.
2. 기존 PR Plan 단계의 공통 인증·Terraform 준비·Plan 렌더링을 재사용하되, manual event에서는 PR comment를 만들지 않고 same-run artifact를 저장한다. Plan artifact에는 Apply에 필요한 saved plan과 기존 허용 범위의 human-readable metadata만 포함한다.
3. 기존 Apply job을 재사용해 Environment·credential·Terraform 준비 단계를 중복하지 않는다. Plan job을 dependency로 연결하더라도 push event에서 skipped Plan 때문에 기존 Apply가 skip되지 않도록 event와 dependency status를 함께 평가하고, manual event에서는 Plan 성공일 때만 same-run artifact 경로로 진행한다. Apply 내부의 event별 artifact/compare 분기는 기존 push semantic comparison과 manual SHA 검증을 각각 보존해야 한다.
   기존 pull request Plan에는 `terraform-apply` Environment를 붙이지 않고 manual Plan에만 적용한다; 별도 manual-Plan job을 강제하지 않으며, 조건부 Environment 또는 별도 Plan job 중 기존 PR/push 계약과 manual same-run 계약을 충족하는 구현을 선택한다.
4. 수동 Plan과 Apply 모두 AWS 기존 subject를 위해 `terraform-apply` Environment를 선언하고 main guard를 credentials 이전에 평가한다. Terraform CI GCP provider condition은 `repository_id`와 `ref == refs/heads/main` 또는 `event_name == pull_request && base_ref == main`만 사용한다. owner ID, workflow ref, GCP Environment와 비-PR event 이름은 제한하지 않으며, 같은 repository의 main/PR인 다른 workflow와 read-only가 아닌 PR 예외를 허용하는 trade-off를 문서화한다.
5. CI provider trust 변경을 포함한 PR은 먼저 기존 pull request Plan과 main push reviewed/current comparison을 통과하고 실제 push Apply로 trust를 반영해야 한다. 그 선행 Apply가 실패하면 manual recovery를 시작하거나 bootstrap을 우회하지 않는다.
6. 운영 문서에는 manual run이 사람 승인 없이 Plan 직후 Apply되는 경로이며, Environment에는 현재 required reviewer가 없고 main branch policy가 있다는 점을 구분해 적는다. 실제 수동 Apply 증거는 별도 운영 실행 기록으로 남긴다.

### Allowed Alternatives

없음. 기존 Apply job 재사용이 현재 Environment·credential 경계를 중복하지 않는 가장 작은 기본 경로다.

### Known Traps

- `workflow_dispatch`의 선택 ref를 검증하지 않고 checkout 기본값이나 임의 input을 사용하면 main-only와 SHA 고정 계약을 잃는다.
- manual Apply가 artifact API에서 최신 artifact를 검색하면 다른 run/PR의 reviewed plan을 적용할 수 있다. same-run download와 metadata 검증을 사용해야 한다.
- Plan과 Apply 중 한쪽만 AWS `terraform-apply` Environment를 사용하거나, GCP condition만 바꾸고 trust 선행 Apply를 생략하면 인증 경계가 비대칭이 된다.
- Firebase/native-distribution provider를 CI provider로 잘못 해석해 disabled provider 또는 Firebase resource를 수정하면 범위를 벗어난다.
- Terraform native stale validation을 remote-only drift 전체 검출로 설명하면 검증 보장을 과장한다.
- plan JSON, 비교용 JSON, OIDC token, cloud secret을 summary·artifact·로그에 추가하면 기존 노출 경계를 깨뜨린다.

## Risks / Trade-offs

- [수동 Plan 직후 자동 Apply] → 별도 reviewer가 없는 운영 경계이므로 main branch policy, explicit dispatch, same-run SHA/artifact 검증과 Terraform stale validation에 의존한다. 운영 문서에서 사람 승인이 없음을 명확히 한다.
- [CI trust 선행 필요] → GCP provider 변경이 main push Apply로 먼저 반영되지 않으면 manual path가 인증되지 않는다. bootstrap 순서와 실패 시 중단 조건을 문서·검증에 포함한다.
- [repository-wide GCP trust] → `repository_id`와 main ref 또는 main 대상 PR만 확인하므로 같은 repository의 다른 workflow도 GCP trust를 만족할 수 있고, PR 예외는 read-only를 보장하지 않는다. AWS Environment/subject는 별도 경계이며, 이 wider GCP trust를 보안 강화로 표현하지 않는다.
- [동일 state concurrency] → Plan이 state lock을 잠시 보유하므로 기존 `terraform-kosmo-state` concurrency를 유지하고 Plan 완료 뒤 Apply가 실행되게 한다.

## Migration Plan

1. OpenSpec Gate 승인 후 workflow, Terraform CI provider condition, 운영 문서를 함께 구현하고 actionlint/format/OpenSpec strict 및 실행 조건 검증을 수행한다.
2. PR Plan과 기존 main push Apply가 CI trust 변경을 검토된 saved plan으로 실제 반영할 때까지 manual dispatch를 사용하지 않는다. 기존 semantic comparison 불일치가 발생하면 자동 경로의 안전한 실패로 기록하고 중단한다.
3. trust 선행 Apply 성공 후, 별도 운영 승인 절차에 따라 main에서 manual run을 수행한다. 이 change의 PR·정적 검증은 실제 Apply 성공 증거를 대신하지 않는다.
4. rollback이 필요하면 workflow dispatch/manual job과 GCP manual condition을 reviewed Terraform change로 되돌리고, 기존 PR/push workflow와 Firebase/native-distribution provider는 그대로 보존한다.

## Open Questions

없음. Issue Gate에서 manual Plan 후 즉시 Apply, main-only, same-run artifact, 좁은 CI GCP trust 추가와 기존 자동 경로 보존을 승인했다.
