## Context

이 기록은 `proposal.md`, shared application runtime role과 credential consumer를 정의한 specs, 그리고 ADR 0024·Core 서비스 경계를 반영한 PROD-780 Issue Gate 결과를 durable choice로 정리한다. 현재 active `cut-over-worker-postgres-credentials`는 workload source를, `grant-runtime-postgres-application-object-privileges`는 rollback window까지 유지할 `kosmo_api`/`kosmo_worker` 공통 ACL을 기록한다. 이 change는 ACL/role/Secret contract를 직접 고치지 않고, 적용되는 runtime source spec만 구현 결과에 맞춰 sync한다. legacy contract 제거는 PROD-781이 소유한다.

## Decision Records

### retained `kosmo_worker`를 shared application runtime principal로 사용한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: GraphQL RLS 철회 이후에도 API·Web·Worker runtime이 API/Worker 역할로 나뉘어 application credential identity와 운영 경계를 중복 보유한다.
- Decision Outcome: 기존 `kosmo_worker`를 API, Web, Temporal Worker와 Fedify consumer application DB가 공유하는 하나의 non-owner runtime role로 사용한다. role은 `LOGIN NOBYPASSRLS`이고 schema/table owner, migration owner 또는 queue owner가 아니다.
- Alternatives Considered: API workload가 owner `kosmo` 또는 API 전용 `kosmo_api` source를 계속 소비하는 방식은 shared non-owner runtime 경계를 유지하지 못하므로 선택하지 않는다. 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning을 transition 중 제거하는 방식은 rollback window를 깨므로 선택하지 않는다.
- Consequences: Web/Worker에서 이미 사용 중인 Worker credential source가 API와 Fedify consumer에도 기준이 된다. `kosmo_worker` role attribute·실제 `current_user`와 기존 two-role object ACL/rollback provisioning은 별도 비운영 검증이 필요하다.
- Confirmation / Follow-up: exact non-production revision에서 각 application workload의 `current_user`, `rolbypassrls=false`, owner/ACL을 확인한다.

