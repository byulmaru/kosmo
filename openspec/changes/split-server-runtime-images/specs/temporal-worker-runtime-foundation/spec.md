## MODIFIED Requirements

### Requirement: 고정 business registration과 singleton Worker host

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-725`, `PROD-665`, `PROD-723`, `PROD-831`. 시스템은 전용 Worker final image에서 사전 생성된 host JavaScript와 Workflow bundle을 실행하더라도 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registry와 task queue를 정확히 하나 제공해야 한다(MUST). Registry는 Post Create, Repost create, Post Delete, Repost Delete, Profile Update Effects, Reaction Create Effects와 Reaction Delete Effects Workflow·Activity를 함께 등록하고 event별 Workflow source를 정적으로 조립해야 한다(MUST). 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 유지해야 하며(MUST), Repost create는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Post Delete는 type `postDeleteWorkflow`·ID `post-delete:{postId}`, Repost Delete는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`를 사용해야 한다(MUST). Profile Update Workflow type은 `profileUpdateEffectsWorkflow`를 사용하고 Temporal이 요구하는 Workflow ID에는 자동 생성한 update identity를 그대로 전달해야 한다(MUST). Reaction create/delete Workflow는 각각 `reactionCreateEffectsWorkflow`와 `reactionDeleteEffectsWorkflow` type을 사용해야 한다(MUST). Entrypoint 자체는 이 registry로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT). Artifact packaging과 image 분리는 이 registration, task queue와 Workflow 외부 identity를 변경해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** 전용 Worker final image가 사전 생성된 host JavaScript와 Workflow bundle 및 유효한 runtime 환경으로 실행된다
- **THEN** 시스템은 compile-time에 구성된 Post Create, Repost create, Post Delete, Repost Delete, Profile Update Effects, Reaction Create Effects와 Reaction Delete Effects Workflow·Activity registry 및 하나의 task queue로 Worker host를 정확히 한 번 시작한다
- **AND** caller가 registration을 전달하거나 두 번째 Worker host를 시작할 수 있는 public startup API를 제공하지 않는다

#### Scenario: 기존 Post Create 외부 identity 보존

- **WHEN** Profile Update 또는 Reaction Effects Workflow source를 build artifact와 기존 Worker registry에 추가한다
- **THEN** Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 변경하지 않는다
- **AND** Repost create는 `postRepostWorkflow`/`post-repost:{postId}`, Post Delete는 `postDeleteWorkflow`/`post-delete:{postId}`, Repost Delete는 `repostDeleteWorkflow`/`repost-delete:{postId}`를 유지한다

#### Scenario: Profile Update 외부 identity

- **WHEN** actor-visible Profile 변경이 commit되어 Effects Workflow를 시작한다
- **THEN** Workflow type은 `profileUpdateEffectsWorkflow`다
- **AND** Workflow ID는 자동 생성된 update identity 자체다
- **AND** Activity는 같은 update identity를 canonical `Update(Person)` IRI에 재사용한다

#### Scenario: domain별 registration 조립

- **WHEN** Repost create, Post Delete, Repost Delete, Profile Update 또는 Reaction create/delete Workflow와 Activity를 Worker registry와 사전 생성 bundle에 추가한다
- **THEN** event별 Workflow 구현과 type·identity 계약은 분리된 source module에 남고 production entrypoint가 고정 registry로 조립한다
- **AND** Workflow마다 Worker host, task queue, Core contract file 또는 범용 runtime abstraction을 새로 만들지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint, 사전 생성 bundle과 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime 또는 test-only business registration으로 business registration 부재를 숨기지 않는다

### Requirement: 등록된 Worker의 health와 종료 lifecycle

**Authority / Provenance:** `PROD-730`, `PROD-831`. 시스템은 전용 Worker final image에서 실제 Worker registration을 실행할 때 재사용할 HTTP liveness/readiness와 SIGTERM graceful shutdown 경계를 제공해야 한다(MUST). 사전 생성 host JavaScript와 Workflow bundle 및 image dependency 분리는 이 health/lifecycle 계약을 변경해서는 안 된다(MUST NOT). Liveness는 process가 동작 중인지 나타내고, readiness는 Temporal Worker가 task polling을 받을 준비가 된 뒤에만 성공하며 종료가 시작되면 실패로 전환해야 한다(MUST). Foundation은 connect/create 중 SIGTERM이 process에 흡수되지 않는 경계를 package-level child-process test로 검증해야 하며(MUST), 실제 RUNNING 이후 readiness 전이와 Temporal task drain 통합 검증은 Worker를 활성화하는 첫 business capability가 수행해야 한다(MUST).

