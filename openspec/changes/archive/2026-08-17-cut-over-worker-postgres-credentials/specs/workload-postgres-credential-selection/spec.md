> **Superseded runtime source (2026-08-16, PROD-780):** 이 delta의 API/Fedify owner source와 API Worker Secret 비주입 요구는 `unify-application-runtime-postgres-role`이 대체한다. 현재 계약은 API/Web/Temporal Worker/Fedify consumer가 같은 `kosmo_worker LOGIN NOBYPASSRLS` 표준 PG\* source를 사용하며, migration owner와 Fedify MessageQueue source만 분리하는 것이다. 아래 내용은 PROD-715 당시 계약과 검증 이력이다.

## MODIFIED Requirements

### Requirement: process-wide application DB는 표준 PG source를 사용한다

**Authority / Provenance:** Linear `PROD-715`, user decision — process-wide application DB는 workload별로 chart가 생성한 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source를 사용해야 한다(MUST). API, Fedify consumer와 dev migration은 owner `kosmo`, Web과 Temporal Worker는 `kosmo_worker`를 사용해야 한다(MUST). process-wide 기본 DB에 `DATABASE_URL`/`DATABASE_PASSWORD`, URL/password selector, 완전성 flag 또는 fallback을 추가해서는 안 된다(MUST NOT).

#### Scenario: API와 Fedify consumer owner source

- **WHEN** API 또는 Fedify consumer의 process-wide 기본 DB manifest를 렌더한다
- **THEN** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 기존 owner application Secret의 `password` key를 참조한다
- **AND** Worker Secret, `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 투영하지 않는다
- **AND** process-wide 기본 DB source에는 `DATABASE_URL`/`DATABASE_PASSWORD`와 `hasComplete...` 또는 URL fallback branch가 없다

#### Scenario: Web과 Temporal Worker Worker source

- **WHEN** Web과 Temporal Worker manifest를 유효한 immutable release image로 렌더한다
- **THEN** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo_worker`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 같은 release의 Worker Secret `password` key를 참조한다
- **AND** Web/Worker에 `DATABASE_URL`/`DATABASE_PASSWORD`, `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 투영하지 않는다

### Requirement: API process와 GraphQL은 같은 표준 PG source를 사용한다

**Authority / Provenance:** Linear `PROD-715`, `PROD-779` — API process-wide 기본 DB와 GraphQL Query/Mutation은 owner `kosmo` 표준 PG source를 공유해야 한다(MUST). GraphQL operation별 database client나 `OPERATION_DATABASE_URL`을 만들거나 API에 Worker credential을 노출해서는 안 된다(MUST NOT).

#### Scenario: API와 GraphQL shared source

- **WHEN** API Rollout과 GraphQL application SQL source를 함께 렌더한다
- **THEN** API process-wide env는 owner `PGHOST`/`PGPORT`/`PGUSER=kosmo`/`PGDATABASE=kosmo`/`PGPASSWORD` source를 사용한다
- **AND** GraphQL Query/Mutation은 같은 process shared DB source를 사용한다
- **AND** `OPERATION_DATABASE_URL`이나 operation별 database client를 만들지 않는다
- **AND** 기존 Pooler resource와 API Worker Secret 비주입 경계는 유지한다

### Requirement: migration은 process-wide 기본 source와 독립된 role 경계를 유지한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-715` — runtime workload source 변경은 migration credential, role transition 또는 실행 순서를 바꾸어서는 안 된다(MUST).

#### Scenario: dev migration owner source

- **WHEN** dev migration Job을 렌더한다
- **THEN** Job은 기존 direct read-write Service의 표준 `PGHOST`/`PGPORT`/`PGUSER=kosmo`/`PGDATABASE=kosmo`/`PGPASSWORD` source를 사용한다
- **AND** process-wide `DATABASE_URL`/`DATABASE_PASSWORD` fallback을 사용하지 않는다

#### Scenario: production migration role transition

- **WHEN** production migration Job을 렌더한다
- **THEN** `kosmo_migration` login Secret과 direct endpoint를 사용한다
- **AND** migration command가 `SET ROLE kosmo`로 application schema 권한 경계를 유지한다