### process-wide application DB는 shared standard PG\* source를 사용한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: API/Fedify consumer의 owner source와 Web/Worker의 Worker source가 workload별로 갈라져 source precedence와 credential selector를 유지해야 한다.
- Decision Outcome: API, Web, Worker와 Fedify consumer application DB는 동일한 direct read-write Service와 release-derived `kosmo_worker` Secret을 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`로 사용한다. `DATABASE_URL`, `DATABASE_PASSWORD`, URL/password selector와 implicit fallback은 두지 않는다.
- Alternatives Considered: URL/password trio와 역할별 selector를 유지하는 방식은 source precedence와 escaping을 다시 도입하므로 선택하지 않는다. GraphQL operation-specific handle을 남기는 방식은 ADR 0024/PROD-779와 충돌하므로 선택하지 않는다.
- Consequences: application workload render, local/integration harness와 process-wide DB client의 source assertions가 shared Worker principal을 기준으로 정렬되어야 한다. queue URL/password는 이 source에 합치지 않는다.
- Confirmation / Follow-up: 비밀 값을 출력하지 않고 dev/prod static render와 비운영 workload env/SecretRef를 비교한다.

### application workload consumer를 shared role로 전환하되 legacy provisioning은 유지한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-780`
- Status: Active
- Context / Problem: API/Fedify consumer가 owner `kosmo` source를 소비하고 API 전용 workload SecretRef를 유지해 application runtime principal이 갈라져 있다. 반면 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 rollback window까지 보존되어야 한다.
- Decision Outcome: API/Web/Worker/Fedify application workload의 process-wide DB consumer와 SecretRef를 retained `kosmo_worker` 표준 PG\* source로 전환하고 owner/API 전용 consumer를 제거한다. `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 PROD-781까지 유지하며 이 change에서 revoke/drop/contract SQL을 추가하지 않는다.
- Alternatives Considered: workload consumer와 provisioning을 같은 turn에 제거하는 방식은 rollback-compatible transition을 깨므로 선택하지 않는다. owner `kosmo` 또는 API role source를 workload에 남기는 방식은 shared non-owner 경계를 깨므로 선택하지 않는다.
- Consequences: rendered workload manifest에는 API/owner SecretRef가 없지만 API role/Secret provisioning과 existing two-role ACL은 남는다. `PROD-780`은 runtime transition·integration verification·적용되는 active runtime spec sync/archive를, `PROD-781`은 production drain/rollback window 뒤 legacy contract 제거를, `PROD-712`는 owner credential/`NOLOGIN`을 소유한다.
- Confirmation / Follow-up: 비밀 값을 출력하지 않고 각 workload `current_user`, `rolbypassrls=false`, worker Secret rotation 4 consumer target과 API provisioning 보존을 확인한다.

### migration owner, Fedify queue와 Pooler는 shared application role과 분리한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, `PROD-780`
- Status: Active
- Context / Problem: application runtime principal 통합이 migration ownership, queue transport와 Pooler lifecycle까지 넓어지면 rollback과 운영 승인 경계가 흐려진다.
- Decision Outcome: production migration은 기존 `kosmo_migration` login과 `SET ROLE kosmo` owner 경계를 유지한다. Fedify MessageQueue는 `kosmo_fedify_queue` 전용 database/role/credential을 계속 사용하며, 기존 Pooler resource는 유지한다. shared `kosmo_worker`는 이 세 경계를 재사용하지 않는다.
- Alternatives Considered: migration 또는 queue가 shared application credential을 재사용하는 방식은 owner·transport isolation을 잃으므로 선택하지 않는다. GraphQL Pooler resource를 함께 제거하는 방식은 ADR 0024가 명시한 보존 범위를 넘으므로 선택하지 않는다.
- Consequences: application PG\* source와 `FEDIFY_QUEUE_DATABASE_URL`/password, migration Secret/env 검증을 별도로 유지해야 한다.
- Confirmation / Follow-up: combined non-production render와 catalog 검증에서 `current_user`, database/role source와 Pooler CR 보존을 비민감한 결과로 기록한다.

### GraphQL/application policy와 Worker/Fedify/Temporal behavior는 변경하지 않는다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: credential identity 변경을 GraphQL visibility, owner predicate 또는 trusted workload behavior 변경으로 오해할 수 있다.
- Decision Outcome: central application policy, GraphQL schema/payload/list ordering/pagination, hidden/deleted Post owner cleanup, `deletePost`의 Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup, viewer-independent Reaction count와 Worker/Fedify/Temporal 기능을 보존한다. operation session, actor GUC, `ctx.db`와 RLS policy를 다시 도입하지 않는다.
- Alternatives Considered: 새 role의 권한을 이용해 application policy를 DB RLS로 옮기는 방식은 ADR 0024와 중복 enforcement 비용을 되살리므로 선택하지 않는다. credential PR에서 Worker/Fedify behavior를 개선하는 방식은 독립 capability를 혼합하므로 선택하지 않는다.
- Consequences: 회귀 검증은 role/source와 기존 application behavior를 분리해 기록하고, policy·transport 변경은 별도 issue로 만든다.
- Confirmation / Follow-up: 관련 GraphQL/core/Worker/Fedify regression은 기존 동작 보존을 확인하는 범위로만 실행한다.

### shared runtime consumer transition은 rollback-compatible 단계로 분리한다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-780`
- Status: Active
- Context / Problem: old/new workload가 전환 중 혼용될 수 있으므로 `kosmo_api` provisioning과 existing ACL을 먼저 제거하면 rollback 대상 workload가 실패할 수 있다.
- Decision Outcome: 기존 migration file/name/hash와 contract SQL을 수정·추가하지 않는다. shared `kosmo_worker` PG\* consumer 전환, API/owner workload SecretRef 제거와 4 consumer Secret rotation restart를 비운영에서 검증하고, `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 PROD-781까지 유지한다.
- Alternatives Considered: transition과 동시에 `kosmo_api` ACL/role/Secret contract를 제거하거나 production sync를 CI/merge에 묶는 방식은 rollback과 authorization 경계를 깨므로 선택하지 않는다. custom phase selector를 즉시 도입하는 방식은 반복 운영 요구가 확인되지 않아 선택하지 않는다.
- Consequences: PROD-780 implementation PR은 runtime PG\* transition·workload consumer removal·통합검증·적용되는 active runtime spec sync/archive를 소유하지만 ACL/role/Secret contract mutation과 production live execution을 수행하지 않는다. PROD-781은 production transition·drain·rollback window 뒤 legacy contract를, PROD-712는 owner credential/`NOLOGIN`을 소유한다.
- Confirmation / Follow-up: existing migration replay와 non-production current_user/ACL/workload assertions를 실행하고, production 명령 실행 여부를 별도 evidence로 분리한다.

### active OpenSpec 경계는 구현 전 직접 수정하지 않는다

- Decision Date: 2026-08-16
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-780`
- Status: Active
- Context / Problem: active `cut-over-worker-postgres-credentials`의 workload source와 이 change의 shared runtime target은 조정이 필요하지만, active `grant-runtime-postgres-application-object-privileges`의 two-role ACL은 PROD-781 전까지 보존 계약이다.
- Decision Outcome: OpenSpec Gate에서는 active change와 top-level active specs를 직접 rewrite하지 않는다. `PROD-780` implementation은 실제 runtime source·workload consumer·Secret rotation contract를 변경한 뒤 적용되는 runtime delta만 canonical/Linear authority와 대조해 sync/archive한다. ACL/role/Secret contract delta와 `grant-runtime-postgres-application-object-privileges` sync/archive는 PROD-781이 소유한다.
- Alternatives Considered: 구현 전 active artifact를 일괄 rewrite하는 방식은 Issue Gate 승인 범위를 넘어 authority와 완료 상태를 앞당겨 확정한다. ACL contract를 PROD-780에 복사하거나 SQL을 선반영하는 방식은 PROD-781 dependency를 침범한다.
- Consequences: 이 change에는 runtime conflict boundary와 후속 sync 책임을 명시하지만, active ACL artifact의 현재 이력은 보존한다. `PROD-780`은 구현·통합검증·적용되는 active runtime spec sync·archive를, `PROD-781`은 legacy ACL/role/Secret contract sync·archive를 소유한다.
- Confirmation / Follow-up: tasks에 두 issue의 ownership boundary를 명시하고, 구현 시작 전 이 change의 OpenSpec Gate 승인을 별도로 받는다.

