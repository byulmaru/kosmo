# workload-postgres-credential-selection Specification

## Purpose

TBD - created by archiving change add-workload-postgres-credential-selection. Update Purpose after archive.

## Requirements

### Requirement: API credential source는 API Rollout과 Web BFF가 공유한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. API, Web, Temporal Worker와 Fedify consumer application DB는 하나의 retained `kosmo_worker` PostgreSQL source를 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD`로 사용해야 한다(MUST). `kosmo_api` 또는 owner `kosmo` application credential source를 workload에 소비시키거나 서로 다른 application runtime source를 만들어서는 안 된다(MUST NOT).

#### Scenario: shared application source 선택

- **WHEN** API, Web, Worker와 Fedify consumer manifest를 유효한 immutable release image로 렌더한다
- **THEN** 각 workload의 process-wide application DB env는 같은 direct read-write Service, `PGPORT=5432`, `PGUSER=kosmo_worker`, `PGDATABASE=kosmo`와 같은 release Worker Secret `password` ref를 사용해야 한다
- **AND** process-wide application DB에는 `DATABASE_URL`, `DATABASE_PASSWORD`, API custom selector, `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*` fallback이 없어야 한다

#### Scenario: owner·API source 비소비

- **WHEN** 기존 API selector, owner application Secret 또는 `kosmo_api` Secret 설정이 values와 rendered manifest에 남아 있는지 검사한다
- **THEN** 이를 application runtime source로 해석하거나 workload에 투영하지 않아야 한다
- **AND** migration owner와 Fedify MessageQueue 전용 source만 각자의 별도 경계를 유지해야 한다

### Requirement: 각 역할 selector는 additive atomic trio다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. application runtime의 API/Fedify/Worker URL·password selector trio와 partial/complete source validation은 제거해야 한다(MUST NOT). 모든 application workload는 chart-derived shared `kosmo_worker` PG\* source를 사용해야 한다(MUST).

#### Scenario: legacy selector 설정 비소비

- **WHEN** API 또는 Fedify selector의 URL·Secret name·key 중 일부 또는 전체를 설정한다
- **THEN** Helm/runtime은 해당 selector를 application DB source로 해석하거나 owner와 custom 값을 혼합하지 않아야 한다
- **AND** 지원되는 application source는 shared Worker PG\* source여야 한다

#### Scenario: 표준 source의 단일 경계

- **WHEN** selector 없이 application manifest를 렌더한다
- **THEN** API, Web, Worker와 Fedify consumer가 같은 release-derived Worker Secret의 `PGPASSWORD` ref를 가져야 한다
- **AND** queue와 migration credential은 이 source 선택에 영향을 받지 않아야 한다

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-564` — 시스템은 `migration` runtime 역할을 API/Fedify selector와 별도 설정 경계로 유지해야 한다(MUST). Runtime selector는 migration credential, role transition 또는 실행 순서를 암묵적으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: runtime 입력만 변경

- **WHEN** API 또는 Fedify trio를 opt-in하고 migration 설정을 변경하지 않는다
- **THEN** dev migration owner fallback과 production `kosmo_migration` login/Secret 및 `SET ROLE kosmo` 계약은 그대로 유지된다

#### Scenario: migration render 불변

- **WHEN** API-only, Fedify-only, 양쪽 활성화와 각 selector rollback의 dev/prod migration Job을 비교한다
- **THEN** 각 migration document의 env, Secret ref, `DATABASE_MIGRATION_ROLE`과 role transition이 baseline과 byte-identical하다

### Requirement: Fedify consumer는 shared application source를 사용하고 queue source와 분리한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. Fedify consumer가 domain application DB를 사용하는 경우 API·Web·Worker와 같은 `kosmo_worker` process-wide PG\* source를 사용해야 한다(MUST). Fedify MessageQueue transport의 전용 URL/password와 `kosmo_fedify_queue` database/role은 application source와 분리해야 한다(MUST).

#### Scenario: Fedify consumer와 queue source 분리

- **WHEN** Fedify consumer와 MessageQueue manifest를 함께 렌더한다
- **THEN** domain application DB consumer는 shared `kosmo_worker` PG\* source를 사용해야 한다
- **AND** `FEDIFY_QUEUE_DATABASE_URL`/password는 전용 `kosmo_fedify_queue` database/role source를 유지해야 하며 application PG source로 fallback해서는 안 된다

#### Scenario: legacy Fedify application selector 비소비

- **WHEN** historical `postgres.credentials.fedify`, `FEDIFY_DATABASE_*` 또는 owner/API application source를 설정한다
- **THEN** runtime은 이를 shared application source나 queue source로 재해석하지 않아야 한다
- **AND** 명시된 standard PG\* source와 전용 queue source 외의 implicit fallback을 만들지 않아야 한다
