## Context

PROD-369/724와 PROD-715/722는 API·Worker role provisioning, object ACL과 workload별 표준 PG source를 단계적으로 준비했다. PROD-776/779와 ADR 0024 이후 GraphQL은 application policy와 process shared DB 경계를 사용하지만, 현재 main에는 API용 `kosmo_api`와 Web/Worker용 `kosmo_worker` provisioning이 함께 선언되고 API/Fedify consumer가 owner `kosmo` source를 소비하는 전환 잔여물이 있다. 이 change는 application workload credential consumer identity만 하나로 정렬하고, 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning과 rollback 경계를 PROD-781까지 보존하며 migration owner와 Fedify MessageQueue의 별도 경계를 유지한다.

## Goals / Non-Goals

**Goals:**

- retained `kosmo_worker LOGIN NOBYPASSRLS`를 API, Web, Worker와 Fedify consumer application DB의 공통 non-owner principal로 정렬한다.
- application workload에서 owner `kosmo`와 `kosmo_api` credential consumer·SecretRef·API 전용 source selector를 제거하고, retained `kosmo_worker` SecretRef로 전환한다. role/Secret provisioning 자체는 PROD-781까지 유지한다.
- 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning, 표준 `PG*` env, 기존 direct Service와 Pooler resource, migration/queue 경계를 유지한다.
- static render, disposable replay/catalog와 비운영 representative DML로 role·Secret·ACL·consumer 경계를 증명한다.

**Non-Goals:**

- GraphQL resolver, schema, application visibility/owner policy와 core service 경계를 변경하지 않는다.
- Worker/Fedify/Temporal registration, queue transport, retry·delivery policy를 변경하지 않는다.
- migration owner 또는 `kosmo_fedify_queue` database/role/credential을 통합하지 않는다.
- Pooler CR/resource를 제거하거나 변경하지 않는다.
- production Secret sync/apply, credential cutover/live 검증은 이 turn과 PROD-780 implementation PR에서 실행하지 않는다. 기존 immutable migration과 contract SQL을 선반영하지 않으며, `kosmo_api` ACL/default ACL/role/Secret provisioning 제거는 PROD-781에서 production transition·drain·rollback window 뒤에 수행한다. `kosmo` owner credential/`NOLOGIN`은 PROD-712 후속이다.

## Implementation Guidance

### Current Constraints

- 현재 chart에는 API와 Worker DatabaseRole/Secret source가 함께 있고, API·Fedify consumer와 migration의 process-wide source는 owner `kosmo`, Web·Worker는 `kosmo_worker`로 렌더된다. 구현자는 source를 URL로 재조립하거나 `DATABASE_URL` fallback으로 우회하지 않고 standard PG env 계약을 유지해야 한다.
- `kosmo_worker`는 이미 Worker/Temporal 경로의 role로 provision됐고 `kosmo_api` ACL/default ACL과 role/Secret provisioning은 PROD-724/PROD-369 경계로 유지된다. applied migration과 snapshot을 수정·재생성하지 말고, role/ACL/Secret cleanup이나 contract SQL을 이 change에 선반영하지 않는다.
- GraphQL RLS와 actor GUC는 ADR 0024/PROD-779에서 제거된 경계다. runtime principal 통합을 이유로 operation session, context DB handle, actor setting 또는 RLS policy를 되살리면 안 된다.
- Fedify consumer의 domain DB source와 Fedify MessageQueue transport source는 별개다. queue는 `FEDIFY_QUEUE_DATABASE_URL`/password와 `kosmo_fedify_queue` 전용 role/database를 계속 사용한다.
- `docs/operations/postgres-session-pool.md`는 historical operation-session 절차를 담으므로 target architecture와 충돌하는 명령을 실행 근거로 사용하지 않는다. Pooler resource 보존과 production 실행 금지 경계만 참조한다.

### Recommended Approach

1. chart values/helper와 workload templates의 application credential source를 inventory하고, API·Web·Worker·Fedify consumer 각각이 같은 release-derived Worker Secret과 direct Service의 PG\* env를 사용하도록 정렬한다.
2. API workload의 owner/API role SecretRef와 custom selector를 제거하고, API/Web/Worker/Fedify consumer를 shared Worker SecretRef와 표준 PG\*로 전환한다. API DatabaseRole/VSO source와 existing ACL/default ACL은 PROD-781까지 변경 목록에서 제외한다.
3. 기존 application object ACL과 migration history를 변경하지 않고, retained `kosmo_worker`의 `NOBYPASSRLS`·current_user·대표 DML과 rollback-compatible API role/provisioning을 비운영에서 검증한다.
4. API/Fedify consumer/Web/Worker의 rendered env와 SecretRef에서 owner `kosmo` 및 `kosmo_api` workload consumer가 남지 않았는지 확인하되, `kosmo_api` DatabaseRole/VSO/ACL provisioning 자체는 유지되는지 별도로 확인한다.
5. disposable PostgreSQL에서 기존 migration replay, catalog ACL/owner/attribute와 대표 application DML을 확인하고, exact non-production revision에서 workload `current_user`와 queue/migration source 분리를 확인한다. contract SQL이나 ACL revoke/drop artifact는 추가하지 않는다.
6. implementation PR과 OpenSpec completion은 production preflight/sync/apply/cutover/live와 별개로 보고한다. `PROD-780`은 runtime transition·consumer removal·통합검증과 적용되는 active runtime spec sync/archive를 소유하고, legacy role/ACL/Secret contract 제거는 PROD-781, owner credential/NOLOGIN은 PROD-712가 소유한다.