### historical RLS inventory와 Post slice는 이 runtime change에서 재활성화하지 않는다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: 취소된 `PROD-707`/`PROD-767`은 전체 GraphQL RLS coverage를 목표로 했고, 완료된 `PROD-713`은 당시 Post/PostContent `kosmo_api` RLS slice를 기록한다. 현재 runtime role 통합이 이 historical RLS 목표를 다시 열어야 하는지 혼동할 수 있다.
- Decision Outcome: 이 change는 RLS policy·actor helper·GraphQL coverage inventory를 구현하거나 재개하지 않는다. Post/PostContent와 Bookmark의 historical RLS 변경은 현재 ADR 0024 및 선행 compensating change의 이력으로만 남기고, GraphQL/application policy와 shared DB runtime 경계를 target으로 사용한다.
- Alternatives Considered: 취소된 coverage gate를 다시 시작하거나 `kosmo_api` RLS principal을 유지하기 위해 runtime role 통합을 보류하는 방식은 현재 PROD-780 범위와 ADR 0024에 맞지 않아 선택하지 않는다.
- Consequences: `PROD-707`/`PROD-767`은 canceled 상태를 유지하고 `PROD-713`은 historical completed slice로 남는다. 새 RLS 도입은 별도 canonical/Linear 결정 없이는 이 change의 task가 될 수 없다.
- Confirmation / Follow-up: implementation diff에 RLS policy·actor helper 변경이 없는지 확인하고 application policy regression만 기존 계약 보존 범위에서 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- `PROD-715`/`cut-over-worker-postgres-credentials`가 정의한 “API/Fedify consumer는 owner `kosmo`, Web/Worker는 `kosmo_worker`” process-wide source split은 PROD-780의 shared `kosmo_worker` application runtime contract로 대체 대상이다. 실제 active artifact sync는 implementation과 검증이 끝난 뒤 수행한다.
- `PROD-369`/`runtime-postgres-scram-credential-provisioning`의 Worker `BYPASSRLS=true` attribute는 PROD-780의 retained `kosmo_worker LOGIN NOBYPASSRLS` target으로 조정된다. API `kosmo_api` role/Secret provisioning은 PROD-781까지 유지하며 workload consumer/SecretRef만 PROD-780에서 제거한다.
- `PROD-724`/`grant-runtime-postgres-application-object-privileges`의 두 runtime role 공통 CRUD ACL 전제는 PROD-780에서 변경하지 않고 rollback-compatible contract로 유지한다. legacy ACL/default ACL/role/Secret 제거와 해당 active spec sync/archive는 PROD-781에서 소유한다.
- 취소된 `PROD-707`/`PROD-767`의 “전체 GraphQL 사용자 데이터 RLS coverage” 목표와 완료된 `PROD-713`의 `kosmo_api` Post/PostContent RLS slice는 ADR 0024의 application-policy 경계와 PROD-780의 shared runtime role 결정으로 현재 target authority가 아니다.
