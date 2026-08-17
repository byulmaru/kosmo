## Context

이 기록은 `kosmo_worker`를 모든 application workload의 shared principal로 재사용하던 이전 초안을 폐기하고, PROD-780의 최신 Issue Gate가 승인한 `kosmo_runtime` 신규 role·Secret·additive ACL·workload 전환을 durable choice로 정리한다. `kosmo_api`와 `kosmo_worker`의 기존 role·ACL·default ACL·Secret provisioning은 각각 PROD-781과 PROD-782의 후속 contract까지 rollback 자산으로 남긴다.

## Decision Records

### `kosmo_runtime`를 새 shared application principal로 provision한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: `kosmo_worker`라는 역사적 이름을 API·Web·Worker·Fedify 전체의 shared runtime identity로 재사용하면 실제 ownership과 후속 cleanup 경계가 흐려진다.
- Decision Outcome: 별도 `kosmo_runtime` PostgreSQL role을 `LOGIN NOBYPASSRLS` non-owner application principal로 provision한다. API, Web, Temporal Worker와 Fedify consumer의 application DB consumer는 이 principal과 release-derived runtime Secret을 사용한다.
- Alternatives Considered: 기존 `kosmo_worker`를 in-place rename하거나 shared target으로 재사용하는 방식은 legacy Worker contract와 naming 책임을 섞으므로 선택하지 않는다. owner `kosmo` 또는 `kosmo_api`를 계속 consumer로 두는 방식도 선택하지 않는다.
- Consequences: 새 role·Secret readiness와 additive ACL migration이 workload 전환의 선행 조건이 된다. `kosmo_worker`는 PROD-782 전까지 삭제하지 않는다.
- Confirmation / Follow-up: 비운영 catalog에서 `current_user=kosmo_runtime`, `rolcanlogin=true`, `rolbypassrls=false`와 non-owner attributes를 확인한다.

### legacy `kosmo_api`와 `kosmo_worker` provisioning은 후속까지 보존한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `PROD-780`, `PROD-781`, `PROD-782`
- Status: Active
- Context / Problem: 신규 runtime 전환 전에 기존 credential을 제거하면 rollback workload가 인증·권한을 잃을 수 있다.
- Decision Outcome: `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 PROD-781까지, `kosmo_worker` role·`BYPASSRLS` attribute·ACL·default ACL·Vault/CNPG Secret provisioning은 PROD-782까지 유지한다. PROD-780은 두 legacy contract의 revoke/drop/removal이나 attribute 축소를 수행하지 않는다.
- Alternatives Considered: 신규 `kosmo_runtime`와 동시에 legacy role/Secret을 제거하는 방식은 rollback window와 후속 contract ownership을 침범하므로 선택하지 않는다.
- Consequences: chart에는 세 role/Secret provisioning이 일시적으로 공존할 수 있으나, application workload consumer는 runtime source로 분리된다.
- Confirmation / Follow-up: rendered manifest에서 legacy provisioning 존속과 application SecretRef 비소비를 각각 확인한다.

### application DB source는 `kosmo_runtime` 표준 PG\*로 통일한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: API/Fedify와 Web/Worker가 owner/API/Worker identity와 selector를 나눠 가져 process-wide source precedence가 복잡하다.
- Decision Outcome: API, Web, Temporal Worker와 Fedify consumer application DB는 같은 direct read-write Service, `PGPORT`, `PGDATABASE`, `PGUSER=kosmo_runtime`와 release-derived runtime Secret의 `PGPASSWORD`를 사용한다. `DATABASE_URL`, `DATABASE_PASSWORD`, API/Worker/Fedify selector와 owner fallback은 process-wide source에 두지 않는다.
- Alternatives Considered: `kosmo_worker`를 shared source로 사용하는 방식은 이번 naming 결정과 PROD-782 ownership을 침범하므로 선택하지 않는다.
- Consequences: queue URL/password와 migration source는 별도 connection으로 남고, 네 workload의 SecretRef와 PG\* assertions는 runtime principal을 기준으로 한다.
- Confirmation / Follow-up: 비밀 값을 노출하지 않고 static render와 non-production workload principal을 비교한다.

### runtime role ACL은 additive current-table/default-ACL migration으로 준비한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/operations/production-migrations.md`, `PROD-724`, `PROD-780`
- Status: Active
- Context / Problem: 새 runtime principal이 기존 application table을 사용하려면 현재 object ACL과 future table default ACL이 필요하지만, legacy role ACL을 변경해서는 안 된다.
- Decision Outcome: 기존 migration runner의 `kosmo_migration` → `SET ROLE kosmo` owner 경계에서 `kosmo_runtime`에 `public` schema `USAGE`, migration 적용 시점의 `public` table `SELECT`·`INSERT`·`UPDATE`·`DELETE`, `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public`의 같은 table CRUD를 additive하게 부여한다. role이 아직 없으면 grant가 즉시 실패하고 wave 2 workload 전환을 차단한다. 기존 `kosmo_api`·`kosmo_worker` ACL/default ACL, sequence와 `drizzle` history boundary는 변경하지 않는다.
- Alternatives Considered: immutable migration 또는 migration Job의 영구 polling, 별도 Argo custom health/추가 rollout PR, `GRANT ALL PRIVILEGES`, role별 table allowlist, sequence/history grant, legacy ACL 재작성과 application migration 안에서 role 생성은 선택하지 않는다.
- Consequences: DatabaseRole reconcile이 늦으면 해당 sync의 migration은 즉시 실패할 수 있으며 재시도가 필요하다. 실패한 migration transaction은 부분 grant를 남기지 않고, wave 2 workload 전환도 실행되지 않는다. role attribute/credential과 실제 role/password reconcile은 CNPG/VSO가 계속 담당한다.
- Confirmation / Follow-up: full replay 후 runtime current-table ACL/default ACL, owner, 금지 DDL/ownership/regrant와 representative CRUD를 확인한다.

