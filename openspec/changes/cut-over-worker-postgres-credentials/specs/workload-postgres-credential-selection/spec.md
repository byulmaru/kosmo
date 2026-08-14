## MODIFIED Requirements

### Requirement: API와 migration 경계를 보존하며 Web/Worker를 고정 source로 전환한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715` — 시스템은 기존 Helm values에서 API와 migration 경계를 보존하면서 Web과 enabled Worker 기본 connection을 고정 `kosmo_worker` source로 전환해야 한다(MUST). Worker 전환을 optional selector나 owner fallback 상태로 남겨서는 안 된다(MUST NOT).

#### Scenario: 기존 values runtime 보존

- **WHEN** 기존 values를 별도 Worker credential 설정 없이 렌더한다
- **THEN** API는 기존 owner `DATABASE_*`를 유지하고 Web과 enabled Worker는 고정 Worker `DATABASE_*`를 사용한다
- **AND** 별도 `WORKER_DATABASE_*`는 렌더되지 않는다

#### Scenario: migration 경계 보존

- **WHEN** Worker workload wiring과 dev/prod migration Job을 함께 렌더한다
- **THEN** dev owner fallback과 production `kosmo_migration` login → `SET ROLE kosmo` 경계를 유지한다

### Requirement: API credential source는 GraphQL operation 경계에만 제공한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`, `PROD-716` — API PostgreSQL URL과 password Secret source는 API Rollout의 process 기본 connection과 GraphQL operation connection에만 제공해야 한다(MUST). Web 또는 Worker workload의 기본 source로 재사용해서는 안 된다(MUST NOT).

#### Scenario: API source 선택

- **WHEN** `postgres.credentials.api`의 URL과 password Secret trio를 모두 채운다
- **THEN** API Rollout의 `DATABASE_*`와 `OPERATION_DATABASE_*`가 API source를 참조한다
- **AND** Web과 enabled Worker 기본 `DATABASE_*`는 고정 Worker source를 유지한다

#### Scenario: API source rollback

- **WHEN** API trio를 모두 제거하고 Worker workload wiring을 유지한다
- **THEN** API Rollout의 GraphQL connection만 기존 owner source로 돌아간다
- **AND** Web과 enabled Worker 기본 connection은 바뀌지 않는다

### Requirement: Worker credential source는 Web과 Temporal Worker 기본 DB에만 제공한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-715` — 시스템은 Web과 기존 activation gate가 enabled된 Temporal Worker workload의 기본 DB에 chart가 생성한 `kosmo_worker` direct read-write Service URL과 release별 `*-postgres-worker` / `password` Secret source를 제공해야 한다(MUST). Worker credential values나 별도 application DB 입력을 추가하거나 API Rollout에 주입해서는 안 된다(MUST NOT).

#### Scenario: Worker source 선택

- **WHEN** 별도 Worker credential values 없이 `workloads.enabled=true`와 `worker.enabled=true`로 chart를 렌더한다
- **THEN** Web Rollout과 enabled Worker Deployment의 기본 `DATABASE_PASSWORD` SecretKeyRef와 `DATABASE_URL`이 Worker source를 참조한다
- **AND** `DATABASE_URL`은 chart가 `kosmo_worker` username, `kosmo` database와 기존 direct read-write Service endpoint로 생성한다
- **AND** `DATABASE_PASSWORD`는 같은 release의 `*-postgres-worker` Secret `password` key를 참조한다
- **AND** API Rollout에는 Worker Secret/env가 없고 `WORKER_DATABASE_*`도 어느 workload에 렌더되지 않는다
- **AND** Worker URL compatibility flag, URL 감지 또는 owner fallback을 만들지 않는다

#### Scenario: 기존 Worker activation gate 보존

- **WHEN** `workloads.enabled=true`와 기본 `worker.enabled=false` 또는 생략된 `worker.enabled`로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment가 존재하지 않는다
- **AND** Worker source와 Worker restart target은 Web에 유입되지 않는다

