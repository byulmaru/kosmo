## ADDED Requirements

### Requirement: 독립 Worker 애플리케이션 경계

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-730. 시스템은 API/Web와 독립적으로 build·test할 수 있는 Temporal Worker workspace 애플리케이션을 제공해야 한다(MUST). Worker의 로컬 실행은 root 기본 개발 프로세스에 자동 포함하지 않고 명시적 command로만 시작해야 한다(MUST).

#### Scenario: Worker package 독립 검증

- **WHEN** Worker package의 build와 test command를 실행한다
- **THEN** API 또는 Web process를 시작하지 않고 Worker package만 검증한다

#### Scenario: 기본 로컬 개발 실행

- **WHEN** 개발자가 root 기본 dev command를 실행한다
- **THEN** 시스템은 Temporal Worker process를 자동으로 시작하지 않는다

### Requirement: Business capability 미등록 상태의 실행 거부

**Authority / Provenance:** PROD-730. 시스템은 등록된 business Workflow/Activity와 실제 task queue가 없는 Worker entrypoint를 시작할 때 Temporal Server에 연결하거나 task queue를 poll하지 않고 명확한 구성 오류로 즉시 종료해야 한다(MUST). foundation은 이를 우회하기 위한 smoke Workflow/Activity 또는 검증 전용 task queue를 만들지 않아야 한다(MUST NOT).

#### Scenario: 빈 Worker entrypoint 실행

- **WHEN** 등록된 business capability가 없는 foundation의 Worker entrypoint를 명시적으로 실행한다
- **THEN** process는 구성 오류를 출력하고 non-zero status로 종료한다
- **AND** Temporal connection과 task queue polling을 시작하지 않는다

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

### Requirement: 기본 비활성 Worker Helm component

**Authority / Provenance:** PROD-730. Kosmo Helm chart는 Worker Deployment와 전용 ServiceAccount를 기본 비활성 상태로 제공해야 한다(MUST). component를 명시적으로 활성화하면 dev는 1개, prod는 2개의 replica를 기본값으로 render하고, 공통 runtime image의 Worker command, HTTP liveness/readiness probe, 환경별 Temporal endpoint·namespace를 전달해야 한다(MUST). 실제 활성화와 live rollout은 business Workflow/Activity와 task queue를 소유한 첫 capability가 수행해야 한다(MUST).

#### Scenario: 기본 Helm render

- **WHEN** dev 또는 prod chart를 Worker override 없이 render한다
- **THEN** Worker Deployment와 ServiceAccount가 생성되지 않는다

#### Scenario: dev Worker component render

- **WHEN** dev chart에서 Worker component를 명시적으로 활성화한다
- **THEN** 1개 replica, Worker command, HTTP probes와 dev Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 render된다

#### Scenario: prod Worker component render

- **WHEN** prod chart에서 Worker component를 명시적으로 활성화한다
- **THEN** 2개 replica, Worker command, HTTP probes와 prod Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 render된다

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
