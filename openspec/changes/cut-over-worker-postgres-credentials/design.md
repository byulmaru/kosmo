## Context

현재 main의 Helm chart는 PROD-709가 만든 `api`/`fedify` atomic credential selector를 가진다. `api` source는 API Rollout과 Web BFF 기본 `DATABASE_*`를 공유하고, `fedify` source는 Web Rollout과 기본 비활성 Temporal Worker Deployment에 `FEDIFY_DATABASE_*`를 투영한다. 그러나 runtime 코드는 이 Fedify env를 소비하지 않으며, Web federation ingress와 아직 등록되지 않은 Worker Activity는 기본 database singleton 경계에 남아 있다.

PROD-715의 최신 계약은 역할 이름을 프로토콜인 Fedify가 아니라 신뢰 실행 경계인 Worker로 정정한다. 이 change는 PROD-709의 selector/env seam을 migration하고, PROD-710이 제공할 명시적 Worker connection과 SQL callsite에 PROD-369/724가 준비할 `kosmo_worker` credential과 최소 객체 권한을 연결한다. PROD-369/724/710이 완료되기 전에는 Helm seam과 OpenSpec 정렬 외의 실제 cutover를 완료할 수 없다.

## Goals / Non-Goals

**Goals:**

- Helm selector와 runtime env를 `worker`/`WORKER_DATABASE_*`로 정렬한다.
- Web trusted federation ingress와 Temporal Worker DB Activity가 PROD-710의 명시적 Worker connection을 통해 같은 Worker credential source를 사용하게 한다.
- API Rollout과 Web BFF 기본 `DATABASE_*`, migration credential과 execution 경계를 보존한다.
- Worker source만 독립적으로 cutover·rollback하고 승인된 production에서 실제 role을 검증한다.

**Non-Goals:**

- `kosmo_worker` 역할·Vault source·Kubernetes Secret 생성 또는 객체 GRANT.
- PROD-710이 소유한 명시적 execution boundary와 Post/PostContent SQL callsite 이전 자체.
- Temporal domain Workflow, Post/Reaction/Follow transition, Fedify MessageQueue runtime(PROD-448) 또는 API outbound delivery 전환.
- API/Web BFF 기본 `kosmo_api` credential cutover(PROD-716).
- 별도 사용자 승인 없는 production sync/apply.

## Implementation Guidance

### Current Constraints

- `postgres.credentials.fedify`는 URL, Secret name과 key를 atomic trio로 검증하고 Web/Worker에만 `FEDIFY_DATABASE_*`를 추가한다. API와 migration template에는 이 env가 없다.
- Helm values schema가 없어 알 수 없는 legacy key는 기본적으로 조용히 무시될 수 있다. Breaking rename 뒤 구 key가 owner fallback으로 오인되지 않게 명시적 검증이 필요하다.
- 현재 main의 Web ingress는 전역 Fedify federation과 core database singleton을 사용한다. PROD-706은 request execution context seam을 준비하지만, PROD-710의 SQL handle 이전까지 credential env 이름만 바꿔서는 실제 DB principal이 달라지지 않는다.
- Worker foundation은 기본 비활성이며 business registration과 DB Activity가 없다. 이 change는 제외된 Workflow/Activity를 새로 만들어 cutover를 증명할 수 없다.
- PROD-709 change가 완료·merge됐지만 아직 active spec으로 archive되지 않아 `workload-postgres-credential-selection` modified delta의 baseline sync가 선행되어야 한다.

### Recommended Approach

1. PROD-709 완료 change의 authority와 completion evidence를 재확인하고 active `workload-postgres-credential-selection` spec을 sync/archive한다. 이 단계는 PROD-715 구현과 별개로 이전 selector 계약의 baseline만 확정한다.
2. Helm values/helper/Web/Worker templates에서 `fedify` selector와 `FEDIFY_DATABASE_*`를 `worker`/`WORKER_DATABASE_*`로 한 번에 교체한다. API 및 migration documents는 변경하지 않는다. Legacy `fedify` input이 설정되면 명확한 render 오류로 거부해 silent owner fallback을 막는다.
3. PROD-710 완료 뒤 Web ingress와 실제 Temporal Worker DB Activity bootstrap이 제공하는 명시적 Worker connection factory/handle에 `WORKER_DATABASE_URL` source를 연결한다. SQL callsite나 business Activity를 이 change에서 새로 정의하지 않는다.
4. Local/render tests에서 complete/partial/legacy selector, API 비주입, Web+Worker 투영, API/Web BFF 기본 connection과 migration 불변, Worker source rollback을 확인한다.
5. PROD-369/724/710 완료와 사용자 production 승인 뒤에만 Worker source를 `kosmo_worker` Secret으로 전환하고 두 runtime connection의 `current_user`/`rolbypassrls`, API 음성 경계와 rollback을 검증한다.

