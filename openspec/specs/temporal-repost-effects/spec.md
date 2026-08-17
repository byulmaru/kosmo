# temporal-repost-effects Specification

## Purpose

Repost 생성과 Post/Repost 삭제 transaction을 Core가 동기적으로 commit한 뒤, event별 Temporal Workflow가
Notification과 ActivityPub queue handoff를 독립적으로 재시도한다.

## Requirements

### Requirement: Core-owned Repost 생성·삭제 뒤 event-specific Workflow 시작

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-677`, `PROD-722`, `PROD-725` — Local GraphQL Repost는 Repost 상태를 specialized Core action transaction에 저장해야 하고(MUST), verified ActivityPub Announce·Undo는 Repost 상태와 필요한 current ActivityPub mapping을 specialized Core action의 같은 transaction에서 저장해야 한다(MUST). 최초 실제 Repost 생성 commit 뒤에는 type `postRepostWorkflow`·ID `post-repost:{postId}`인 Repost Workflow를 시작해야 하고, Content가 있는 Post·Reply·Quote의 최초 Tombstone commit 뒤에는 type `postDeleteWorkflow`·ID `post-delete:{postId}`인 Post Delete Workflow를, Content가 없는 pure Repost의 최초 Tombstone commit 뒤에는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`인 Repost Delete Workflow를 시작해야 한다(MUST). 세 Workflow input은 모두 `{ postId, origin: LOCAL | ACTIVITYPUB }`여야 하며(MUST), Core는 committed relation shape로 시작할 Workflow를 선택하지만 discriminator를 input으로 전달하지 않는다. PROD-722에서 배포한 Post Create Workflow type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`는 변경하지 않아야 한다(MUST). Delete caller가 database handle, 반환형 `postCommit` 또는 후속 효과를 조립해서는 안 된다(MUST NOT).

#### Scenario: Local Repost 최초 생성 commit

- **WHEN** Local GraphQL Repost action이 새 Active Repost를 commit한다
- **THEN** Core action은 Repost Workflow start를 시도한다
- **AND** GraphQL은 기존 committed Repost payload를 반환한다

#### Scenario: 기존 Post Create 외부 identity 호환성

- **WHEN** Worker registry가 Post Create와 새 Repost/Delete Workflow를 함께 등록한다
- **THEN** Post Create Workflow type은 `postCreateEffectsWorkflow`로 유지된다
- **AND** Post Create Workflow ID는 `post-create-effects:{postId}`로 유지되고 `post-repost:{postId}`·`post-delete:{postId}`·`repost-delete:{postId}`와 독립된다

#### Scenario: verified Announce materialization commit

- **WHEN** verified ActivityPub Announce가 Repost와 current ActivityPub mapping을 같은 Core transaction에서 commit한다
- **THEN** Core action은 `origin=ACTIVITYPUB`인 Repost Workflow start를 시도한다
- **AND** inbound handler는 기존 acknowledgement 경계를 유지한다

#### Scenario: 최초 Post 또는 Repost Delete commit

- **WHEN** Local GraphQL 또는 verified ActivityPub Delete/Undo가 Active Content-bearing Post·Reply·Quote 또는 pure Repost를 Tombstone으로 처음 전이해 commit한다
- **THEN** Core action은 Content-bearing Post·Reply·Quote이면 `origin=LOCAL | ACTIVITYPUB`인 `postDeleteWorkflow` start를, pure Repost이면 같은 origin의 `repostDeleteWorkflow` start를 시도한다
- **AND** 두 Delete Workflow input은 모두 `{ postId, origin }`이고, Workflow는 Tombstone row에 보존된 관계 projection을 다시 읽는다
- **AND** Post Delete Workflow는 `origin=LOCAL`일 때 canonical Delete(Note)를 실행하고 `origin=ACTIVITYPUB`일 때 outbound effect 없이 완료한다
- **AND** Repost Delete Workflow는 Notification cleanup을 항상 실행하고 `origin=LOCAL`일 때 canonical Undo를 추가하며 `origin=ACTIVITYPUB`일 때 cleanup만 실행한다

#### Scenario: duplicate, no-op 또는 rollback

- **WHEN** Repost create가 기존 Active identity로 수렴하거나 Content/Repost delete가 이미 Tombstone인 결과로 수렴하거나 transaction이 rollback된다
- **THEN** 시스템은 새 Repost create, Post Delete 또는 Repost Delete Workflow를 시작하지 않는다
- **AND** Notification이나 Fedify queue 효과를 직접 실행하지 않는다

### Requirement: Repost/Delete별 stable Workflow identity와 start gap 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `PROD-677`, `PROD-725` — Repost 생성, Post Delete와 Repost Delete Workflow ID는 committed Post ID와 각 event 경계에서 안정적으로 파생되어야 하며(MUST), 한 Repost의 생성과 삭제가 종료된 같은 Workflow ID를 공유해서는 안 된다(MUST NOT). Repost 생성은 `post-repost:{postId}`, Post Delete는 `post-delete:{postId}`, Repost Delete는 `repost-delete:{postId}`를 사용한다. 각 Workflow input은 `{ postId, origin }`이고, 같은 event의 중복 start는 기존 execution으로 수렴하며 종료된 같은 event ID는 재사용하지 않아야 한다(MUST NOT). commit 뒤 process 종료, Temporal 연결 오류 또는 start 실패는 허용된 효과 유실 경계로 관측하되 committed domain 결과와 caller 성공을 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: stable Repost와 Delete identities

- **WHEN** 같은 Repost의 생성과 이후 삭제 event가 각각 commit된다
- **THEN** Repost create, Post Delete와 Repost Delete Workflow는 같은 Post ID를 포함하면서 event 경계로 구분된다
- **AND** 각 event의 retry는 자기 stable Workflow identity를 유지한다

#### Scenario: 같은 event의 중복 start

- **WHEN** 같은 committed Repost create, Post Delete 또는 Repost Delete event의 Workflow start 요청이 중복된다
- **THEN** 시스템은 기존 execution 또는 동등한 idempotent start 결과로 수렴한다
- **AND** 해당 event의 Workflow를 별도로 중복 실행하지 않는다

#### Scenario: commit 뒤 start 실패

- **WHEN** Repost 또는 Post/Repost Delete transition commit 뒤 process가 종료되거나 Workflow start가 실패한다
- **THEN** 시스템은 committed Repost와 GraphQL/ActivityPub 성공 결과를 유지한다
- **AND** 실패를 관측하지만 command receipt, transactional outbox·relay 또는 자동 backfill을 추가하지 않는다

### Requirement: Repost Notification lifecycle의 멱등 Activity

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-677`, `PROD-725` — accepted Repost Workflow는 기존 Recipient·self suppression·visibility·uniqueness 정책으로 Repost Notification을 멱등 생성해야 하며(MUST), accepted Repost Delete Workflow는 Repost ID를 source로 하는 Notification을 멱등 정리해야 한다(MUST). Post Delete Workflow는 Repost Notification Activity를 실행하지 않는다. 이는 canonical Best Effort projection이며 unavailable source의 잔여 row는 모든 API surface에서 숨겨야 한다(MUST). create/delete를 직렬화하는 `FOR UPDATE` 또는 row lock을 추가하지 않아야 한다(MUST NOT). 두 효과는 Core transaction이나 caller에서 직접 실행해서는 안 된다(MUST NOT).