### Requirement: 항상 렌더되는 Worker와 queue secondary source를 보존한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-448`, `PROD-715`, `PROD-722` — Worker credential wiring과 MessageQueue 전용 database/role은 process-wide source 단순화와 독립적으로 유지해야 한다(MUST). Worker resource는 유효한 release image에서 항상 render되어야 하며 activation key가 존재 여부를 제어해서는 안 된다(MUST NOT).

#### Scenario: Worker credential wiring 상시 렌더

- **WHEN** 유효한 immutable release image로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment가 존재한다
- **AND** Web은 chart가 생성한 `kosmo_worker` direct source를 계속 사용한다
- **AND** Web Rollout은 `worker-database` Secret 변경 시 재시작 대상으로 유지된다
- **AND** Worker Deployment restart target이 렌더된다

#### Scenario: 과거 activation 값은 무시됨

- **WHEN** 과거 workload 또는 Worker activation 값을 추가한 채 유효한 immutable release image로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment가 존재한다
- **AND** Web과 Worker Deployment가 chart가 생성한 `kosmo_worker` direct source를 사용한다
- **AND** Web Rollout과 Worker Deployment가 `worker-database` Secret 변경 시 재시작 대상으로 렌더된다

#### Scenario: MessageQueue database 분리

- **WHEN** Worker source와 Fedify MessageQueue runtime을 함께 렌더한다
- **THEN** `FEDIFY_QUEUE_DATABASE_URL`/password는 별도 `kosmo_fedify_queue` database/role source를 유지한다
- **AND** Worker 또는 owner process-wide `PGPASSWORD`를 queue credential로 재사용하지 않는다

### Requirement: Worker source는 독립적으로 rollback한다

**Authority / Provenance:** Linear `PROD-715`, `PROD-779` — 시스템은 전체 PROD-715 merge/squash revision을 Git revert해 Web/enabled Worker manifest와 기본 DB source를 pre-PROD-715 상태로 되돌릴 수 있어야 한다(MUST). API process/GraphQL source, migration과 queue source를 함께 바꾸거나 인증 실패 중 owner로 자동 재시도해서는 안 된다(MUST NOT).

#### Scenario: Worker source rollback

- **WHEN** 전체 PROD-715 merge/squash revision을 Git revert한다
- **THEN** Web의 기본 DB env와 Worker resource/source는 pre-PROD-715 manifest로 돌아간다
- **AND** API process/GraphQL connection, migration과 queue database는 바뀌지 않는다

## REMOVED Requirements

### Requirement: API custom credential selector trio

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** process-wide application DB source를 표준 PG 환경변수 하나로 통일했으므로 사용되지 않는 `postgres.credentials.api.databaseUrl`, `passwordSecret.name`, `passwordSecret.key` selector와 partial/complete validation은 불필요한 URL escaping·source precedence 상태를 만든다.

**Migration:** API process-wide 기본 DB와 GraphQL은 chart가 생성한 owner `kosmo` 표준 PG env를 공유한다. `OPERATION_DATABASE_URL`은 PROD-779에서 제거됐고, queue URL/password와 migration role 경계는 변경하지 않는다. 기존 custom trio를 values에 설정해도 해석하거나 fallback하지 않는다.

#### Scenario: custom API trio 비소비

- **WHEN** `postgres.credentials.api` custom URL/password trio를 설정한다
- **THEN** chart와 runtime은 이를 process-wide 기본 DB source로 해석하지 않는다
- **AND** 지원되는 application source는 owner 표준 PG env뿐이며 MessageQueue secondary source는 별도 경계로 남는다

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** `fedify`는 Temporal Worker DB Activity까지 포함하는 trusted 실행 역할을 나타내지 못한다.

**Migration:** `fedify`와 historical `worker` selector를 모두 제거하고 Web과 enabled Worker process 기본 DB를 chart-derived 표준 PG env Worker source로 고정한다. API/Fedify consumer/dev migration process-wide source도 각각 owner 표준 PG env로 고정하며 production 미소비 내부 env이므로 alias나 dual-read 기간을 두지 않는다.

#### Scenario: legacy Fedify selector 비소비

- **WHEN** migration 이후 `postgres.credentials.fedify` 또는 `FEDIFY_DATABASE_*`를 설정한다
- **THEN** chart/runtime은 이를 Worker 또는 owner process-wide source로 해석하거나 `WORKER_DATABASE_*`로 투영하지 않는다