### Allowed Alternatives

- PROD-710이 동일한 specs를 만족하는 다른 explicit connection factory/handle 형태를 제공하면 해당 public seam을 사용해도 된다. PROD-715가 별도의 평행 DB abstraction을 만들 필요는 없다.
- Helm test는 repository에 유지할 가치가 있는 focused render test 또는 검토 가능한 일회성 render evidence로 제공할 수 있다. 다만 legacy key 거부와 API 비주입을 자동 검증하는 작은 테스트가 기본 권장 경로다.

### Known Traps

- env 이름만 바꾸고 Web/Fedify SQL이 전역 `DATABASE_URL` singleton을 계속 사용하면 실제 principal은 전환되지 않는다.
- `DATABASE_URL`을 Worker source로 덮어쓰면 Web BFF까지 BYPASSRLS 역할을 사용하게 된다.
- Worker env를 API Rollout에 주입하거나 API source를 Worker fallback으로 재사용하면 credential 격리가 깨진다.
- PROD-369 role/Secret만 준비됐거나 CI가 통과했다는 이유로 PROD-724 GRANT, PROD-710 connection 경계 또는 production 승인을 생략할 수 없다.
- legacy `fedify` key를 조용히 무시하면 운영자가 Worker source가 적용됐다고 오인한 채 owner fallback으로 실행할 수 있다.

## Risks / Trade-offs

- [Internal Helm/env 이름의 breaking rename] → 아직 production cutover 전인 seam에서 dual-read 없이 한 번에 migration하고 legacy input을 fail-fast로 거부한다.
- [선행 PR merge 순서에 따른 일시적 미소비 env] → Helm seam 변경은 독립 배포 가능하지만 실제 cutover task는 PROD-710 완료 뒤까지 미완료로 둔다.
- [BYPASSRLS가 객체 ACL을 우회하지 않음] → PROD-724의 최소 GRANT와 실제 Worker query smoke가 준비되기 전에는 credential을 전환하지 않는다.
- [기본 비활성 Worker로 live Activity를 증명할 수 없음] → 현재 등록된 DB Activity가 있는 배포에서만 Worker live evidence를 요구하고, excluded business capability를 검증용으로 만들지 않는다.
- [production rollback 오판] → API image/selector와 migration을 고정하고 Worker selector source만 owner로 되돌린 뒤 두 명시적 connection과 API 음성 경계를 다시 검증한다.

## Migration Plan

1. OpenSpec Gate에서 selector/env rename, no-dual/fail-fast, blocker와 verification 책임을 승인한다.
2. PROD-709 baseline spec sync/archive와 Helm `worker` selector/env migration을 구현·검증한다. 이 단계에서는 production values를 활성화하지 않는다.
3. PROD-369가 `kosmo_worker` role/Secret을 provision하고 live readiness를 검증하며, PROD-724가 최소 객체 GRANT를 완료하고, PROD-710이 명시적 Worker connection과 SQL 이전을 완료한다.
4. Web trusted ingress와 실제 Worker DB Activity의 connection bootstrap을 `WORKER_DATABASE_*` source에 wiring하고 local/integration regression을 통과한다.
5. 사용자에게 production 변경 목록, Secret source, rollback과 live query 계획을 제시하고 별도 명시적 승인을 받는다.
6. 승인 뒤에만 production sync/apply와 rollout을 수행하고 `current_user = 'kosmo_worker'`, `rolbypassrls = true`, API 비주입과 기본 connection 불변을 검증한다.
7. 실패하면 Worker selector source만 승인된 owner source로 되돌리고 Web/Worker connection과 API/migration 불변을 재검증한다.

## Open Questions

- 없음. `fedify` legacy input은 dual-read하지 않고 render 단계에서 fail-fast로 거부하는 구현 선택을 decisions에 기록한다.