### Allowed Alternatives

위 순서와 동등하게 shared role·PG\*·기존 ACL·별도 queue/migration 경계를 만족하고, 기존 migration history를 보존하며, 비운영 검증 증거를 제공하는 chart/helper 구성이 허용된다. ACL revoke/drop 또는 contract migration을 선반영하는 대안은 허용하지 않는다.

### Known Traps

- `kosmo_api` role/Secret provisioning을 이 transition에서 삭제하면 rollback-compatible PROD-781 contract를 침범한다. provisioning은 유지하되 workload consumer/SecretRef만 제거해야 한다.
- `kosmo_worker`의 `BYPASSRLS=true`를 보존하면 ADR 0024의 application runtime `NOBYPASSRLS` 계약을 위반한다. role attribute와 실제 `current_user`를 별도로 검증해야 한다.
- `kosmo_worker` credential을 Fedify MessageQueue에 재사용하거나 queue URL을 domain PG\* source로 대체하면 별도 transport ownership을 침범한다.
- existing Drizzle migration을 수정하거나 contract SQL을 선반영하면 history/hash와 rollback 경계를 깨뜨린다.
- CI green, Helm render 또는 dev rollout만으로 production Secret sync·live cutover나 PROD-781 contract removal을 완료했다고 보고하지 않는다. runtime transition evidence와 downstream contract execution을 별도 evidence로 구분한다.
- GraphQL 정책을 DB ACL/RLS로 옮기거나 Worker/Fedify/Temporal 기능을 바꾸는 것은 이 role 통합의 범위를 초과한다.

## Risks / Trade-offs

- [동시 workload가 old/new credential을 혼용할 위험] → application runtime transition과 role/Secret contract를 별도 단계로 검증하고, production cutover 전 active/rollback workload의 source와 rollback window를 확인한다.
- [shared credential 전환 중 rollback workload가 실패할 위험] → API role/Secret provisioning을 유지한 채 non-production exact revision과 rollback window 전후 workload source를 검증한다.
- [PG env와 Secret naming drift] → release-derived Worker SecretRef와 표준 PG env를 정적 render에서 API/Web/Worker/Fedify consumer 전부 비교한다.
- [owner credential이 남아 권한 경계가 흐려질 위험] → rendered manifest·runtime env에 owner application SecretRef가 없는지 검사하고 migration owner는 별도 template로 남긴다.
- [변경 범위가 GraphQL/queue/Worker policy로 번질 위험] → specs의 보존 계약과 diff ownership을 기준으로 리뷰하며 해당 기능 회귀는 별도 issue로 분리한다.

## Migration Plan

1. 최신 `origin/main`에서 role·Secret·Helm source와 active OpenSpec 충돌을 다시 확인한다.
2. non-production에서 shared `kosmo_worker` role/Secret과 application workload PG\* source를 준비하고, API `kosmo_api` role/Secret provisioning은 유지하면서 workload consumer/SecretRef 제거를 검증한다.
3. exact non-production revision에서 API/Web/Worker/Fedify consumer의 `current_user`, `rolbypassrls=false`, existing object ACL/owner, queue/migration role 분리를 확인한다.
4. `PROD-780` implementation PR은 runtime PG\* transition·workload consumer removal·Secret restart와 전체 통합검증, 적용되는 active runtime spec sync/archive를 소유한다. ACL/default ACL/role/Secret contract mutation과 production Secret sync/apply/cutover/live 검증은 이 PR에서 실행하지 않는다.
5. `PROD-781`은 production transition·drain·rollback window 뒤 legacy `kosmo_api` ACL/default ACL/role/Secret provisioning 제거를 소유하고, `PROD-712`는 owner credential/`NOLOGIN`을 소유한다. 승인되지 않은 production sync/apply/live query는 rollback이나 검증 목적으로도 실행하지 않는다.

Rollback은 application code/chart와 workload credential consumer 변경을 revert 가능한 release 단위로 분리하고, 기존 migration history/contract SQL은 immutable로 유지한다. production에서는 승인된 release rollback 절차와 credential 상태 재확인을 사용한다. 인증 실패를 owner credential fallback으로 숨기는 rollback은 허용하지 않는다.

## Open Questions

없음. PROD-780 Issue Gate가 retained role, shared consumers, 제외 범위와 PROD-712 후속을 확정했다. 구현 중 durable choice나 별도 독립 결과가 발견되면 먼저 Linear/canonical/OpenSpec을 갱신한다.
