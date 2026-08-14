# dev-database-migrations Specification

## Purpose

dev 환경에서 Drizzle SQL migration을 애플리케이션 rollout보다 먼저 단일 실행하고, migration 실패 시 새 workload restart를 차단하는 배포 계약을 정의한다.

## Requirements

### Requirement: Runtime migration command

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Dev에 배포되는 runtime image는 애플리케이션 server 시작과 분리된 명시적 migration command로 image에 포함된 Drizzle SQL migration을 대상 PostgreSQL에 적용해야 한다(MUST). Command는 version control 순서의 각 migration 파일을 독립 transaction으로 실행하고(MUST), 한 파일의 모든 SQL statement와 해당 Drizzle history insert를 같은 transaction에서 함께 commit하거나 rollback해야 한다(MUST). 성공한 앞 파일을 이후 파일의 실패 때문에 rollback해서는 안 되며(MUST NOT), 재실행은 history에 기록된 적용 name을 제외한 미적용 파일을 reader의 version-control 순서로 계속 실행해야 한다(MUST).

#### Scenario: Pending migration 적용

- **WHEN** runtime migration command가 여러 미적용 migration이 있는 dev database를 대상으로 실행된다
- **THEN** 시스템은 migration을 version control 순서대로 파일마다 독립 transaction에서 적용한다
- **AND** 각 파일의 SQL과 history insert를 같은 transaction에서 commit한다
- **AND** 시스템은 기존 domain data를 reset하거나 schema 전체를 재생성하지 않는다

#### Scenario: Enum 추가 다음 파일에서 사용

- **WHEN** 한 pending migration이 기존 PostgreSQL enum에 값을 추가하고 바로 다음 pending migration이 그 값을 사용한다
- **THEN** enum 추가 migration의 SQL과 history를 먼저 commit한다
- **AND** 다음 migration은 별도 transaction에서 commit된 enum 값을 사용할 수 있다

#### Scenario: Pending migration 없는 실행

- **WHEN** runtime migration command가 모든 migration이 적용된 dev database를 대상으로 실행된다
- **THEN** 시스템은 domain schema, data와 migration history를 변경하지 않고 성공한다

#### Scenario: 중간 migration 실패

- **WHEN** 여러 pending migration 중 한 migration 파일의 SQL이 실패한다
- **THEN** migration command는 실패 exit status를 반환한다
- **AND** 실패한 파일의 schema·data 변경과 history insert를 모두 rollback한다
- **AND** 앞에서 성공한 파일의 schema 변경과 history는 함께 남는다
- **AND** 아직 실행하지 않은 뒤 파일은 적용하지 않는다

#### Scenario: 실패 후 재실행

- **WHEN** 중간 migration 실패 원인을 제거하고 같은 migration command를 다시 실행한다
- **THEN** 시스템은 이미 history에 기록된 성공 파일을 다시 실행하지 않는다
- **AND** 이전에 실패한 파일을 포함해 아직 history에 없는 파일을 version control 순서로 적용을 계속한다

### Requirement: Migration 단일 실행

시스템은 PostgreSQL advisory lock을 사용해 같은 database에서 migration runner가 동시에 하나만 migration을 실행하도록 보장해야 한다(MUST).

#### Scenario: Lock 획득 성공

- **WHEN** 실행 중인 다른 migration runner가 없는 상태에서 runner가 시작된다
- **THEN** runner는 migration 전용 advisory lock을 획득한다
- **AND** migration 완료 또는 database session 종료 시 lock을 해제한다

#### Scenario: 동시 runner 거부

- **WHEN** 다른 runner가 migration advisory lock을 보유한 상태에서 새 runner가 시작된다
- **THEN** 새 runner는 lock 해제를 기다리지 않고 migration을 중복 실행하지 않는다
- **AND** 새 runner는 명시적인 실패 exit status를 반환한다

### Requirement: Dev Sync migration Job

dev Helm release는 API 또는 web container의 startup/initContainer와 분리된 단일 Kubernetes Job으로 runtime migration command를 실행해야 한다(MUST).

#### Scenario: Argo full sync의 migration-gated workload 교체

- **WHEN** dev application에 Argo CD full sync가 시작된다
- **THEN** Argo CD는 기반 리소스를 적용한 뒤 migration Job을 `Sync` wave 1 hook으로 실행한다
- **AND** dev workload는 migration Job이 성공한 뒤 wave 2에서 교체된다
- **AND** Job은 dev workload와 같은 `main` image reference를 사용한다
- **AND** Job은 단일 Pod에서 재시작 없이 migration command를 실행한다

