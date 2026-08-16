## RENAMED Requirements

- FROM: `### Requirement: Business capability 미등록 상태의 실행 거부`
- TO: `### Requirement: 고정 business registration과 singleton Worker host`
- FROM: `### Requirement: 기본 비활성 Worker Helm component`
- TO: `### Requirement: Application workload의 상시 Worker component`

## MODIFIED Requirements

### Requirement: 고정 business registration과 singleton Worker host

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`. 시스템은 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registration과 task queue를 정확히 하나 제공해야 한다(MUST). entrypoint 자체는 이 registration으로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** Worker production entrypoint를 실행한다
- **THEN** 시스템은 compile-time에 구성된 Post Create effects Workflow·Activity registration과 task queue로 Worker host를 정확히 한 번 시작한다
- **AND** caller가 registration을 전달하거나 두 번째 Worker host를 시작할 수 있는 public startup API를 제공하지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint와 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime으로 business registration 부재를 숨기지 않는다

### Requirement: Application workload의 상시 Worker component

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`. Kosmo Helm chart는 정상 application workload가 활성화된 모든 환경에 Worker Deployment와 전용 ServiceAccount를 별도 `worker.enabled` 선택 없이 생성해야 한다(MUST). dev는 1개, prod는 2개의 replica를 기본값으로 render하고, 공통 runtime image의 Worker command, HTTP liveness/readiness probe와 환경별 Temporal endpoint·namespace를 전달해야 한다(MUST). production 실제 sync·rollout은 별도 사용자 승인 없이는 수행해서는 안 된다(MUST NOT).

#### Scenario: dev application workload render

- **WHEN** dev chart에서 정상 application workload를 render한다
- **THEN** 1개 replica, Worker command, HTTP probes와 dev Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 별도 Worker activation flag 없이 render된다

#### Scenario: prod application workload render

- **WHEN** prod chart에서 정상 application workload를 render한다
- **THEN** 2개 replica, Worker command, HTTP probes와 prod Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 별도 Worker activation flag 없이 render된다

#### Scenario: Worker lifecycle의 dev 검증

- **WHEN** 첫 Post Create effects registration을 포함한 exact revision을 dev에 적용한다
- **THEN** Worker가 실제 task queue를 poll하는 RUNNING 상태에서 readiness가 성공한다
- **AND** restart 뒤 accepted effects Workflow가 복구되고 SIGTERM 시 readiness가 실패한 뒤 진행 중 task의 graceful drain을 시도한다
