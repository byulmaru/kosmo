## MODIFIED Requirements

### Requirement: 고정 business registration과 singleton Worker host

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-722`, `PROD-725`. 시스템은 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registry와 task queue를 정확히 하나 제공해야 한다(MUST). registry는 기존 Post Create Workflow와 새 Repost, Delete Workflow·Activity를 함께 등록하고 event별 Workflow source를 정적으로 조립해야 한다(MUST). 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 유지해야 하며(MUST), Repost는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Delete는 type `postDeleteWorkflow`·ID `post-delete:{postId}`를 사용해야 한다(MUST). entrypoint 자체는 이 registry로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** Worker production entrypoint를 실행한다
- **THEN** 시스템은 compile-time에 구성된 기존 Post Create와 새 Repost/Delete Workflow·Activity registry 및 하나의 task queue로 Worker host를 정확히 한 번 시작한다
- **AND** caller가 registration을 전달하거나 두 번째 Worker host를 시작할 수 있는 public startup API를 제공하지 않는다

#### Scenario: 기존 Post Create 외부 identity 보존

- **WHEN** 새 Repost와 Delete Workflow source를 기존 Worker registry에 추가한다
- **THEN** Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 변경하지 않는다
- **AND** Repost는 `postRepostWorkflow`/`post-repost:{postId}`, Delete는 `postDeleteWorkflow`/`post-delete:{postId}`를 사용한다

#### Scenario: domain별 registration 조립

- **WHEN** Repost 또는 Delete Workflow와 Activity를 Worker registry에 추가한다
- **THEN** event별 Workflow 구현과 type·identity 계약은 분리된 source module에 남고 production entrypoint가 고정 registry로 조립한다
- **AND** workflow마다 Worker host, task queue 또는 범용 runtime abstraction을 새로 만들지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint와 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime으로 business registration 부재를 숨기지 않는다
