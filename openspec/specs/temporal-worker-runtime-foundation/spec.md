# temporal-worker-runtime-foundation Specification

## Purpose

후속 business capability가 재사용할 독립 Temporal Worker 애플리케이션, runtime image entrypoint, health lifecycle와 상시 application workload의 계약을 정의한다.

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

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-321`, `PROD-665`, `PROD-720`, `PROD-722`, `PROD-723`, `PROD-725`. 시스템은 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registry와 task queue를 정확히 하나 제공해야 한다(MUST). Registry는 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity와 Profile Update Effects, Reaction Create/Delete Effects, directed pair Follow lifecycle 및 exact-row Follow removal Workflow를 함께 등록하고 event별 Workflow source를 정적으로 조립해야 한다(MUST). 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 유지해야 하며(MUST), Repost create는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Post Delete는 type `postDeleteWorkflow`·ID `post-delete:{postId}`, Repost Delete는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`를 사용해야 한다(MUST). Profile Update Workflow type은 `profileUpdateEffectsWorkflow`를 사용하고 Temporal이 요구하는 Workflow ID에는 자동 생성한 update identity를 그대로 전달해야 한다(MUST). Reaction create/delete Workflow는 각각 `reactionCreateEffectsWorkflow`와 `reactionDeleteEffectsWorkflow` type을 사용해야 한다(MUST). Pair transaction·Notification·Fedify effects Activity는 production registry에 정적으로 포함해야 하며(MUST). Entrypoint 자체는 이 registry로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** Worker production entrypoint를 실행한다
- **THEN** 시스템은 compile-time에 구성된 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity, Profile Update, Reaction Create/Delete, directed pair Follow lifecycle 및 exact-row Follow removal Workflow registry와 하나의 task queue로 Worker host를 정확히 한 번 시작한다
- **AND** caller가 registration을 전달하거나 두 번째 Worker host를 시작할 수 있는 public startup API를 제공하지 않는다
- **AND** production bundle이 pair transition, Follow Notification·cleanup과 Local-origin Follow/Undo queue handoff에 필요한 Activity를 포함한다

#### Scenario: 기존 Post Create 외부 identity 보존

- **WHEN** Profile Update, Reaction 또는 Follow pair Workflow source를 기존 Worker registry에 추가한다
- **THEN** Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 변경하지 않는다
- **AND** Repost create는 `postRepostWorkflow`/`post-repost:{postId}`, Post Delete는 `postDeleteWorkflow`/`post-delete:{postId}`, Repost Delete는 `repostDeleteWorkflow`/`repost-delete:{postId}`를 유지한다

#### Scenario: Profile Update 외부 identity

- **WHEN** actor-visible Profile 변경이 commit되어 Effects Workflow를 시작한다
- **THEN** Workflow type은 `profileUpdateEffectsWorkflow`다
- **AND** Workflow ID는 자동 생성된 update identity 자체다
- **AND** Activity는 같은 update identity를 canonical `Update(Person)` IRI에 재사용한다

#### Scenario: domain별 registration 조립

- **WHEN** Repost create, Post Delete, Repost Delete, Profile Update, Reaction create/delete 또는 Follow pair Workflow와 Activity를 Worker registry에 추가한다
- **THEN** event별 Workflow 구현과 type·identity 계약은 분리된 source module에 남고 production entrypoint가 고정 registry로 조립한다
- **AND** Workflow마다 Worker host, task queue, Core contract file 또는 범용 runtime abstraction을 새로 만들지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint와 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime 또는 test-only business registration으로 business registration 부재를 숨기지 않는다
- **AND** production bundle 검증은 pair lifecycle Workflow, exact-row Follow removal Workflow, Activity alias와 task queue를 확인하고 테스트 전용 export만으로 통과하지 않는다

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

### Requirement: Worker는 shared `kosmo_runtime` 표준 PG source를 사용한다

