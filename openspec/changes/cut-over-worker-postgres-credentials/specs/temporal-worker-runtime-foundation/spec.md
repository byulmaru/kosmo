## ADDED Requirements

### Requirement: Business capability 미등록 상태의 healthy idle

**Authority / Provenance:** `PROD-730`, `PROD-715` — 시스템은 등록된 business Workflow/Activity가 없는 foundation Worker를 항상 배포할 때 HTTP liveness/readiness를 제공하는 idle process로 유지해야 한다(MUST). 이 상태에서 Temporal Server, task queue 또는 database에 연결해서는 안 되며(MUST NOT), smoke Workflow/Activity나 검증 전용 task queue를 만들어서는 안 된다(MUST NOT). 부분 또는 잘못된 명시 registration은 구성 오류로 거부해야 한다(MUST).

#### Scenario: 빈 foundation Worker 실행

- **WHEN** registration 없이 foundation Worker entrypoint를 실행한다
- **THEN** `/health`와 `/ready`는 성공한다
- **AND** process는 SIGTERM까지 유지된다
- **AND** Temporal connection, task queue polling과 DB connection을 시작하지 않는다

#### Scenario: 잘못된 명시 registration

- **WHEN** task queue나 business handler 중 일부만 있는 registration을 제공한다
- **THEN** process는 외부 연결 전에 구성 오류로 종료한다

## MODIFIED Requirements

### Requirement: Worker workload 기본 DB source

**Authority / Provenance:** `PROD-730`, `PROD-715` — `workloads.enabled` 전역 gate에서 렌더되는 Worker Deployment는 chart가 생성한 `kosmo_worker` PgBouncer URL과 PROD-369의 release별 Worker Secret ref를 process 기본 `DATABASE_URL`/`DATABASE_PASSWORD`로 사용해야 한다(MUST). 별도 Worker enabled/credential selector, `WORKER_DATABASE_*` application connection을 만들거나 foundation 자체가 business DB connection을 열어서는 안 된다(MUST NOT).

#### Scenario: Worker Deployment가 렌더됨

- **WHEN** `workloads.enabled=true`로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment를 항상 생성한다
- **AND** `worker.enabled` 또는 동등한 Worker-only enable 입력은 존재하지 않는다
- **AND** Deployment의 기본 `DATABASE_*`는 Worker source를 참조한다
- **AND** `DATABASE_URL`은 chart가 고정된 `kosmo_worker` username, `kosmo` database와 기존 PgBouncer endpoint로 생성한다
- **AND** `DATABASE_PASSWORD`는 같은 release의 `*-postgres-worker` Secret `password` key를 참조한다
- **AND** `WORKER_DATABASE_*` 또는 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않는다

#### Scenario: Worker credential values 입력 부재

- **WHEN** 기본 values와 임의 배포 환경을 렌더한다
- **THEN** `worker.enabled`나 `postgres.credentials.worker` 설정 없이 Worker resources, URL과 Secret ref를 생성한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 idle health/readiness를 제공하되 기본 DB 입력이 존재해도 connection을 열지 않는다

## REMOVED Requirements

### Requirement: Business capability 미등록 상태의 실행 거부

**Authority / Provenance:** `PROD-730`, `PROD-715`

**Reason:** Worker-only enable flag를 제거해 foundation Worker가 항상 배포되므로 미등록 상태의 non-zero 종료는 Deployment를 영구 CrashLoop 상태로 만든다.

**Migration:** registration이 없는 foundation 상태는 외부 연결 없는 healthy idle로 전환하고, 부분 또는 잘못된 명시 registration의 fail-fast만 유지한다.
