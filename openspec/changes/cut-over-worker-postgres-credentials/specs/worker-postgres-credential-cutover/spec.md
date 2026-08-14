## ADDED Requirements

### Requirement: trusted workload는 process 기본 Worker principal을 사용한다

**Authority / Provenance:** Linear `PROD-715`, `PROD-716` — Web trusted federation ingress와 Temporal Worker DB Activity는 각 workload의 process 기본 `db`를 사용하고 그 기본 표준 `PG*` env source가 `kosmo_worker` credential을 참조해야 한다(MUST). `DATABASE_URL`/`DATABASE_PASSWORD`, 별도 Worker application pool/handle, request-owned client 또는 Fedify DB context를 만들어서는 안 된다(MUST NOT).

#### Scenario: Web trusted federation ingress 실행

- **WHEN** Web가 검증된 inbound federation 요청의 database 작업을 실행한다
- **THEN** 기존 process 전역 기본 `db`가 `kosmo_worker` principal로 SQL을 실행한다
- **AND** 별도 request DB handle을 생성하거나 전달하지 않는다

#### Scenario: Temporal Worker DB Activity 실행

- **WHEN** 등록된 Temporal Worker DB Activity가 database 작업을 실행한다
- **THEN** 기존 process 전역 기본 `db`가 `kosmo_worker` principal로 SQL을 실행한다
- **AND** core/Fedify callsite에 별도 Worker handle을 추가하지 않는다

### Requirement: Worker credential은 기존 direct read-write Service를 통해 독립 전환한다

**Authority / Provenance:** Linear `PROD-369`, `PROD-715` — Web과 enabled Temporal Worker workload의 기본 connection만 Vault/VSO가 공급한 `kosmo_worker` LOGIN + `BYPASSRLS` SCRAM credential로 기존 PostgreSQL direct read-write Service에 연결해야 한다(MUST). GraphQL operation 전용 PgBouncer 경계를 바꾸거나 API Rollout에 Worker credential을 노출해서는 안 된다(MUST NOT).

#### Scenario: Worker credential cutover

- **WHEN** `workloads.enabled=true`와 `worker.enabled=true`로 PROD-715 workload wiring을 렌더한다
- **THEN** Web과 enabled Temporal Worker의 process 기본 DB만 Worker source를 사용한다
- **AND** chart가 `PGHOST`를 기존 direct read-write Service로, `PGPORT=5432`, `PGUSER=kosmo_worker`, `PGDATABASE=kosmo`로 생성한다
- **AND** chart가 PROD-369과 같은 release별 Worker Secret ref를 `PGPASSWORD`로 생성한다
- **AND** Web/Worker에 `DATABASE_URL`/`DATABASE_PASSWORD`를 투영하지 않는다
- **AND** API `DATABASE_*`/`OPERATION_DATABASE_*`, migration과 Fedify MessageQueue database는 기존 source를 유지한다
- **AND** Worker PG env compatibility flag, URL 감지 또는 owner fallback을 만들지 않는다

#### Scenario: Worker Secret rotation restart

- **WHEN** `worker-database` VaultStaticSecret destination이 새 password로 갱신된다
- **THEN** Web Rollout과 enabled Temporal Worker Deployment가 restart target으로 재시작된다
- **AND** 새 Web/Worker Pod는 같은 SecretKeyRef에서 새 `PGPASSWORD`를 읽는다

#### Scenario: Worker activation gate 보존

- **WHEN** `workloads.enabled=true`와 `worker.enabled=false`로 PROD-715 workload wiring을 렌더한다
- **THEN** Web Rollout은 Worker Secret restart target을 유지한다
- **AND** Worker Deployment와 Worker restart target은 생성하지 않는다

#### Scenario: API Worker credential 비주입

- **WHEN** PROD-715 manifest를 렌더한다
- **THEN** API Rollout에는 Worker Secret ref, `WORKER_DATABASE_*` 또는 동등한 Worker DB 입력이 없다

### Requirement: Worker credential source는 독립적으로 rollback한다

**Authority / Provenance:** Linear `PROD-715` — 시스템은 API GraphQL operation connection, application SQL과 migration/queue source를 변경하지 않고 전체 PROD-715 merge/squash revision을 Git revert해 Web/enabled Worker manifest와 기본 DB source를 pre-PROD-715 상태로 되돌릴 수 있어야 한다(MUST). 활성 Worker credential 인증 실패 중 owner credential로 자동 재시도해서는 안 된다(MUST NOT).

#### Scenario: Worker workload wiring rollback

- **WHEN** 전체 PROD-715 merge/squash revision을 Git revert하고 API selector와 migration/queue source를 유지한다
- **THEN** Web의 기본 DB env와 Worker resource/source는 pre-PROD-715 manifest로 돌아간다
- **AND** API GraphQL operation connection, migration과 queue database는 바뀌지 않는다

### Requirement: production 전환은 별도 승인 대상이다

**Authority / Provenance:** Linear `PROD-715` — PR merge, CI, 비운영 검증 또는 OpenSpec 완료를 production Secret sync/apply나 workload cutover 승인으로 간주해서는 안 된다(MUST NOT). production 작업은 별도 사용자의 명시적 승인과 운영 절차를 요구한다(MUST).

#### Scenario: 승인 없는 production 변경

- **WHEN** OpenSpec, 코드, PR 또는 비운영 검증이 준비됐지만 production 승인이 없다
- **THEN** production Secret sync, manifest apply, Argo sync와 workload cutover를 수행하지 않는다

#### Scenario: 비운영 principal 검증

- **WHEN** 구현 revision이 비운영 환경에 배포된다
- **THEN** Web 기본 DB의 direct read-write Service 경로, `current_user = 'kosmo_worker'`, `rolbypassrls = true`와 대표 application SQL을 검증한다
- **AND** enabled Worker manifest의 같은 기본 source, API 비주입과 queue database 분리를 검증한다