#### Scenario: 다른 Local Profile의 Post Repost

- **WHEN** 다른 Local Profile의 Post에 대한 Repost Workflow가 accepted된다
- **THEN** Notification Activity는 Repost Post를 source, Source Author를 Recipient, Repost Author를 Related Profile로 사용해 Repost Notification을 멱등 생성한다
- **AND** 반복 Activity 실행에도 같은 Recipient, kind와 source 조합의 item은 하나만 존재한다

#### Scenario: self Repost 또는 Remote Recipient

- **WHEN** Repost Author와 Source Author가 같거나 Source Author가 Remote Profile이다
- **THEN** Notification Activity는 committed Repost를 유지하고 item을 만들지 않는 성공한 no-op으로 끝난다

#### Scenario: Repost Delete cleanup

- **WHEN** Repost Delete Workflow가 accepted된다
- **THEN** Notification Activity는 Repost kind와 committed Repost ID로 대응 item을 멱등 삭제한다
- **AND** 이미 없거나 숨겨진 item의 반복 cleanup도 성공한 no-op으로 끝난다

#### Scenario: Post Delete has no Repost Notification cleanup

- **WHEN** Post Delete Workflow가 accepted된다
- **THEN** Workflow는 Repost Notification cleanup을 실행하지 않는다
- **AND** `origin=LOCAL`이면 canonical Delete(Note) Activity만 적용하고 `origin=ACTIVITYPUB`이면 outbound Activity 없이 완료한다

#### Scenario: Notification create/delete 경합

- **WHEN** accepted create effects의 Notification projection과 delete effects의 cleanup이 서로 다른 시점에 경합한다
- **THEN** 시스템은 canonical Best Effort semantics를 유지하고 stale Notification row가 남아도 Repost가 unavailable한 동안 모든 API surface에서 숨긴다
- **AND** create/delete를 직렬화하기 위해 `FOR UPDATE` 또는 row lock을 사용하지 않는다

