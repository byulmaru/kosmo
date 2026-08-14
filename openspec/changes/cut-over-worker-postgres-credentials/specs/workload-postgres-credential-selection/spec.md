## MODIFIED Requirements

### Requirement: 기존 runtime 연결과 rendered manifest 보존

**Authority / Provenance:** Linear `PROD-709`, `PROD-715` — 시스템은 `api` 또는 `worker` selector를 활성화하지 않은 기존 Helm values에서 API, Web, Worker와 migration의 현재 연결 경계를 그대로 렌더해야 한다(MUST). Selector 이름 migration만 배포한 release는 database role, Secret, endpoint 또는 runtime connection을 자동 전환해서는 안 된다(MUST NOT).

#### Scenario: 기존 values runtime 보존

- **WHEN** API와 Worker selector를 모두 비활성화한 values를 렌더한다
- **THEN** API, Web과 Worker 기본 연결은 기존 owner `DATABASE_*`를 사용한다
- **AND** 별도 `WORKER_DATABASE_*`는 렌더되지 않는다

#### Scenario: migration 경계 보존

- **WHEN** runtime selector 없이 dev/prod migration Job을 렌더한다
- **THEN** dev owner fallback과 production `kosmo_migration` login → `SET ROLE kosmo` 경계를 유지한다

### Requirement: API credential source는 GraphQL operation 경계에만 제공한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`, `PROD-716` — API PostgreSQL URL과 password Secret source는 API Rollout의 process 기본 connection과 GraphQL operation connection에만 제공해야 한다(MUST). Web 또는 Worker workload의 기본 source로 재사용해서는 안 된다(MUST NOT).

#### Scenario: API source 선택

- **WHEN** `postgres.credentials.api`의 URL과 password Secret trio를 모두 채운다
- **THEN** API Rollout의 `DATABASE_*`와 `OPERATION_DATABASE_*`가 API source를 참조한다
- **AND** Web/Worker 기본 `DATABASE_*`는 Worker selector 또는 owner fallback을 유지한다

#### Scenario: API source rollback

- **WHEN** API trio를 모두 제거하고 Worker 설정을 유지한다
- **THEN** API Rollout의 GraphQL connection만 기존 owner source로 돌아간다
- **AND** Web/Worker 기본 connection은 바뀌지 않는다

### Requirement: Worker credential source는 Web과 Temporal Worker 기본 DB에만 제공한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715` — 시스템은 Web과 Temporal Worker workload의 기본 DB에 하나의 `kosmo_worker` Pooler URL과 password Secret source를 제공할 수 있어야 한다(MUST). 별도 application DB 입력을 추가하거나 API Rollout에 주입해서는 안 된다(MUST NOT).

#### Scenario: Worker source 선택

- **WHEN** `postgres.credentials.worker`의 Pooler URL과 password Secret trio를 모두 채운다
- **THEN** Web Rollout과 활성화된 Worker Deployment의 기본 `DATABASE_PASSWORD` SecretKeyRef와 `DATABASE_URL`이 Worker source를 참조한다
- **AND** API Rollout에는 Worker Secret/env가 없고 `WORKER_DATABASE_*`도 어느 workload에 렌더되지 않는다

#### Scenario: Worker source rollback

- **WHEN** Worker trio를 모두 제거하고 API 설정을 유지한다
- **THEN** Web/Worker 기본 `DATABASE_*`만 승인된 owner source로 돌아간다
- **AND** API connection은 바뀌지 않는다

#### Scenario: API Worker env 금지

- **WHEN** API-only, Worker-only 또는 양쪽 selector를 각각 활성화한다
- **THEN** API Rollout에는 어떤 조합에서도 Worker Secret ref나 `WORKER_DATABASE_*`가 렌더되지 않는다

#### Scenario: MessageQueue database 분리

- **WHEN** Worker source와 Fedify MessageQueue runtime을 함께 렌더한다
- **THEN** `FEDIFY_QUEUE_DATABASE_*`는 별도 `kosmo_fedify_queue` database/role source를 유지한다
- **AND** Worker source를 queue credential로 재사용하지 않는다

### Requirement: 각 역할 selector는 atomic trio다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715` — `api`와 `worker` 각각의 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key`를 하나의 선택 단위로 검증해야 한다(MUST). 일부만 설정된 source는 owner와 custom 값을 섞지 않고 render 오류로 거부해야 한다(MUST).

#### Scenario: 완전한 trio 선택

- **WHEN** 하나의 역할에 URL, Secret name과 Secret key를 모두 설정한다
- **THEN** 해당 역할만 custom source를 참조하고 Secret value는 values나 manifest에 나타나지 않는다

#### Scenario: 불완전한 trio 거부

- **WHEN** API 또는 Worker source 일부만 설정한다
- **THEN** Helm render는 해당 source를 식별하는 오류로 실패한다

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-715`, `PROD-564` — runtime selector는 migration credential, role transition 또는 실행 순서를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: runtime 입력만 변경

- **WHEN** API 또는 Worker trio를 opt-in하고 migration 설정을 변경하지 않는다
- **THEN** dev migration owner fallback과 production `kosmo_migration` Secret 및 `SET ROLE kosmo` 계약은 그대로 유지된다

#### Scenario: migration render 불변

- **WHEN** selector 조합과 rollback의 migration Job을 비교한다
- **THEN** migration env, Secret ref와 role transition은 baseline과 byte-identical하다

## REMOVED Requirements

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** `fedify`는 Temporal Worker DB Activity까지 포함하는 trusted 실행 역할을 나타내지 못한다.

**Migration:** `fedify` selector를 `worker` selector로 교체하고 Web/Worker 기본 `DATABASE_*` source로 소비한다. production 미소비 내부 env이므로 alias나 dual-read 기간을 두지 않는다.

#### Scenario: legacy Fedify selector 비소비

- **WHEN** migration 이후 `postgres.credentials.fedify` 또는 `FEDIFY_DATABASE_*`를 설정한다
- **THEN** chart/runtime은 이를 Worker source로 해석하거나 `WORKER_DATABASE_*`로 투영하지 않는다
