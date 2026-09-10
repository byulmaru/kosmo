## Context

현재 `.github/workflows/terraform.yml`은 pull request에서 Plan artifact를 만들고 `main` push에서 `terraform-apply` Environment를 사용해 reviewed plan을 선택한다. Apply job은 현재 main에서 다시 만든 plan을 reviewed plan과 semantic 비교하고, 차이가 있으면 두 plan 모두 적용하지 않는다. PR #766 병합 run은 이 비교에서 중단되어 기존 자동 경로만 재시도하는 것으로는 최신 main을 운영자가 직접 복구할 수 없었다.

새 경로는 이 자동 계약을 우회하거나 완화하지 않고, 운영자가 `main`을 명시적으로 dispatch했을 때 기존 Apply job에서 직접 Terraform Apply를 실행하는 recovery 흐름이다. 수동 Apply는 기존 AWS `environment:terraform-apply` subject를 위해 Environment를 사용한다. GCP CI identity는 `repository_id`, `repository_owner_id`와 정확한 `byulmaru/kosmo/.github/workflows/terraform.yml@` workflow ref prefix를 공통으로 확인하고, `pull_request` + `base_ref == main` 또는 `push`/`workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment만 허용한다. Firebase/native-distribution provider와 Firebase resource는 별도 소유 경계다.

## Goals / Non-Goals

**Goals:**

- main ref에서 dispatch된 `github.sha`를 Apply checkout source로 사용한다.
- 기존 Apply job을 재사용하고, manual event에서 main guard를 credential 주입보다 앞에 둔다.
- 기존 인증·Terraform 초기화 뒤 manual event에서 `terraform apply -auto-approve`를 한 번 실행한다.
- GCP CI provider는 `repository_id`, `repository_owner_id`와 정확한 `byulmaru/kosmo/.github/workflows/terraform.yml@` workflow ref prefix를 요구하고, `pull_request` + `base_ref == main` 또는 `push`/`workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment만 허용한다. 다른 workflow, `workflow_run`, Environment 없는 main job, 다른 repository/owner, tag·feature ref의 non-PR 실행은 거부하며 PR 예외는 read-only를 보장하지 않는다는 계약을 기록한다.
- 기존 push Apply의 reviewed/current semantic comparison, reviewed saved plan 적용과 native stale validation, PR Plan 및 출력 노출 경계를 보존한다.

**Non-Goals:**

- 별도 Manual Plan job, `needs` 의존성, `terraform plan`, Plan artifact, saved plan 다운로드·metadata 검증을 추가하지 않는다.
- Plan-only 또는 `confirm_apply` 입력, 별도 사람 승인, target SHA/NAT/replace 입력을 추가하지 않는다.
- 기존 자동 comparison 실패를 자동 Apply로 우회하지 않는다.
- Firebase/native-distribution WIF, Firebase resource, Environment 설정, secret·variable 또는 Kubernetes 저장소를 변경하지 않는다.
- 실제 dispatch, rerun, Apply 또는 live trust/resource 상태를 이 change의 정적 검증으로 주장하지 않는다.

## Implementation Guidance

### Current Constraints

- `workflow_dispatch`에는 pull request/push처럼 선언적인 branch filter가 없으므로 기존 Apply job의 manual 경로에서 `refs/heads/main`을 확인해야 한다. 이 확인은 AWS/GCP/Tailscale/Argo credential 단계보다 앞서야 한다.
- 기존 Apply job을 manual event에도 실행하되, reviewed plan 다운로드와 current/reviewed semantic comparison은 `push` event에만 남긴다. PR Plan과 push의 자동 계약은 그대로 유지한다.
- GCP `kosmo-terraform` condition은 `repository_id`, `repository_owner_id`와 정확한 `workflow_ref` prefix가 일치하면서 `event_name == pull_request && base_ref == main`이거나 `(event_name == push || event_name == workflow_dispatch) && ref == refs/heads/main && environment == terraform-apply`인 token만 허용한다. AWS role은 기존 `environment:terraform-apply` subject를 이미 사용하므로 manual Apply에 같은 Environment를 계속 부여한다.
- Manual Apply는 saved plan을 사용하지 않으므로 Terraform 내부에서 새 계획을 계산한다. Terraform native saved-plan stale validation은 기존 push reviewed saved plan 경로의 보장으로 설명하고 manual 직접 Apply에 전이하지 않는다.

### Recommended Approach