### Requirement: Local-origin Announce와 Undo queue handoff Activity

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-448`, `PROD-677`, `PROD-725` — accepted Repost Workflow는 `origin=LOCAL`일 때 기존 canonical Announce identity·audience·recipient 규칙으로, accepted Post Delete Workflow는 `origin=LOCAL`일 때 canonical Delete(Note)를, accepted Repost Delete Workflow는 `origin=LOCAL`일 때 같은 Announce를 가리키는 canonical Undo를 Fedify PostgreSQL MessageQueue producer에 handoff해야 한다(MUST). Repost Workflow와 Post/Repost Delete Workflow가 `origin=ACTIVITYPUB`이면 outbound echo를 만들면 안 된다(MUST NOT). Activity 성공 경계는 queue acceptance이고, acceptance 뒤 remote retry·ordering은 Fedify가 소유해야 한다(MUST).

#### Scenario: Local create Announce handoff

- **WHEN** Local Repost Workflow가 accepted되고 canonical projection이 가능하다
- **THEN** Activity는 Repost ID에서 파생한 같은 Announce identity로 Fedify queue handoff를 재시도한다
- **AND** remote delivery를 직접 수행하지 않는다

#### Scenario: Local Post Delete handoff

- **WHEN** Local Post Delete Workflow가 accepted된다
- **THEN** Delete Activity는 Tombstone row에 보존된 Content Post identity로 canonical Delete(Note)를 같은 ordering domain에 handoff한다
- **AND** Repost Notification cleanup이나 Undo를 실행하지 않는다
- **AND** Author Profile이 더 이상 `ACTIVE`가 아니어도 보존된 actor identity와 기존 signing key로 handoff한다

#### Scenario: Local Repost Delete Undo handoff

- **WHEN** Local Repost Delete Workflow가 accepted된다
- **THEN** Activity는 Tombstone row에 보존된 Repost와 Source identity로 원본 Announce를 가리키는 Undo를 같은 ordering domain에 handoff한다
- **AND** Author Profile이 더 이상 `ACTIVE`가 되어 있지 않다는 이유만으로 committed Undo를 no-op하지 않는다
- **AND** Source의 현재 lifecycle 때문에 과거 Announce identity를 새로 만들거나 변경하지 않는다

#### Scenario: Announce acceptance와 Tombstone 경합

- **WHEN** Repost Announce Activity가 Active projection을 읽은 뒤 queue acceptance 전후에 같은 Repost가 Tombstone으로 commit된다
- **THEN** Activity는 late accepted Announce 뒤 같은 canonical identity와 ordering key의 Undo를 handoff해 삭제 상태로 수렴한다
- **AND** 이 순서를 위해 Post transaction에 row lock이나 queue I/O를 추가하지 않는다

#### Scenario: ActivityPub origin echo suppression

- **WHEN** verified Announce에서 시작한 Repost Workflow 또는 verified Delete/Undo에서 시작한 Post/Repost Delete Workflow가 `origin=ACTIVITYPUB`으로 실행된다
- **THEN** Workflow는 outbound Announce·Undo Activity를 실행하지 않는다
- **AND** Repost Delete는 Notification cleanup만 적용하고 Post Delete는 outbound Activity 없이 완료한다

#### Scenario: 모호한 queue acknowledgement

- **WHEN** queue acceptance acknowledgement가 모호해 Activity가 같은 handoff를 재시도한다
- **THEN** 시스템은 같은 canonical activity identity를 사용한다
- **AND** duplicate enqueue나 remote request가 없다는 cross-system exactly-once를 주장하지 않는다

### Requirement: 독립 effects와 caller 성공 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `PROD-677`, `PROD-725` — Notification과 federation handoff가 모두 적용되는 Repost 또는 Repost Delete Workflow는 두 Activity를 독립적으로 시작하고 각 최종 결과를 수집해야 하며(MUST), 한 Activity의 terminal failure가 다른 Activity 시도를 막아서는 안 된다(MUST NOT). Post Delete Workflow의 Delete(Note) handoff도 자체 retry 경계를 유지해야 한다. Activity retry는 유한해야 하며(MUST), effects 실패가 committed Post나 기존 GraphQL/ActivityPub 성공 의미를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 한 effect의 terminal failure

- **WHEN** Notification 또는 Fedify handoff Activity 하나가 retry를 소진한다
- **THEN** Workflow는 다른 적용 가능한 Activity의 실행과 결과 수집을 계속한다
- **AND** committed Post와 caller 성공 결과를 유지한다

#### Scenario: 모든 effect 성공

- **WHEN** 적용 가능한 Notification과 Fedify handoff Activity가 queue 또는 database 경계에서 성공한다
- **THEN** Workflow는 두 결과를 수집하고 종료한다
- **AND** Fedify queue acceptance 뒤 remote delivery 완료를 기다리지 않는다