### runtime Secret rotation은 네 application workload만 재시작한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: 새 runtime password가 갱신될 때 모든 application consumer가 새 Secret을 받아야 하지만 migration/queue credential은 별도 lifecycle이다.
- Decision Outcome: release-derived runtime Vault/VSO Secret 변경 target은 API Rollout, Web Rollout, Temporal Worker Deployment와 Fedify consumer Deployment다. application consumer 전환 뒤 legacy API/Worker Secret의 application restart target 연결은 제거하지만 Secret provisioning 자체는 유지한다. migration Job과 Fedify MessageQueue 전용 consumer는 target에서 제외한다.
- Alternatives Considered: worker-only restart 또는 queue/migration까지 공통 Secret을 재사용하는 방식은 application/transport ownership을 깨므로 선택하지 않는다.
- Consequences: 네 workload는 같은 runtime Secret의 `password` ref를 사용하고, 더 이상 소비되지 않는 legacy Secret 회전으로 불필요하게 재시작되지 않는다. queue/migration Secret rotation은 각 contract에 남는다. workload rollback은 이전 release manifest가 legacy SecretRef와 restart target 연결을 함께 복원한다.
- Confirmation / Follow-up: Helm render에서 target kind/name과 SecretRef를 비민감하게 비교한다.

### migration·queue·Pooler와 application policy 경계를 보존한다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, `PROD-780`
- Status: Active
- Context / Problem: runtime identity 도입이 owner migration, queue transport, Pooler 또는 application behavior까지 확장되면 별도 lifecycle과 정책 경계가 깨진다.
- Decision Outcome: migration은 기존 `kosmo_migration`/`SET ROLE kosmo`, queue는 `kosmo_fedify_queue` 전용 database/role/credential, Pooler resource는 그대로 유지한다. GraphQL/application policy, hidden/deleted Post owner cleanup, `UPDATE ... RETURNING`/`DELETE ... RETURNING`, Notification cleanup, viewer-independent Reaction count와 Worker/Fedify/Temporal behavior도 변경하지 않는다.
- Alternatives Considered: runtime Secret을 migration/queue에 재사용하거나 RLS/operation session/actor GUC를 재도입하는 방식은 선택하지 않는다.
- Consequences: source, principal, policy 회귀 evidence를 각각 분리해 기록한다.
- Confirmation / Follow-up: combined render와 관련 regression에서 분리·보존 계약을 확인한다.

