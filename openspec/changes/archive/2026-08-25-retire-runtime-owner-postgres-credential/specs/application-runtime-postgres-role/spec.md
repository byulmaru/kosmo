## MODIFIED Requirements

### Requirement: migration·queue·Pooler와 application behavior 경계를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, `PROD-780`, `PROD-712`. Shared application runtime role 전환 뒤 migration은 모든 환경에서 CNPG-managed owner credential로 `kosmo`에 직접 연결해야 하며(MUST), runtime credential을 사용하거나 별도 migration login과 owner role transition을 복원해서는 안 된다(MUST NOT). Fedify MessageQueue 전용 database/role/credential과 기존 Pooler resource는 유지해야 한다(MUST). GraphQL/application policy, Worker/Fedify/Temporal 기능과 Post owner cleanup·`deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload·Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`·Notification cleanup·Reaction count 계약을 변경해서는 안 된다(MUST NOT).

#### Scenario: migration과 queue source 분리

- **WHEN** application workload, migration Job과 Fedify MessageQueue manifest를 함께 렌더한다
- **THEN** migration은 generated `<cluster>-app` Secret으로 owner `kosmo`에 직접 연결해야 한다
- **AND** 별도 migration credential, `DATABASE_MIGRATION_ROLE` 또는 runtime credential fallback이 나타나서는 안 된다
- **AND** queue는 `kosmo_fedify_queue` 전용 database/role/credential을 유지하고 `kosmo_runtime` application credential을 재사용하지 않아야 한다

#### Scenario: Pooler와 application behavior 보존

- **WHEN** migration credential 경계 변경의 diff와 회귀 검증을 검토한다
- **THEN** 기존 Pooler resource, GraphQL/application policy와 Worker/Fedify/Temporal 기능 계약은 변경되지 않아야 한다
- **AND** active API/Web/Worker/Fedify workload는 `kosmo_runtime`을 유지하고 owner credential을 소비하지 않아야 한다