#### Scenario: Worker activation override

- **WHEN** `workloads.enabled=true`와 `worker.enabled=true`로 chart를 렌더한다
- **THEN** Worker ServiceAccount와 Deployment가 존재한다
- **AND** Worker source와 Worker restart target이 enabled Worker template에만 투영된다

#### Scenario: Worker source rollback

- **WHEN** 전체 PROD-715 merge/squash revision을 Git revert하고 API 설정과 migration/queue source를 유지한다
- **THEN** Web의 기본 `DATABASE_*`와 enabled Worker resource/source는 pre-PROD-715 manifest로 돌아간다
- **AND** API connection은 바뀌지 않는다

#### Scenario: API Worker env 금지

- **WHEN** API selector의 활성/비활성 조합에서 `workloads.enabled=true`와 `worker.enabled=true`로 PROD-715 workload wiring을 렌더한다
- **THEN** API Rollout에는 Worker Secret ref나 `WORKER_DATABASE_*`가 렌더되지 않는다

#### Scenario: MessageQueue database 분리

- **WHEN** Worker source와 Fedify MessageQueue runtime을 함께 렌더한다
- **THEN** `FEDIFY_QUEUE_DATABASE_*`는 별도 `kosmo_fedify_queue` database/role source를 유지한다
- **AND** Worker source를 queue credential로 재사용하지 않는다

### Requirement: API selector만 credential 입력을 검증한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715` — API는 기존 `databaseUrl`, `passwordSecret.name`, `passwordSecret.key` trio를 유지해야 한다(MUST). Worker는 credential values 입력이나 validation branch를 가져서는 안 되며(MUST NOT), URL과 Secret ref를 chart가 생성해야 한다(MUST).

#### Scenario: 완전한 API source 선택

- **WHEN** API trio를 완성한다
- **THEN** API만 선택된 source를 참조하고 Secret value는 values나 manifest에 나타나지 않는다

#### Scenario: 불완전한 역할 source 거부

- **WHEN** API trio 일부만 설정한다
- **THEN** Helm render는 API source를 식별하는 오류로 실패한다

### Requirement: migration은 runtime selector와 독립된 기존 경계를 사용한다

**Authority / Provenance:** `docs/operations/production-migrations.md`, `memory/database-migrations.md`, Linear `PROD-709`, `PROD-715`, `PROD-564` — runtime selector는 migration credential, role transition 또는 실행 순서를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: runtime 입력만 변경

- **WHEN** API trio 또는 PROD-715 Worker workload wiring을 적용하고 migration 설정을 변경하지 않는다
- **THEN** dev migration owner fallback과 production `kosmo_migration` Secret 및 `SET ROLE kosmo` 계약은 그대로 유지된다

#### Scenario: migration render 불변

- **WHEN** PROD-715 적용 전후와 Git revert의 migration Job을 비교한다
- **THEN** migration env, Secret ref와 role transition은 baseline과 byte-identical하다

## REMOVED Requirements

### Requirement: Fedify source는 현재 Web inbound Fedify에만 추가한다

**Authority / Provenance:** Linear `PROD-709`, `PROD-715`

**Reason:** `fedify`는 Temporal Worker DB Activity까지 포함하는 trusted 실행 역할을 나타내지 못한다.

**Migration:** `fedify`와 historical `worker` selector를 모두 제거하고 Web과 enabled Worker 기본 `DATABASE_*`를 chart-derived Worker source로 고정한다. production 미소비 내부 env이므로 alias나 dual-read 기간을 두지 않는다.

#### Scenario: legacy Fedify selector 비소비

- **WHEN** migration 이후 `postgres.credentials.fedify` 또는 `FEDIFY_DATABASE_*`를 설정한다
- **THEN** chart/runtime은 이를 Worker source로 해석하거나 `WORKER_DATABASE_*`로 투영하지 않는다