#### Scenario: Worker startup 중 SIGTERM 수신

- **WHEN** 전용 Worker final image의 Temporal connection 또는 Worker 생성이 완료되기 전에 process가 SIGTERM을 수신한다
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

**Authority / Provenance:** `PROD-730`, `PROD-831`. Kosmo Worker는 API/Web/Fedify consumer/migration과 분리된 전용 final image를 사용해야 하며(MUST). 해당 image는 Worker package의 production 실행에 필요한 사전 생성 host JavaScript, 사전 생성 Workflow bundle과 target Linux/ARM64의 최소 runtime dependency만 포함하고 고정 Worker entrypoint를 제공해야 한다(MUST). Worker image는 TypeScript source, `tsx`, 범용 workspace `node_modules`, development dependency 또는 다른 runtime을 선택하는 공통 command dispatcher를 포함해서는 안 된다(MUST NOT).

#### Scenario: Worker image command 선택

- **WHEN** 전용 Worker final image를 Worker command로 실행한다
- **THEN** image entrypoint는 `apps/worker`의 사전 생성 production host JavaScript를 실행한다
- **AND** host는 build 단계에서 생성된 Workflow bundle과 target runtime dependency를 사용한다

#### Scenario: Worker image에 TypeScript 실행 경로가 없음

- **WHEN** 전용 Worker final image의 entrypoint와 filesystem을 검사한다
- **THEN** Worker는 `tsx` 또는 TypeScript source를 resolution하지 않고 시작한다
- **AND** image에는 Worker가 사용하지 않는 workspace-wide dependency와 development dependency가 없다

### Requirement: Application workload의 상시 Worker component

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-831`. Kosmo Helm chart는 유효한 immutable runtime image set이 지정된 모든 환경에서 API, Web, Fedify consumer와 함께 전용 Worker final image를 사용하는 Worker Deployment 및 전용 ServiceAccount를 항상 생성해야 한다(MUST). Worker 또는 chart-wide workload activation key로 이 component를 숨겨서는 안 된다(MUST NOT). dev는 1개, prod는 2개의 replica를 기본값으로 render하고, 전용 Worker image의 명시적 command, HTTP liveness/readiness probe와 환경별 Temporal endpoint·namespace를 전달해야 한다(MUST). Worker image와 image set의 digest는 같은 승인된 release source에 속해야 하며(MUST). production 실제 sync·rollout은 별도 사용자 승인 없이는 수행해서는 안 된다(MUST NOT).

#### Scenario: dev application workload render

- **WHEN** 유효한 immutable runtime image set과 함께 dev chart를 render한다
- **THEN** API, Web, Fedify consumer와 함께 전용 Worker image를 사용하는 1개 replica, Worker command, HTTP probes 및 dev Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 activation key 없이 render된다

#### Scenario: prod application workload render

- **WHEN** 유효한 immutable runtime image set과 함께 prod chart를 render한다
- **THEN** API, Web, Fedify consumer와 함께 전용 Worker image를 사용하는 2개 replica, Worker command, HTTP probes 및 prod Temporal endpoint·namespace를 가진 Deployment와 ServiceAccount가 activation key 없이 render된다

#### Scenario: legacy activation values are inert

- **WHEN** 유효한 immutable runtime image set과 함께 과거 workload 또는 Worker activation 값을 추가해 chart를 render한다
- **THEN** API, Web, Fedify consumer와 Worker가 모두 render되고 과거 값이 workload 존재 여부를 바꾸지 않는다

#### Scenario: Worker lifecycle의 dev 검증

- **WHEN** 첫 Post Create effects registration을 포함한 exact revision의 전용 Worker image를 dev에 적용한다
- **THEN** Worker가 실제 task queue를 poll하는 RUNNING 상태에서 readiness가 성공한다
- **AND** restart 뒤 accepted effects Workflow가 복구되고 SIGTERM 시 readiness가 실패한 뒤 진행 중 task의 graceful drain을 시도한다
