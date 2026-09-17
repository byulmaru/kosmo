## ADDED Requirements

### Requirement: 로컬 PostgreSQL은 영속 database와 분리된 principal을 제공한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear `PROD-897`. 로컬 개발 환경은 loopback `127.0.0.1:54328`의 영속 PostgreSQL에서 application database `kosmo`와 Fedify queue database `kosmo_fedify_queue`를 제공해야 한다(MUST). Migration owner `kosmo`, application non-owner `kosmo_runtime`, Fedify queue owner `kosmo_fedify_queue`는 서로 분리되어야 하고(MUST), application runtime principal은 `LOGIN`, `NOBYPASSRLS`, 무소속이며 application schema/table owner가 아니어야 한다(MUST).

#### Scenario: 빈 PostgreSQL 최초 준비

- **WHEN** 빈 local PostgreSQL data volume에 최초 준비 명령을 실행한다
- **THEN** owner, runtime, queue role과 두 database가 idempotent하게 준비된다
- **AND** immutable migration 전체가 owner `kosmo`로 적용된다
- **AND** Local Instance가 `kosmo_runtime`으로 초기화된다
- **AND** Fedify official queue adapter가 전용 queue database를 사용할 수 있다

#### Scenario: role과 database 경계

- **WHEN** 준비가 끝난 local catalog와 application connection을 검사한다
- **THEN** application `current_user`는 `kosmo_runtime`이고 application object owner는 `kosmo`이다
- **AND** queue object와 database는 전용 `kosmo_fedify_queue` role이 소유한다
- **AND** application runtime은 owner, queue role, legacy role의 credential이나 membership을 사용하지 않는다

#### Scenario: PostgreSQL 재시작

- **WHEN** 준비된 local PostgreSQL container를 중지했다가 다시 시작한다
- **THEN** application data, migration history, Local Instance와 queue database가 보존된다
- **AND** 재시작 과정에서 volume reset이나 database 재생성이 일어나지 않는다

### Requirement: 최초 준비와 반복 개발 실행은 분리된다

**Authority / Provenance:** Linear `PROD-897`. Workspace는 빈 local PostgreSQL을 위한 명시적 최초 준비 명령과 평상시 `pnpm dev`를 분리해야 한다(MUST). 최초 준비는 role/database/ACL, migration, Local Instance 준비를 소유해야 하며(MUST), 평상시 `pnpm dev`는 reset, seed, migration replay, role/database 재생성 또는 data deletion을 수행해서는 안 된다(MUST NOT).

#### Scenario: 최초 준비를 반복 실행

- **WHEN** 이미 준비된 local PostgreSQL에 최초 준비 명령을 다시 실행한다
- **THEN** 기존 role, database, migration history와 Local Instance를 파괴하지 않고 성공한다
- **AND** 기존 application data를 삭제하거나 seed data로 덮어쓰지 않는다

#### Scenario: 평상시 pnpm dev 재실행

- **WHEN** 개발자가 `pnpm dev`를 종료한 뒤 같은 PostgreSQL volume으로 다시 실행한다
- **THEN** 기존 application data와 Local Instance가 보존된다
- **AND** 개발 service 시작 경로는 migration, bootstrap, reset 또는 seed를 실행하지 않는다

### Requirement: 로컬 runtime credential source와 권한 경계를 강제한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, Linear `PROD-897`. Application runtime은 Vault `secret/kubernetes/kosmo/local`에서 받은 canonical `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`만 사용해야 하고(MUST), `DATABASE_URL` compatibility fallback을 추가해서는 안 된다(MUST NOT). Local bootstrap은 별도 Vault `secret/kubernetes/kosmo/local/postgres-bootstrap`의 `LOCAL_POSTGRES_ADMIN_PASSWORD`, `LOCAL_POSTGRES_OWNER_PASSWORD`를 사용해야 하며(MUST), 비밀번호를 source, default, log, artifact 또는 Git에 기록하거나 dev/prod credential을 복제해서는 안 된다(MUST NOT).

#### Scenario: application runtime 환경 검증

