## MODIFIED Requirements

### Requirement: 고정 business registration과 singleton Worker host

**Authority / Provenance:** `docs/architecture/core-services.md`, `PROD-321`, `PROD-665`, `PROD-720`, `PROD-722`, `PROD-723`, `PROD-725`. 시스템은 Worker production entrypoint에 compile-time의 실제 business Workflow·Activity registry와 task queue를 정확히 하나 제공해야 한다(MUST). Registry는 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity와 Profile Update Effects, Reaction Create/Delete Effects, directed pair Follow lifecycle Workflow 및 exact-row Follow removal Workflow를 함께 등록하고 event별 Workflow source를 정적으로 조립해야 한다(MUST). 기존 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 유지해야 하며(MUST), Repost create는 type `postRepostWorkflow`·ID `post-repost:{postId}`, Post Delete는 type `postDeleteWorkflow`·ID `post-delete:{postId}`, Repost Delete는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`를 사용해야 한다(MUST). Profile Update Workflow type은 `profileUpdateEffectsWorkflow`를 사용하고 Temporal이 요구하는 Workflow ID에는 자동 생성한 update identity를 그대로 전달해야 한다(MUST). Reaction create/delete Workflow는 각각 `reactionCreateEffectsWorkflow`와 `reactionDeleteEffectsWorkflow` type을 사용해야 한다(MUST). Follow pair lifecycle은 `profileFollowPairWorkflow`와 결정적 `profile-follow-pair:{followerProfileId}:{followeeProfileId}` identity를 사용해야 한다(MUST). Pair transaction·Notification·Fedify effects Activity는 production registry에 정적으로 포함해야 하며(MUST). Entrypoint 자체는 이 registry로 process-global Worker host를 정확히 한 번 시작해야 하며(MUST), exported `runWorker`/`startWorker` lifecycle, optional registration, registration 부재를 검사하는 정상 실행 경로, idle Worker 상태 또는 같은 process에서 Worker host를 다시 시작할 수 있는 범용 startup API를 제공해서는 안 된다(MUST NOT).

#### Scenario: Production Worker 시작

- **WHEN** Worker production entrypoint를 실행한다
- **THEN** 시스템은 compile-time에 구성된 기존 Post Create, Repost create, Post Delete, Repost Delete Workflow·Activity, Profile Update, Reaction Create/Delete, directed pair Follow lifecycle Workflow, exact-row Follow removal Workflow와 하나의 task queue로 Worker host를 정확히 한 번 시작한다
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

#### Scenario: Follow pair lifecycle 외부 identity

- **WHEN** Follow, Follow Request, approval, remote Accept, reject, cancel 또는 applicable inbound transition이 admission된다
- **THEN** 새 lifecycle은 `profileFollowPairWorkflow`와 `profile-follow-pair:{followerProfileId}:{followeeProfileId}` identity를 사용한다
- **AND** active run에는 `USE_EXISTING`, completed run에는 `ALLOW_DUPLICATE`를 사용한다
- **AND** Follow effect는 별도 create/delete Workflow를 만들지 않고 pair lifecycle 또는 exact-row removal Workflow 안에서 정산한다

#### Scenario: domain별 registration 조립

- **WHEN** Repost create, Post Delete, Repost Delete, Profile Update, Reaction create/delete 또는 Follow pair Workflow와 Activity를 Worker registry에 추가한다
- **THEN** event별 Workflow 구현과 type·identity 계약은 분리된 source module에 남고 production entrypoint가 고정 registry로 조립한다
- **AND** Workflow마다 Worker host, task queue, Core contract file 또는 범용 runtime abstraction을 새로 만들지 않는다

#### Scenario: 실제 effects registration 없는 build 방지

- **WHEN** Worker package의 production entrypoint와 registration을 정적·자동화 검증한다
- **THEN** entrypoint에는 optional 또는 empty registration 경로가 존재하지 않는다
- **AND** smoke Workflow·검증 전용 task queue·health-only idle runtime 또는 test-only business registration으로 business registration 부재를 숨기지 않는다
- **AND** production bundle 검증은 pair lifecycle·exact-row removal Workflow, Activity alias와 task queue를 확인하고 테스트 전용 export만으로 통과하지 않는다

#### Scenario: production bundle에서 Activity retry

- **WHEN** production `workflowsPath`와 static Activities registry로 수락된 pair transition 또는 Follow effect Activity가 일시적으로 실패한다
- **THEN** Worker는 기존 bounded Temporal Activity retry 정책으로 같은 pair identity와 exact source identity를 다시 실행한다
- **AND** queue acceptance 뒤의 remote delivery retry는 production Worker가 아니라 Fedify consumer가 소유한다

#### Scenario: production bundle Worker 재시작과 drain

- **WHEN** accepted pair lifecycle 또는 Follow effect 처리 중 production Worker가 종료·재시작되거나 graceful drain에 들어간다
- **THEN** Temporal은 완료되지 않은 Activity를 같은 Workflow ID와 input으로 재개할 수 있다
- **AND** drain은 이미 수락된 Workflow의 retry/restart를 process-local callback 없이 보존하고 기존 connection close 순서를 따른다
- **AND** Worker 재시작은 두 번째 singleton host, 별도 Follow task queue 또는 optional registration을 만들지 않는다

## ADDED Requirements

### Requirement: Real Temporal integration boundary

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-720 — The test runtime MUST exercise the same Workflow registry and Activity composition as the production Worker. A test-only no-op client, direct transaction Activity call, or receipt cleanup shortcut MUST NOT stand in for the pair lifecycle's Update-with-Start boundary.

#### Scenario: Real Update-with-Start admission

- **WHEN** an integration test sends a Follow Update-with-Start request
- **THEN** a real Temporal server admits the deterministic pair Workflow and the production Worker executes the transaction Activity

#### Scenario: Early result and Pending continuation

- **WHEN** a test delays an effect after a Follow or Follow Request commit
- **THEN** the Update result is observed before the effect completes, and an approval, accept, reject, cancel, or applicable inbound terminal Update can continue the Pending pair Workflow

#### Scenario: FIFO and failure behavior

- **WHEN** a test overlaps Pending creation effects with a terminal transition or fails one effect sibling
- **THEN** the real Workflow preserves FIFO transition order, attempts applicable siblings, keeps Pending alive after a Pending effect failure, and closes after a terminal transition without rolling back the DB result

#### Scenario: Replay and restart evidence

- **WHEN** a Worker is stopped after a pair transition commits and before all effects finish
- **THEN** a second production-configured Worker replays the same history, resumes the lifecycle or remaining effects, and the test verifies no duplicate Follow or Follow Request transition
