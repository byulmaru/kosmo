# application-runtime-postgres-role Specification

## Purpose

TBD - created by archiving change unify-application-runtime-postgres-role. Update Purpose after archive.

## Requirements

### Requirement: application runtime은 하나의 shared non-owner principal을 사용한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. API, Web, Temporal Worker와 Fedify consumer의 application DB runtime은 retained `kosmo_worker` 하나를 shared non-owner PostgreSQL principal로 사용해야 한다(MUST). `kosmo_worker`는 `LOGIN`과 `NOBYPASSRLS`를 가져야 하며(MUST), schema/table owner, migration owner 또는 Fedify MessageQueue owner가 되어서는 안 된다(MUST NOT).

#### Scenario: 모든 application workload의 표준 PG source

- **WHEN** 유효한 immutable release image로 API, Web, Worker와 Fedify consumer manifest를 렌더한다
- **THEN** 각 application DB connection의 `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` source가 같은 release의 `kosmo_worker` credential을 참조한다
- **AND** process-wide DB source에 `DATABASE_URL`, `DATABASE_PASSWORD`, 역할별 URL selector 또는 fallback branch가 없어야 한다
- **AND** GraphQL operation DB session, actor GUC와 `OPERATION_DATABASE_URL`을 다시 만들지 않는다

#### Scenario: retained runtime role의 attribute

- **WHEN** 비운영 PostgreSQL catalog에서 application runtime role을 검사한다
- **THEN** `current_user`는 `kosmo_worker`이고 `rolcanlogin`은 true여야 한다
- **AND** `rolbypassrls`는 false여야 하며 application object owner, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`과 role membership을 가지지 않아야 한다

### Requirement: application workload의 API·owner credential consumer를 제거한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`, `PROD-781`. application workload configuration과 consumer는 owner `kosmo` 및 `kosmo_api` role·Secret SecretRef와 API 전용 application credential selector를 소비해서는 안 된다(MUST NOT). 기존 `kosmo_api` role·ACL·default ACL·Vault/CNPG Secret provisioning은 rollback window까지 유지해야 하며(MUST), 이 change는 ACL revoke/drop, role/Secret provisioning 제거 또는 contract SQL을 선반영해서는 안 된다(MUST NOT).

#### Scenario: API 전용 consumer 부재

- **WHEN** dev/prod Helm values와 rendered workload manifest를 검토한다
- **THEN** `kosmo_api` DatabaseRole·Vault/CNPG Secret·existing ACL provisioning은 나타날 수 있지만 API/Web/Worker/Fedify application workload의 `SecretRef`, `PGUSER` source와 API 전용 URL/password selector consumer는 나타나지 않아야 한다
- **AND** API는 다른 application workload와 같은 `kosmo_worker` PG\* source를 사용해야 한다

#### Scenario: production lifecycle 경계

- **WHEN** repo artifact, 구현 PR과 non-production 검증 결과를 검토한다
- **THEN** ACL revoke/drop, role/Secret provisioning removal 또는 contract SQL은 이 turn/implementation PR에 포함하지 않으며 production Secret sync/apply/cutover와 live query도 실행하지 않아야 한다
- **AND** `kosmo_api` legacy contract 제거는 production transition·drain·rollback window 뒤 PROD-781이, owner `kosmo` credential/`NOLOGIN`은 PROD-712가 소유해야 한다

### Requirement: migration·queue·Pooler와 application policy 경계를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, `PROD-780`. shared application runtime role 전환은 production migration의 `kosmo_migration` → `SET ROLE kosmo` owner 경계, Fedify MessageQueue 전용 database/role/credential, 기존 Pooler resource를 변경해서는 안 된다(MUST NOT). GraphQL/application policy, Worker/Fedify/Temporal 기능과 Post owner cleanup·`deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload·Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`·Notification cleanup·Reaction count 계약도 변경해서는 안 된다(MUST NOT).

#### Scenario: migration과 queue source 분리

- **WHEN** application workload, migration Job과 Fedify MessageQueue manifest를 함께 렌더한다
- **THEN** migration은 기존 migration credential과 owner role transition을 유지해야 한다
- **AND** queue는 `kosmo_fedify_queue` 전용 database/role/credential을 유지하고 `kosmo_worker` application credential을 재사용하지 않아야 한다

#### Scenario: Pooler와 application behavior 보존

- **WHEN** shared role 전환의 diff와 회귀 검증을 검토한다
- **THEN** 기존 Pooler resource는 삭제·변경되지 않아야 하고 GraphQL application traffic은 target architecture의 shared DB 경계를 사용해야 한다
- **AND** GraphQL schema·application visibility/owner policy·Worker/Fedify/Temporal 동작과 hidden/deleted Post owner cleanup, `deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup 및 viewer-independent Reaction count는 기존과 같아야 한다

### Requirement: role 통합은 비운영 증거로 검증하고 production 승인과 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. 구현은 정적 Helm render와 disposable/non-production role-level catalog·대표 DML 검증으로 shared principal, 기존 object ACL과 분리 경계를 증명해야 한다(MUST). CI, OpenSpec strict validation, PR merge와 비운영 검증은 production preflight/sync/apply/cutover/live 승인 또는 PROD-781 contract 완료로 해석해서는 안 된다(MUST NOT).

#### Scenario: 비운영 role-level 검증

- **WHEN** 정확한 비운영 revision에서 API, Web, Worker와 Fedify consumer의 DB 연결 및 catalog를 검사한다
- **THEN** 각 application DB runtime의 `current_user`가 `kosmo_worker`이고 `rolbypassrls=false`이며 schema/table owner가 아님을 확인해야 한다
- **AND** existing application object ACL, migration owner와 queue role의 분리가 확인되어야 하며 ACL/default ACL/role/Secret provisioning은 보존되어야 한다

#### Scenario: production 실행 금지

- **WHEN** OpenSpec artifacts와 구현 PR이 review-ready 상태가 된다
- **THEN** runtime PG\* transition·workload consumer removal·non-production 검증은 준비할 수 있지만 ACL/default ACL/role/Secret contract migration과 production Secret sync/apply, credential cutover/live 검증은 이 turn/implementation PR에서 수행하지 않아야 한다
- **AND** `PROD-781` production release preflight·drain·rollback window와 별도 명시 승인 후에만 legacy contract 실행을 시작할 수 있다
