## MODIFIED Requirements

### Requirement: 고정 business registration과 singleton Worker host

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-725`, `PROD-665`. 시스템은 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registry와 task queue를 정확히 하나 제공해야 한다(MUST). Registry는 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity와 새 Profile Update Effects Workflow·Activity를 함께 등록하고 event별 Workflow source를 정적으로 조립해야 한다(MUST). 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 유지해야 하며(MUST), Repost create는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Post Delete는 type `postDeleteWorkflow`·ID `post-delete:{postId}`, Repost Delete는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`를 사용해야 한다(MUST). Profile Update Workflow type은 `profileUpdateEffectsWorkflow`를 사용하고 Temporal이 요구하는 Workflow ID에는 자동 생성한 update identity를 그대로 전달해야 한다(MUST). Entrypoint 자체는 이 registry로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** Worker production entrypoint를 실행한다
- **THEN** 시스템은 compile-time에 구성된 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity와 Profile Update Effects Workflow·Activity registry 및 하나의 task queue로 Worker host를 정확히 한 번 시작한다
- **AND** caller가 registration을 전달하거나 두 번째 Worker host를 시작할 수 있는 public startup API를 제공하지 않는다

#### Scenario: 기존 Post Create 외부 identity 보존

- **WHEN** Profile Update Workflow source를 기존 Worker registry에 추가한다
- **THEN** Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 변경하지 않는다
- **AND** Repost create는 `postRepostWorkflow`/`post-repost:{postId}`, Post Delete는 `postDeleteWorkflow`/`post-delete:{postId}`, Repost Delete는 `repostDeleteWorkflow`/`repost-delete:{postId}`를 유지한다

#### Scenario: Profile Update 외부 identity

- **WHEN** actor-visible Profile 변경이 commit되어 Effects Workflow를 시작한다
- **THEN** Workflow type은 `profileUpdateEffectsWorkflow`다
- **AND** Workflow ID는 자동 생성된 update identity 자체다
- **AND** Activity는 같은 update identity를 canonical `Update(Person)` IRI에 재사용한다

#### Scenario: domain별 registration 조립

- **WHEN** Repost create, Post Delete, Repost Delete 또는 Profile Update Workflow와 Activity를 Worker registry에 추가한다
- **THEN** event별 Workflow 구현과 type·identity 계약은 분리된 source module에 남고 production entrypoint가 고정 registry로 조립한다
- **AND** Workflow마다 Worker host, task queue, Core contract file 또는 범용 runtime abstraction을 새로 만들지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint와 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime 또는 test-only business registration으로 business registration 부재를 숨기지 않는다
