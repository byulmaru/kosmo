# temporal-worker-runtime-foundation Specification

## Purpose

후속 business capability가 재사용할 독립 Temporal Worker 애플리케이션, runtime image entrypoint, health lifecycle와 기본 비활성 Kubernetes component의 계약을 정의한다.

## Requirements

### Requirement: 독립 Worker 애플리케이션 경계

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-730. 시스템은 API/Web와 독립적으로 build·test할 수 있는 Temporal Worker workspace 애플리케이션을 제공해야 한다(MUST). Worker의 로컬 실행은 root 기본 개발 프로세스에 자동 포함하지 않고 명시적 command로만 시작해야 한다(MUST).

#### Scenario: Worker package 독립 검증

- **WHEN** Worker package의 build와 test command를 실행한다
- **THEN** API 또는 Web process를 시작하지 않고 Worker package만 검증한다

#### Scenario: 기본 로컬 개발 실행

- **WHEN** 개발자가 root 기본 dev command를 실행한다
- **THEN** 시스템은 Temporal Worker process를 자동으로 시작하지 않는다

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

### Requirement: 등록된 Worker의 health와 종료 lifecycle

**Authority / Provenance:** PROD-730. 시스템은 후속 business capability가 실제 Worker registration을 제공할 때 재사용할 HTTP liveness/readiness와 SIGTERM graceful shutdown 경계를 제공해야 한다(MUST). Liveness는 process가 동작 중인지 나타내고, readiness는 Temporal Worker가 task polling을 받을 준비가 된 뒤에만 성공하며 종료가 시작되면 실패로 전환해야 한다(MUST). Foundation은 connect/create 중 SIGTERM이 process에 흡수되지 않는 경계를 package-level child-process test로 검증해야 하며(MUST), 실제 RUNNING 이후 readiness 전이와 Temporal task drain 통합 검증은 Worker를 활성화하는 첫 business capability가 수행해야 한다(MUST).

#### Scenario: Worker startup 중 SIGTERM 수신

- **WHEN** Temporal connection 또는 Worker 생성이 완료되기 전에 process가 SIGTERM을 수신한다
- **THEN** process는 signal을 흡수해 health-only 상태로 남지 않고 SIGTERM으로 종료한다

#### Scenario: Worker가 준비되기 전 health

- **WHEN** Worker process가 시작됐지만 Temporal Worker가 polling 준비를 마치지 못했다
- **THEN** liveness는 성공할 수 있지만 readiness는 실패한다

#### Scenario: Worker가 준비된 후 health

- **WHEN** 등록된 Temporal Worker가 polling 준비를 마친다
- **THEN** liveness와 readiness가 모두 성공한다

#### Scenario: 실행 중 SIGTERM 수신

- **WHEN** 준비된 Worker process가 SIGTERM을 수신한다
- **THEN** readiness는 즉시 실패로 전환된다
- **AND** process는 새 task 수신을 중단하고 진행 중인 Temporal task의 graceful shutdown을 시도한 뒤 종료한다

### Requirement: 공통 runtime image의 Worker entrypoint

**Authority / Provenance:** PROD-730. Kosmo 공통 runtime image는 Worker package의 production dependency와 source를 포함하고, API/Web/migration과 구분되는 명시적 Worker entrypoint를 제공해야 한다(MUST).

#### Scenario: Worker image command 선택

- **WHEN** 공통 runtime image를 Worker command로 실행한다
- **THEN** image entrypoint는 `apps/worker`의 production entrypoint를 실행한다

#### Scenario: 알 수 없는 command 선택

- **WHEN** 공통 runtime image를 지원하지 않는 command로 실행한다
- **THEN** 기존과 같이 오류를 출력하고 non-zero status로 종료한다

### Requirement: Application workload의 상시 Worker component

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`. Kosmo Helm chart는 유효한 immutable application image가 지정된 모든 환경에서 API, Web, Fedify consumer와 함께 Worker Deployment 및 전용 ServiceAccount를 항상 생성해야 한다(MUST). Worker 또는 chart-wide workload activation key로 이 component를 숨겨서는 안 된다(MUST NOT). dev는 1개, prod는 2개의 replica를 기본값으로 render하고, 공통 runtime image의 Worker command, HTTP liveness/readiness probe와 환경별 Temporal endpoint·namespace를 전달해야 한다(MUST). production 실제 sync·rollout은 별도 사용자 승인 없이는 수행해서는 안 된다(MUST NOT).

#### Scenario: dev application workload render

- **WHEN** 유효한 immutable image와 함께 dev chart를 render한다
- **THEN** API, Web, Fedify consumer와 함께 1개 replica, Worker command, HTTP probes 및 dev Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 activation key 없이 render된다

#### Scenario: prod application workload render

- **WHEN** 유효한 immutable image와 함께 prod chart를 render한다
- **THEN** API, Web, Fedify consumer와 함께 2개 replica, Worker command, HTTP probes 및 prod Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 activation key 없이 render된다

#### Scenario: legacy activation values are inert

- **WHEN** 유효한 immutable image와 함께 과거 workload 또는 Worker activation 값을 추가해 chart를 render한다
- **THEN** API, Web, Fedify consumer와 Worker가 모두 render되고 과거 값이 workload 존재 여부를 바꾸지 않는다

#### Scenario: Worker lifecycle의 dev 검증

- **WHEN** 첫 Post Create effects registration을 포함한 exact revision을 dev에 적용한다
- **THEN** Worker가 실제 task queue를 poll하는 RUNNING 상태에서 readiness가 성공한다
- **AND** restart 뒤 accepted effects Workflow가 복구되고 SIGTERM 시 readiness가 실패한 뒤 진행 중 task의 graceful drain을 시도한다

### Requirement: Worker 역할별 DB 입력 seam

**Authority / Provenance:** PROD-730, PROD-709, PROD-715. 활성화된 Worker Deployment는 API 역할과 Fedify 역할의 완전하게 구성된 PostgreSQL credential values를 각각 기존 역할별 Secret과 URL 환경 변수로 투영해야 한다(MUST). 부분 credential 설정은 chart render 단계에서 실패해야 하며(MUST), foundation은 DB connection을 열거나 credential·권한을 생성·전환하지 않아야 한다(MUST NOT).

#### Scenario: 역할별 credential이 구성됨

- **WHEN** Worker component를 활성화하고 API와 Fedify 역할의 URL·password Secret name·key를 완전하게 제공한다
- **THEN** Deployment는 `DATABASE_URL`/`DATABASE_PASSWORD`와 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD`를 각 역할의 입력으로 가진다

#### Scenario: 역할별 credential이 부분 구성됨

- **WHEN** 역할별 URL·password Secret name·key 중 일부만 제공한다
- **THEN** chart render가 incomplete credential 오류로 실패한다

#### Scenario: foundation Worker의 DB 비사용

- **WHEN** 등록된 business capability가 없는 Worker entrypoint를 실행한다
- **THEN** process는 제공된 DB 입력으로 connection을 열지 않고 구성 오류로 종료한다
