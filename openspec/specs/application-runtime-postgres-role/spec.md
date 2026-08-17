# application-runtime-postgres-role Specification

## Purpose

API, Web, Temporal Worker와 Fedify application consumer가 공유하는 `kosmo_runtime` PostgreSQL principal과 additive application ACL, workload·migration·queue 경계를 정의한다. Legacy role과 Secret provisioning은 후속 rollback contract까지 보존하며, production credential cutover와 legacy contract 제거는 이 specification의 범위가 아니다.

## Requirements

### Requirement: application runtime은 `kosmo_runtime` shared non-owner principal을 사용한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. API, Web, Temporal Worker와 Fedify consumer의 application DB runtime은 새 `kosmo_runtime` 하나를 shared non-owner PostgreSQL principal로 사용해야 한다(MUST). `kosmo_runtime`는 `LOGIN`과 `NOBYPASSRLS`를 가져야 하며(MUST), schema/table owner, migration owner 또는 Fedify MessageQueue owner가 되어서는 안 된다(MUST NOT).

#### Scenario: 모든 application workload의 표준 PG source

- **WHEN** 유효한 immutable release image로 API, Web, Worker와 Fedify consumer manifest를 렌더한다
- **THEN** 각 application DB connection의 `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, `PGPASSWORD` source가 같은 release의 `kosmo_runtime` credential을 참조한다
- **AND** process-wide DB source에 `DATABASE_URL`, `DATABASE_PASSWORD`, 역할별 URL selector 또는 fallback branch가 없어야 한다
- **AND** GraphQL operation DB session, actor GUC와 `OPERATION_DATABASE_URL`을 다시 만들지 않는다

#### Scenario: runtime role의 attribute

- **WHEN** 비운영 PostgreSQL catalog에서 application runtime role을 검사한다
- **THEN** `current_user`는 `kosmo_runtime`이고 `rolcanlogin`은 true여야 한다
- **AND** `rolbypassrls`는 false여야 하며 application object owner, `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`과 role membership을 가지지 않아야 한다

### Requirement: runtime principal은 현재 table과 future table의 application CRUD ACL을 additive하게 가진다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `PROD-724`, `PROD-780`. migration은 owner `kosmo` 경계에서 `kosmo_runtime`에 `public` schema `USAGE`, migration 적용 시점의 `public` application table 전체 `SELECT`, `INSERT`, `UPDATE`, `DELETE`, 그리고 `ALTER DEFAULT PRIVILEGES FOR ROLE kosmo IN SCHEMA public`의 같은 table CRUD를 부여해야 한다(MUST). 이 grant는 기존 `kosmo_api`·`kosmo_worker` ACL/default ACL을 대체하거나 제거해서는 안 된다(MUST NOT).

#### Scenario: current application table CRUD

- **WHEN** disposable database에 role fixture를 준비하고 모든 migration을 replay한다
- **THEN** `kosmo_runtime`은 `public` schema `USAGE`와 migration 시점의 모든 `public` application table에 `SELECT`, `INSERT`, `UPDATE`, `DELETE`를 가져야 한다
- **AND** application object owner는 계속 `kosmo`여야 하고 grant option, `TRUNCATE`, `REFERENCES`, `TRIGGER`, DDL과 ownership 권한은 없어야 한다

#### Scenario: runtime role 부재 시 fail-fast

- **WHEN** ACL migration이 시작됐지만 CNPG가 `kosmo_runtime` role을 아직 생성하지 않았다
- **THEN** migration과 migration Job은 role readiness를 polling하거나 role을 직접 생성하지 않아야 한다
- **AND** grant가 즉시 실패해 부분 ACL과 wave 2 application workload 전환을 남기지 않아야 한다

#### Scenario: owner future table default ACL

- **WHEN** owner `kosmo`가 `public`에 application table을 추가한다
- **THEN** 새 table에 `kosmo_runtime`의 `SELECT`, `INSERT`, `UPDATE`, `DELETE`가 default ACL로 부여되어야 한다
- **AND** 다른 owner, 다른 schema, sequence와 `drizzle` migration history에는 이 requirement의 grant가 적용되어서는 안 된다

#### Scenario: legacy ACL과 role lifecycle 보존

- **WHEN** runtime ACL migration과 role provisioning diff를 검토한다
- **THEN** `kosmo_api` role·ACL·default ACL·Secret provisioning은 PROD-781까지, `kosmo_worker` role·ACL·default ACL·Secret provisioning은 PROD-782까지 유지되어야 한다
- **AND** 이 change에는 legacy ACL revoke/drop, role/Secret provisioning removal 또는 contract SQL이 없어야 한다

### Requirement: application workload의 owner·legacy credential consumer를 제거한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`, `PROD-781`, `PROD-782`. application workload configuration과 consumer는 owner `kosmo`, `kosmo_api` 또는 `kosmo_worker` role·Secret SecretRef와 API/Worker 전용 application credential selector를 소비해서는 안 된다(MUST NOT). workload consumer 전환과 role/Secret provisioning 존속은 별도 contract다.