**Authority / Provenance:** `docs/domain/decisions/0024-application-policy-and-runtime-db-boundary.md`, `docs/architecture/core-services.md`, `PROD-780`. 항상 렌더되는 Temporal Worker Deployment는 API 역할, legacy Worker 역할과 Fedify 역할의 별도 credential values가 아니라 새 `kosmo_runtime`의 표준 `PGHOST`/`PGPORT`/`PGUSER`/`PGDATABASE`/`PGPASSWORD` source를 process 기본 DB로 사용해야 한다(MUST). `DATABASE_URL`/`DATABASE_PASSWORD`, 별도 Worker credential selector, `WORKER_DATABASE_*` application connection 또는 Fedify DB context를 만들거나 Worker runtime registration·lifecycle을 이 change에서 변경해서는 안 된다(MUST NOT).

#### Scenario: Worker가 runtime source를 사용함

- **WHEN** 유효한 immutable release image로 Worker component를 렌더한다
- **THEN** Deployment는 기존 direct read-write Service, `PGPORT=5432`, `PGUSER=kosmo_runtime`, `PGDATABASE=kosmo`와 release별 runtime Secret `PGPASSWORD` ref를 가져야 한다
- **AND** `DATABASE_URL`/`DATABASE_PASSWORD`, API/legacy Worker/Fedify 역할별 URL·password selector, `WORKER_DATABASE_*`와 `FEDIFY_DATABASE_*`를 별도 application 입력으로 투영하지 않아야 한다

#### Scenario: runtime source의 부분 구성

- **WHEN** historical API, Worker 또는 Fedify URL·password selector를 일부만 제공하거나 activation 값을 추가·생략한 채 chart를 렌더한다
- **THEN** Worker는 역할별 selector를 조합하거나 owner fallback을 사용하지 않고 chart-derived `kosmo_runtime` PG\* source를 사용해야 한다
- **AND** Worker registration, startup, readiness, shutdown과 Temporal task behavior는 이 role 전환으로 변경되지 않아야 한다

### Requirement: Reaction Effects Worker 등록과 lifecycle

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-723` — Worker의 단일 production entrypoint는 Reaction Create Effects Workflow, Reaction Delete Effects Workflow와 필요한 Notification·ActivityPub Activities를 기존 task queue에 compile-time 등록해야 한다(MUST). 이 등록은 runtime enable flag나 테스트 전용 export에 의존해서는 안 된다(MUST NOT).

#### Scenario: Worker 시작

- **WHEN** Worker process가 유효한 Temporal과 database 환경으로 시작한다
- **THEN** 기존 하나의 Worker instance가 Reaction create/delete Workflow와 Activities를 함께 poll한다

#### Scenario: Activity retry

- **WHEN** accepted Reaction Workflow의 Activity가 재시도 가능한 오류를 반환한다
- **THEN** Worker는 기존 bounded Activity retry 정책으로 같은 입력을 다시 실행한다

#### Scenario: Worker 재시작

- **WHEN** Reaction Workflow 실행 중 Worker process가 종료되고 다시 시작한다
- **THEN** Temporal은 완료되지 않은 Activity를 재개할 수 있다
- **AND** Workflow는 application process-local callback에 의존하지 않는다

#### Scenario: 정상 종료

- **WHEN** Worker가 종료 신호를 받는다
- **THEN** 기존 drain과 connection close 순서가 Reaction Workflow 등록에도 동일하게 적용된다

### Requirement: Real Temporal integration boundary

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-720 — The test runtime MUST exercise the same Workflow registry and Activity composition as the production Worker. A test-only no-op client, direct transaction Activity call, or receipt cleanup shortcut MUST NOT stand in for the pair lifecycle's Update-with-Start boundary.

#### Scenario: Real Update-with-Start admission

- **WHEN** an integration test sends a Follow Update-with-Start request
- **THEN** a real Temporal server admits the deterministic pair Workflow and the production Worker executes the transaction Activity
