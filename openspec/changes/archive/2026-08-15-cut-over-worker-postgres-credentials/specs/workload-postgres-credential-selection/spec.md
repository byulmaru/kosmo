## ADDED Requirements

### Requirement: process-wide application DB는 표준 PG source를 사용한다

**Authority / Provenance:** Linear `PROD-715`, user decision — process-wide application DB는 workload별로 chart가 생성한 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source를 사용해야 한다(MUST). API, Fedify consumer와 dev migration은 owner `kosmo`, Web과 enabled Temporal Worker는 `kosmo_worker`를 사용해야 한다(MUST). process-wide 기본 DB에 `DATABASE_URL`/`DATABASE_PASSWORD`, URL/password selector, 완전성 flag 또는 fallback을 추가해서는 안 된다(MUST NOT).

#### Scenario: API와 Fedify consumer owner source

- **WHEN** API 또는 Fedify consumer의 process-wide 기본 DB manifest를 렌더한다
- **THEN** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 기존 owner application Secret의 `password` key를 참조한다
- **AND** Worker Secret, `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 투영하지 않는다
- **AND** process-wide 기본 DB source에는 `DATABASE_URL`/`DATABASE_PASSWORD`와 `hasComplete...` 또는 URL fallback branch가 없다

#### Scenario: Web과 Temporal Worker Worker source

- **WHEN** Web 또는 기존 activation gate에서 enabled된 Temporal Worker manifest를 렌더한다
- **THEN** `PGHOST`는 기존 direct read-write Service, `PGPORT`는 `5432`, `PGUSER`는 `kosmo_worker`, `PGDATABASE`는 `kosmo`를 사용한다
- **AND** `PGPASSWORD`는 같은 release의 Worker Secret `password` key를 참조한다
- **AND** Web/Worker에 `DATABASE_URL`/`DATABASE_PASSWORD`, `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 투영하지 않는다

### Requirement: API process source와 GraphQL operation source는 분리한다

**Authority / Provenance:** Linear `PROD-715`, `PROD-716` — API process-wide 기본 DB는 owner `kosmo` 표준 PG source를 사용하고 GraphQL Query/Mutation의 operation connection은 별도 `OPERATION_DATABASE_URL`을 사용해야 한다(MUST). GraphQL operation URL을 process-wide 기본 source로 재사용하거나 API에 Worker credential을 노출해서는 안 된다(MUST NOT).

#### Scenario: API 기본 및 operation source

- **WHEN** API Rollout과 GraphQL operation connection을 함께 렌더한다
- **THEN** API process-wide env는 owner `PGHOST`/`PGPORT`/`PGUSER=kosmo`/`PGDATABASE=kosmo`/`PGPASSWORD` source를 사용한다
- **AND** `OPERATION_DATABASE_URL`은 GraphQL operation 전용 Pooler endpoint를 사용한다
- **AND** operation URL과 process-wide PG env는 서로의 password 또는 selector source를 재사용하지 않는다

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

### Requirement: MessageQueue secondary source를 보존한다

**Authority / Provenance:** Linear `PROD-448`, `PROD-715` — MessageQueue 전용 database/role은 process-wide source 단순화와 독립적으로 유지해야 한다(MUST).

#### Scenario: MessageQueue database 분리

- **WHEN** Worker source와 Fedify MessageQueue runtime을 함께 렌더한다
- **THEN** `FEDIFY_QUEUE_DATABASE_URL`/password는 별도 `kosmo_fedify_queue` database/role source를 유지한다
- **AND** Worker 또는 owner process-wide `PGPASSWORD`를 queue credential로 재사용하지 않는다

### Requirement: Worker source는 독립적으로 rollback한다

**Authority / Provenance:** Linear `PROD-715` — 시스템은 전체 PROD-715 merge/squash revision을 Git revert해 Web/enabled Worker manifest와 기본 DB source를 pre-PROD-715 상태로 되돌릴 수 있어야 한다(MUST). API process/operation source, migration과 queue source를 함께 바꾸거나 인증 실패 중 owner로 자동 재시도해서는 안 된다(MUST NOT).

#### Scenario: Worker source rollback

- **WHEN** 전체 PROD-715 merge/squash revision을 Git revert한다
- **THEN** Web의 기본 DB env와 Worker resource/source는 pre-PROD-715 manifest로 돌아간다
- **AND** API process/operation connection, migration과 queue database는 바뀌지 않는다

## REMOVED Requirements

### Requirement: 기존 runtime 연결과 rendered manifest 보존

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** selector가 비활성일 때 owner URL을 보존하던 과도기 계약은 모든 process-wide workload가 표준 `PG*` source를 사용하는 현재 계약으로 대체됐다.

**Migration:** API/Fedify consumer/dev migration은 owner `kosmo`, Web/enabled Worker는 `kosmo_worker`의 chart-derived 표준 `PG*` source를 사용한다. byte-identical legacy URL manifest나 owner fallback은 지원하지 않는다.

### Requirement: API credential source는 API Rollout과 Web BFF가 공유한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`, `PROD-716`

**Reason:** Web BFF의 비GraphQL trusted 경로는 API RLS principal이 아니라 `kosmo_worker`를 사용하며, API process 기본 DB와 GraphQL operation connection도 서로 다른 경계다.

**Migration:** API process 기본 DB는 owner `kosmo` `PG*`, Web은 `kosmo_worker` `PG*`, GraphQL Query/Mutation은 별도 `OPERATION_DATABASE_URL`을 사용한다. API Rollout에 Worker credential을 주입하지 않는다.

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** `fedify`는 Temporal Worker DB Activity까지 포함하는 trusted 실행 역할을 나타내지 못한다.

**Migration:** `fedify`와 historical `worker` selector를 모두 제거하고 Web과 enabled Worker process 기본 DB를 chart-derived 표준 PG env Worker source로 고정한다. API/Fedify consumer/dev migration process-wide source도 각각 owner 표준 PG env로 고정하며 production 미소비 내부 env이므로 alias나 dual-read 기간을 두지 않는다.

#### Scenario: legacy Fedify selector 비소비

- **WHEN** migration 이후 `postgres.credentials.fedify` 또는 `FEDIFY_DATABASE_*`를 설정한다
- **THEN** chart/runtime은 이를 Worker 또는 owner process-wide source로 해석하거나 `WORKER_DATABASE_*`로 투영하지 않는다

### Requirement: 각 역할 selector는 additive atomic trio다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** URL·Secret name·key의 partial/complete selector 상태는 process 기본 DB를 표준 `PG*` source 하나로 통일한 계약에서 더 이상 존재하지 않는다.

**Migration:** API/Fedify consumer/dev migration과 Web/enabled Worker는 각각 chart가 고정 생성한 `PG*`와 principal별 `PGPASSWORD` SecretKeyRef만 사용한다. legacy custom trio는 해석하거나 fallback하지 않는다.

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-715`

**Reason:** migration의 독립 권한 경계는 유지되지만 URL selector와 owner fallback을 전제로 한 이전 requirement는 표준 `PG*` 입력 계약과 맞지 않는다.

**Migration:** dev migration은 owner `kosmo` 표준 `PG*` source를 사용하고 production은 `kosmo_migration` login에서 `SET ROLE kosmo`로 전환하는 기존 권한 경계를 유지한다.