#### Scenario: Migration Job 실패

- **WHEN** migration Job이 실패한다
- **THEN** Argo CD sync는 실패한다
- **AND** dev deployment workflow는 API와 web Rollout restart를 실행하지 않는다

### Requirement: Migration-gated dev rollout

Deploy Dev workflow는 Docker Build 성공 후 migration을 포함한 Argo CD full sync를 완료하고, 성공한 경우에만 API와 web Rollout을 restart해야 한다(MUST).

#### Scenario: Migration 성공 후 rollout

- **WHEN** Docker Build가 성공하고 Argo CD full sync와 migration Job이 성공한다
- **THEN** deployment workflow는 `kosmo-api`와 `kosmo-web` Rollout 및 렌더된 background Deployment의 restart를 실행한다

#### Scenario: Dev deploy 직렬 실행

- **WHEN** migration-aware dev deployment가 실행 중인 동안 새 Docker Build가 완료된다
- **THEN** 시스템은 실행 중 deployment를 취소하지 않는다
- **AND** 같은 environment의 migration-aware deployment를 동시에 실행하지 않는다

#### Scenario: Dev downtime 허용

- **WHEN** 기존 workload와 호환되지 않는 migration을 dev에 적용한다
- **THEN** 시스템은 migration과 새 `main` workload restart 사이의 일시적인 dev 오류를 허용한다
- **AND** 시스템은 production 수준의 무중단 호환 또는 rollback 보장을 이 dev workflow에서 제공하지 않는다

### Requirement: Drizzle migration history 호환성과 무결성

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-269`, `PROD-656`. Runtime migration command는 version-controlled Drizzle migration directory의 파일 순서, statement breakpoint, name, timestamp와 hash 및 기존 `drizzle.__drizzle_migrations` history를 호환되게 사용해야 한다(MUST). 실행 전에 DB history의 각 적용 name이 local migration에 존재하고 hash가 일치하는지 검증해야 하며(MUST), DB row 순서가 local migration 순서와 달라도 같은 name/hash 집합이면 유효하게 인식해야 한다(MUST). Local에 없는 history, hash 변경과 중복 name/history를 발견하면 새 SQL을 실행해서는 안 된다(MUST NOT). Pending은 적용된 name을 제외한 local migration을 reader가 제공한 version-control 순서로 선택해야 한다(MUST).

#### Scenario: 기존 Drizzle history에서 계속 실행

- **WHEN** database에 기존 Drizzle runner가 기록한 유효한 migration history와 아직 적용되지 않은 local migration이 있다
- **THEN** runtime migration command는 기존 history를 그대로 인식한다
- **AND** 적용된 name을 제외한 새 pending 파일만 reader의 version-control 순서로 실행한다
- **AND** 별도 history table이나 수동 변환 없이 기존 row의 순서와 ID를 보존한다

#### Scenario: 비선형 Drizzle history

- **WHEN** 병렬 branch merge·배포 때문에 database history row 순서가 local migration timestamp 정렬과 다르지만 모든 적용 name과 hash가 local에 존재한다
- **THEN** runtime migration command는 history를 유효하게 인식한다
- **AND** 이미 적용된 migration을 다시 실행하지 않는다
- **AND** 새 pending migration만 local 순서로 적용하고 history row를 재정렬하지 않는다

#### Scenario: Legacy history 승격

- **WHEN** 기존 Drizzle history에 name이 없고 각 row의 timestamp/hash가 local migration과 대응한다
- **THEN** runtime migration command는 Drizzle beta.22와 호환되는 timestamp 우선·hash 보조 mapping으로 name을 backfill한다
- **AND** 기존 history row 순서와 ID를 보존한 뒤 적용된 name을 제외한 pending migration을 local 순서로 실행한다
- **AND** unknown·ambiguous·duplicate mapping은 history shape 또는 schema를 변경하거나 새 SQL을 실행하기 전에 실패한다

#### Scenario: 적용된 migration hash 변경

- **WHEN** database history에 기록된 적용 name과 대응하는 local migration hash가 다르다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** database history를 현재 로컬 hash로 덮어쓰지 않는다

#### Scenario: 알 수 없거나 중복된 history

- **WHEN** database history에 local에 없는 name 또는 중복 name이 있거나 local migration directory에 duplicate name이 있다
- **THEN** runtime migration command는 새 migration SQL을 실행하기 전에 실패한다
- **AND** database history와 schema를 자동 성공 처리하거나 재작성하지 않는다