- **WHEN** `pnpm dev`가 application process를 시작한다
- **THEN** `PGHOST=127.0.0.1`, `PGPORT=54328`, `PGDATABASE=kosmo`, `PGUSER=kosmo_runtime`인 경우에만 local runtime을 시작한다
- **AND** `DATABASE_URL`과 bootstrap credential은 application child process에 전달되지 않는다
- **AND** 누락되거나 다른 host, port, database, user가 지정되면 credential 값을 출력하지 않고 시작 전에 실패한다

#### Scenario: Fedify queue credential 분리

- **WHEN** Fedify producer 또는 consumer가 local queue에 연결한다
- **THEN** `FEDIFY_QUEUE_DATABASE_URL`은 `kosmo_fedify_queue` role과 `127.0.0.1:54328/kosmo_fedify_queue`만 가리킨다
- **AND** 별도 `FEDIFY_QUEUE_DATABASE_PASSWORD`를 사용하고 application 또는 owner password로 fallback하지 않는다

#### Scenario: 사람이 준비하는 Vault 값

- **WHEN** 필요한 local credential이 Vault에 아직 없다
- **THEN** 문서는 정확한 path, key와 목적만 안내한다
- **AND** 자동화는 Vault Secret을 생성, 수정, 삭제하거나 비밀번호 값을 출력 또는 복제하지 않는다

### Requirement: pnpm dev는 전체 로컬 runtime을 안전하게 실행한다

**Authority / Provenance:** `docs/architecture/core-services.md`, Linear `PROD-897`. `pnpm dev`는 local PostgreSQL 및 local Temporal에 연결된 API, Web, App, Temporal Worker와 Fedify queue consumer를 함께 실행해야 한다(MUST). Worker health는 `127.0.0.1:8081`, consumer health는 `127.0.0.1:8082`에서 독립적으로 제공되어야 하고(MUST), application runtime과 queue runtime의 database 경계를 유지해야 한다(MUST).

#### Scenario: 전체 개발 runtime 시작

- **WHEN** local PostgreSQL이 준비되고 두 Vault path의 필수 값이 존재하는 상태에서 `pnpm dev`를 실행한다
- **THEN** API, Web, App, Worker, Fedify consumer가 시작된다
- **AND** API 대표 GraphQL 요청과 Web health가 성공한다
- **AND** Worker readiness와 local Temporal 연결이 성공한다
- **AND** consumer readiness와 queue database 연결이 성공한다

#### Scenario: runtime 구성 오류

- **WHEN** application PG target/key, queue target/key 또는 Temporal local target이 누락되거나 정해진 local 계약과 다르다
- **THEN** service 시작 전에 명확한 정적 구성 오류로 실패한다
- **AND** 형식은 유효하지만 인증이 실패하는 credential은 실제 연결을 소유한 service가 연결 시점에 오류로 보고한다
- **AND** dev/prod database, owner credential, `DATABASE_URL` 또는 다른 fallback으로 전환하지 않는다

### Requirement: PostgreSQL만 영속 local lifecycle을 소유한다

**Authority / Provenance:** Linear `PROD-897`. Local PostgreSQL은 명시적으로 제거하기 전까지 named volume의 data를 보존해야 한다(MUST). Temporal은 기존 repository local server를 재사용해야 하며(MUST), PROD-897 전용 Docker/Compose lifecycle, UI, persistent SQLite volume 또는 PostgreSQL application volume과의 결합을 추가해서는 안 된다(MUST NOT).

#### Scenario: 일반 개발 서비스 종료

- **WHEN** 개발자가 일반 종료 명령으로 local service를 중지한다
- **THEN** PostgreSQL named volume은 보존된다
- **AND** 개발 process와 함께 종료되는 Temporal local server의 임시 상태는 보존 계약을 가지지 않는다

#### Scenario: 저장소 runtime 구성 검증

- **WHEN** local service 구성과 개발 command를 inspect한다
- **THEN** Docker Compose는 PostgreSQL service와 영속 data volume만 관리한다
- **AND** Temporal은 기존 repository local server를 `127.0.0.1:7233`에서 UI와 persistent storage 없이 실행한다