### implementation과 production lifecycle은 분리한다

- Decision Date: 2026-08-17
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/operations/production-migrations.md`, `PROD-780`, `PROD-781`, `PROD-782`, `PROD-712`
- Status: Active
- Context / Problem: role/Secret transition과 production apply, legacy cleanup, owner retirement는 서로 다른 승인과 rollback 조건을 가진다.
- Decision Outcome: PROD-780은 code/CI, non-production role/catalog evidence, runtime workload transition과 적용되는 spec sync/archive만 소유한다. production preflight/sync/apply/cutover/live는 별도 승인 대상이며, `kosmo_api` cleanup은 PROD-781, `kosmo_worker` cleanup은 PROD-782, owner credential/`NOLOGIN`은 PROD-712가 소유한다.
- Alternatives Considered: merge/strict validation을 production 승인이나 후속 role removal 완료로 해석하는 방식은 선택하지 않는다.
- Consequences: completion report는 code/CI/non-production/production-not-run evidence를 분리한다.
- Confirmation / Follow-up: PR과 Linear evidence에 production 미실행과 후속 ownership을 명시한다.

### historical RLS 목표는 재활성화하지 않는다

- Decision Date: 2026-08-17
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`
- Status: Active
- Context / Problem: canceled `PROD-707`/`PROD-767`과 completed `PROD-713`의 GraphQL RLS 목표가 새 runtime role의 권한 범위와 혼동될 수 있다.
- Decision Outcome: 이 change는 RLS policy·actor helper·GraphQL coverage를 만들거나 재개하지 않는다. `kosmo_runtime`는 `NOBYPASSRLS`이지만 application visibility/owner policy는 기존 application 계층 계약으로 보존한다.
- Alternatives Considered: 새 role에 RLS policy를 연결하거나 historical GraphQL RLS gate를 다시 여는 방식은 ADR 0024와 PROD-780 범위를 벗어나므로 선택하지 않는다.
- Consequences: role attribute와 object ACL을 검증하되, 이를 GraphQL 정책 변경으로 해석하지 않는다.
- Confirmation / Follow-up: diff에 policy/helper/operation session 변경이 없는지 확인한다.

## Remaining Decisions

없음. runtime role identity, additive ACL migration, consumer source, legacy retention, verification과 production boundary가 최신 PROD-780 Issue Gate에서 확정되었다.

## Superseded Decisions

- 2026-08-16 초안의 “retained `kosmo_worker`를 API·Web·Worker·Fedify shared application principal로 사용한다” 결정은 2026-08-17 최신 PROD-780 Issue Gate에서 `kosmo_runtime` 신규 principal 결정으로 대체되었다. 기존 `kosmo_worker` role·ACL·default ACL·Secret provisioning은 PROD-782까지 유지한다.
- 2026-08-16 초안의 “application workload consumer와 provisioning을 함께 정리하지 않고 `kosmo_worker`로 전환한다” 결정은 source target만 `kosmo_runtime`로 대체되었다. `kosmo_api` provisioning 보존과 legacy cleanup 금지는 유지된다.
- historical `PROD-715`의 API/Fedify owner source·Web/Worker `kosmo_worker` source split은 `kosmo_runtime` standard PG\* source로 대체된다.
- historical `PROD-369`/`grant-runtime-postgres-application-object-privileges`의 `kosmo_worker BYPASSRLS` workload target 전제는 `kosmo_runtime NOBYPASSRLS` application target으로 대체된다. Legacy `kosmo_worker`의 `BYPASSRLS` attribute와 ACL/default ACL 자체는 PROD-782까지 유지된다.
- canceled `PROD-707`/`PROD-767`의 전체 GraphQL RLS coverage와 completed `PROD-713`의 historical Post slice는 현재 target authority가 아니다.
