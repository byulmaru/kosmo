# workload-postgres-credential-selection Specification

## Purpose

API, Web, Worker와 Fedify application workload가 chart-derived `kosmo_runtime` 표준 PG\* source를 선택하고, migration·queue credential과 분리하는 계약을 정의한다. Legacy role·Secret provisioning은 후속 rollback contract까지 보존하며 workload consumer와 혼동하지 않는다.

## Requirements

### Requirement: API·Web·Worker·Fedify application DB source는 `kosmo_runtime`를 공유한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. API, Web, Temporal Worker와 Fedify consumer application DB는 하나의 새 `kosmo_runtime` PostgreSQL source를 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`로 사용해야 한다(MUST). `kosmo_api`, `kosmo_worker` 또는 owner `kosmo` application credential source를 workload에 소비시키거나 서로 다른 application runtime source를 만들어서는 안 된다(MUST NOT). Legacy role·Secret provisioning의 존속은 별도 lifecycle contract다.

#### Scenario: shared runtime source 선택

- **WHEN** API, Web, Worker와 Fedify consumer manifest를 유효한 immutable release image로 렌더한다
- **THEN** 각 workload의 process-wide application DB env는 같은 direct read-write Service, `PGPORT=5432`, `PGUSER=kosmo_runtime`, `PGDATABASE=kosmo`와 같은 release runtime Secret `password` ref를 사용해야 한다
- **AND** process-wide application DB에는 `DATABASE_URL`, `DATABASE_PASSWORD`, API/Worker/Fedify custom selector 또는 owner fallback이 없어야 한다

#### Scenario: legacy provisioning과 consumer를 구분함

- **WHEN** 기존 API/Worker DatabaseRole, Secret, ACL/default ACL 설정이 values와 rendered manifest에 남아 있는지 검사한다
- **THEN** 해당 provisioning은 후속 rollback window까지 보존되어야 하지만 application workload의 runtime source로 해석되거나 투영되지 않아야 한다
- **AND** migration owner와 Fedify MessageQueue 전용 source만 각자의 별도 경계를 유지해야 한다

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-564` — 시스템은 `migration` runtime 역할을 API/Fedify selector와 별도 설정 경계로 유지해야 한다(MUST). Runtime selector는 migration credential, role transition 또는 실행 순서를 암묵적으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: runtime 입력만 변경

- **WHEN** API 또는 Fedify trio를 opt-in하고 migration 설정을 변경하지 않는다
- **THEN** dev migration owner fallback과 production `kosmo_migration` login/Secret 및 `SET ROLE kosmo` 계약은 그대로 유지된다

#### Scenario: migration render 불변

- **WHEN** API-only, Fedify-only, 양쪽 활성화와 각 selector rollback의 dev/prod migration Job을 비교한다
- **THEN** 각 migration document의 env, Secret ref, `DATABASE_MIGRATION_ROLE`과 role transition이 baseline과 byte-identical하다

### Requirement: Fedify consumer는 runtime application source와 queue source를 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. Fedify consumer가 domain application DB를 사용하는 경우 API·Web·Worker와 같은 `kosmo_runtime` process-wide PG\* source를 사용해야 한다(MUST). Fedify MessageQueue transport의 전용 URL/password와 `kosmo_fedify_queue` database/role은 application source와 분리해야 한다(MUST).

#### Scenario: Fedify consumer와 queue source 분리

- **WHEN** Fedify consumer와 MessageQueue manifest를 함께 렌더한다
- **THEN** domain application DB consumer는 runtime `kosmo_runtime` PG\* source를 사용해야 한다
- **AND** `FEDIFY_QUEUE_DATABASE_URL`/password는 전용 `kosmo_fedify_queue` database/role source를 유지해야 하며 application PG source로 fallback해서는 안 된다

#### Scenario: legacy Fedify application selector 비소비

- **WHEN** historical `postgres.credentials.fedify`, `FEDIFY_DATABASE_*` 또는 owner/API/Worker application source를 설정한다
- **THEN** runtime은 이를 shared application source나 queue source로 재해석하지 않아야 한다
- **AND** 명시된 standard runtime PG\* source와 전용 queue source 외의 implicit fallback을 만들지 않아야 한다

### Requirement: selector는 runtime source를 대체하지 않는다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. application runtime의 API/Fedify/Worker URL·password selector trio와 partial/complete source validation은 process-wide source로 사용해서는 안 된다(MUST NOT). 모든 application workload는 chart-derived `kosmo_runtime` PG\* source를 사용해야 한다(MUST).

#### Scenario: legacy selector 설정 비소비

- **WHEN** API, Worker 또는 Fedify selector의 URL·Secret name·key 중 일부 또는 전체를 설정한다
- **THEN** Helm/runtime은 해당 selector를 application DB source로 해석하거나 owner/legacy custom 값을 혼합하지 않아야 한다
- **AND** 지원되는 application source는 runtime PG\* source여야 한다

#### Scenario: 표준 source의 단일 경계

- **WHEN** selector 없이 application manifest를 렌더한다
- **THEN** API, Web, Worker와 Fedify consumer가 같은 release-derived runtime Secret의 `PGPASSWORD` ref를 가져야 한다
- **AND** queue와 migration credential은 이 source 선택에 영향을 받지 않아야 한다