1. workflow dispatch를 추가하고 기존 Apply job의 job condition이 `push`와 `workflow_dispatch`를 모두 허용하게 한다. checkout은 dispatch context의 `github.sha`를 명시적으로 사용한다.
2. 기존 Apply job 첫 단계에 manual event의 `refs/heads/main` guard를 두고, guard 뒤의 기존 AWS/GCP/Tailscale/Argo 인증 및 Terraform init을 재사용한다.
3. 기존 push 전용 reviewed plan 다운로드와 semantic comparison을 그대로 두고, manual event에서는 두 단계를 건너뛴다. Apply step은 manual event에 `terraform apply -auto-approve`를, push event에 기존 `terraform apply -auto-approve terraform.tfplan`을 실행한다.
4. Terraform CI GCP provider condition은 `repository_id`, `repository_owner_id`, `workflow_ref.startsWith('byulmaru/kosmo/.github/workflows/terraform.yml@')`와 `pull_request` + `base_ref == main` 또는 `push`/`workflow_dispatch` + `refs/heads/main` + `terraform-apply` Environment를 사용한다. 다른 workflow·event·ref·repository·owner를 거부하고 PR 예외가 read-only가 아님을 문서화한다.
5. 운영 문서에는 manual run이 별도 Plan 없이 기존 Apply job에서 직접 Apply되는 경로이며, Environment에는 현재 required reviewer가 없고 main branch policy가 있다는 점을 구분해 적는다. 실제 Apply 증거는 별도 운영 실행 기록으로 남긴다.

### Allowed Alternatives

없음. 기존 Apply job 재사용이 현재 Environment·credential·cleanup 경계를 중복하지 않는 가장 작은 경로다.

### Known Traps

- `workflow_dispatch`의 선택 ref를 검증하지 않거나 checkout 기본 source를 명시하지 않으면 main-only 경계를 잃을 수 있다.
- Manual event에서 reviewed plan 다운로드나 semantic comparison을 실행하면 기존 PR/push artifact 계약을 수동 경로에 잘못 적용한다.
- Manual event에 saved plan을 전달하려고 별도 job, `needs`, artifact 또는 metadata를 다시 추가하면 승인된 직접 Apply 범위를 벗어난다.
- Plan과 Apply 중 한쪽만 AWS `terraform-apply` Environment를 사용하거나, GCP condition만 바꾸고 trust 선행 Apply를 생략하면 인증 경계가 비대칭이 된다.
- Firebase/native-distribution provider를 CI provider로 잘못 해석해 disabled provider 또는 Firebase resource를 수정하면 범위를 벗어난다.
- Manual direct Apply에 Terraform native saved-plan stale validation이 적용된다고 설명하면 검증 보장을 과장한다.
- plan JSON, 비교용 JSON, OIDC token, cloud secret을 summary·artifact·로그에 추가하면 기존 노출 경계를 깨뜨린다.

## Risks / Trade-offs

- [수동 직접 Apply] → 별도 saved plan과 native stale-plan 검증이 없는 경로이므로 main branch policy, explicit dispatch, main guard와 existing credential boundary에 의존한다. 운영 문서에서 manual event가 별도 사람 승인을 갖지 않음을 명확히 한다.
- [CI trust 선행 필요] → GCP provider 변경이 main push Apply로 먼저 반영되지 않으면 manual path가 인증되지 않는다. bootstrap 순서와 실패 시 중단 조건을 문서·검증에 포함한다.
- [workflow-scoped GCP trust] → repository/owner ID, 정확한 Terraform workflow ref와 세 허용 event 경로를 함께 확인하므로 다른 workflow·workflow_run·Environment 없는 main job·다른 repository/owner·tag/feature non-PR을 거부한다. PR 예외는 read-only를 보장하지 않으며 AWS Environment/subject는 별도 경계다.
- [동일 state concurrency] → Manual Apply는 기존 `terraform-kosmo-state` concurrency를 유지해 다른 Terraform 실행과 충돌하는 위험을 줄인다.

## Migration Plan

1. OpenSpec Gate 승인 후 workflow, Terraform CI provider condition, 운영 문서를 함께 구현하고 actionlint/format/OpenSpec strict 및 실행 조건 검증을 수행한다.
2. PR Plan과 기존 main push Apply가 CI trust 변경을 검토된 saved plan으로 실제 반영할 때까지 manual dispatch를 사용하지 않는다. 기존 semantic comparison 불일치가 발생하면 자동 경로의 안전한 실패로 기록하고 중단한다.
3. trust 선행 Apply 성공 후, 별도 운영 승인 절차에 따라 main에서 manual run을 수행한다. 이 change의 PR·정적 검증은 실제 Apply 성공 증거를 대신하지 않는다.
4. rollback이 필요하면 workflow dispatch/manual direct Apply 경로와 GCP CI condition을 reviewed Terraform change로 되돌리고, 기존 PR/push workflow와 Firebase/native-distribution provider는 그대로 보존한다.

## Open Questions

없음. Issue Gate에서 manual direct Apply, main-only, 기존 Apply job 재사용, 좁은 CI GCP trust 추가와 기존 자동 경로 보존을 승인했다.