#### Scenario: runtime consumer 선택

- **WHEN** dev/prod Helm values와 rendered workload manifest를 검토한다
- **THEN** API/Web/Worker/Fedify application workload의 `SecretRef`, `PGUSER` source와 process-wide PG\* source는 `kosmo_runtime`를 참조해야 한다
- **AND** API/Worker legacy DatabaseRole·Vault/CNPG Secret·existing ACL provisioning은 나타날 수 있지만 application workload consumer가 되어서는 안 된다

#### Scenario: production lifecycle 경계

- **WHEN** repo artifact, 구현 PR과 non-production 검증 결과를 검토한다
- **THEN** production Secret sync/apply/cutover와 live query를 실행하거나 완료 evidence로 주장해서는 안 된다
- **AND** `kosmo_api` legacy contract 제거는 PROD-781, `kosmo_worker` legacy contract 제거는 PROD-782, owner `kosmo` credential/`NOLOGIN`은 PROD-712가 별도 승인과 lifecycle을 소유해야 한다

### Requirement: migration·queue·Pooler와 application behavior 경계를 보존한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `docs/operations/postgres-session-pool.md`, `PROD-780`. shared application runtime role 전환은 기존 `kosmo_migration` → `SET ROLE kosmo` owner 경계, Fedify MessageQueue 전용 database/role/credential, 기존 Pooler resource를 변경해서는 안 된다(MUST NOT). GraphQL/application policy, Worker/Fedify/Temporal 기능과 Post owner cleanup·`deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload·Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`·Notification cleanup·Reaction count 계약도 변경해서는 안 된다(MUST NOT).

#### Scenario: migration과 queue source 분리

- **WHEN** application workload, migration Job과 Fedify MessageQueue manifest를 함께 렌더한다
- **THEN** migration은 기존 migration credential과 owner role transition을 유지해야 한다
- **AND** queue는 `kosmo_fedify_queue` 전용 database/role/credential을 유지하고 `kosmo_runtime` application credential을 재사용하지 않아야 한다

#### Scenario: Pooler와 application behavior 보존

- **WHEN** runtime role 전환의 diff와 회귀 검증을 검토한다
- **THEN** 기존 Pooler resource는 삭제·변경되지 않아야 하고 GraphQL application traffic은 target architecture의 shared DB 경계를 사용해야 한다
- **AND** GraphQL schema·application visibility/owner policy·Worker/Fedify/Temporal 동작과 hidden/deleted Post owner cleanup, `deletePost` Active→Tombstone `UPDATE ... RETURNING` 결과/기존 payload, Bookmark/Reaction 등 physical delete mutation의 `DELETE ... RETURNING`, Notification cleanup 및 viewer-independent Reaction count는 기존과 같아야 한다

### Requirement: runtime role 전환은 비운영 증거로 검증하고 production 승인과 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. 구현은 정적 Helm render와 disposable/non-production role-level catalog·대표 DML 검증으로 `kosmo_runtime` principal, additive ACL, 기존 legacy provisioning과 분리 경계를 증명해야 한다(MUST). CI, OpenSpec strict validation, PR merge와 비운영 검증은 production preflight/sync/apply/cutover/live 승인 또는 PROD-781/PROD-782 contract 완료로 해석해서는 안 된다(MUST NOT).

#### Scenario: 비운영 role-level 검증

- **WHEN** 정확한 비운영 revision에서 API, Web, Worker와 Fedify consumer의 DB 연결 및 catalog를 검사한다
- **THEN** 각 application DB runtime의 `current_user`가 `kosmo_runtime`이고 `rolbypassrls=false`이며 schema/table owner가 아님을 확인해야 한다
- **AND** runtime current-table/default ACL, migration owner와 queue role의 분리 및 `kosmo_api`·`kosmo_worker` legacy provisioning 보존을 확인해야 한다

#### Scenario: production 실행 금지

- **WHEN** OpenSpec artifacts와 구현 PR이 review-ready 상태가 된다
- **THEN** runtime role/ACL/workload transition과 non-production 검증은 준비할 수 있지만 production Secret sync/apply/cutover/live 검증과 legacy role contract removal은 이 change에서 수행하지 않아야 한다
- **AND** 후속 issue의 별도 승인 전에는 운영 DB에 Secret/role mutation을 실행할 수 없다
