# temporal-repost-effects Specification

## Purpose

Repost 생성과 Post/Repost 삭제 transaction을 Core가 동기적으로 commit한 뒤, event별 Temporal Workflow가
Notification과 ActivityPub queue handoff를 독립적으로 재시도한다.

## Requirements

### Requirement: Core action이 committed transition 뒤 Workflow를 시작한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, PROD-677, PROD-722, PROD-725 — 시스템은 Local과 ActivityPub Repost 진입점이 하나의 public `repostPost` action을 사용하도록 해야 한다(MUST). action은 `origin = LOCAL | ACTIVITYPUB` 입력을 받고 자체 transaction에서 Repost를 저장해야 하며, ActivityPub 입력에서는 Announce URI와 delivery metadata를 일반 `createPost`와 같은 저장 경계에서 기존 `ActivityPubPosts` mapping에 기록해야 한다(MUST). 최초 실제 Repost 생성 commit 뒤에는 type `postRepostWorkflow`·ID `post-repost:{postId}`인 Repost Workflow를 시작해야 하고, Content-bearing Post·Reply·Quote의 최초 Tombstone commit 뒤에는 type `postDeleteWorkflow`·ID `post-delete:{postId}`인 Post Delete Workflow를, Content가 없는 pure Repost의 최초 Tombstone commit 뒤에는 type `repostDeleteWorkflow`·ID `repost-delete:{postId}`인 Repost Delete Workflow를 시작해야 한다(MUST). 세 Workflow input은 모두 `{ postId, origin: LOCAL | ACTIVITYPUB }`여야 하며(MUST), Core action이 자체 transaction과 commit 뒤 start 경계를 소유해야 한다(MUST). Delete caller가 database handle·`postCommit` 또는 후속 효과를 조립해서는 안 되며(MUST NOT), 별도 Repost materialization/Undo action도 추가하지 않아야 한다(MUST NOT).

#### Scenario: Local 또는 ActivityPub Repost 최초 생성 commit

- **WHEN** Local GraphQL 또는 verified ActivityPub Announce가 새 Active Repost를 commit한다
- **THEN** 공용 Repost action은 해당 `origin`으로 `post-repost:{postId}` Repost Workflow start를 시도한다
- **AND** GraphQL 또는 ActivityPub의 committed domain 결과와 acknowledgement 의미를 유지한다

#### Scenario: 기존 Post Create 외부 identity 호환성

- **WHEN** Worker registry가 Post Create와 새 Repost/Delete Workflow를 함께 등록한다
- **THEN** Post Create Workflow type은 `postCreateEffectsWorkflow`로 유지된다
- **AND** Post Create Workflow ID는 `post-create-effects:{postId}`로 유지되고 다른 event identity와 독립된다

#### Scenario: 최초 Post 또는 Repost Delete commit

- **WHEN** Local GraphQL 또는 verified ActivityPub Delete/Undo가 Active Content-bearing Post·Reply·Quote 또는 pure Repost를 Tombstone으로 처음 전이해 commit한다
- **THEN** 공용 `deletePost` action은 committed relation shape에 따라 Post Delete 또는 Repost Delete Workflow start를 시도한다
- **AND** 두 Delete Workflow input은 모두 `{ postId, origin }`이고 Workflow는 Tombstone row의 기존 관계를 다시 읽는다
- **AND** ActivityPub ingress의 mapping/actor resolution은 별도의 read-only 단계로 남는다

#### Scenario: duplicate, no-op 또는 rollback

- **WHEN** Repost create가 기존 Active identity로 수렴하거나 delete가 이미 Tombstone인 결과로 수렴하거나 transaction이 rollback된다
- **THEN** 시스템은 새 Repost create, Post Delete 또는 Repost Delete Workflow를 시작하지 않는다
- **AND** Notification이나 Fedify queue 효과를 직접 실행하지 않는다

#### Scenario: stable Repost와 Delete identities

- **WHEN** 같은 Repost의 생성과 이후 삭제 event가 각각 commit된다
- **THEN** Repost create, Post Delete와 Repost Delete Workflow는 같은 Post ID를 포함하면서 event 경계로 구분된다
- **AND** 각 event의 retry는 자기 stable Workflow identity를 유지한다

#### Scenario: commit 뒤 start 실패

- **WHEN** transition commit 뒤 process가 종료되거나 Workflow start가 실패한다
- **THEN** committed Repost/Tombstone과 GraphQL/ActivityPub 성공 결과를 유지한다
- **AND** 실패를 관측하지만 command receipt, transactional outbox·relay 또는 자동 backfill을 추가하지 않는다

### Requirement: stable Workflow identity와 start gap 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, PROD-677, PROD-725 — Repost 생성, Post Delete와 Repost Delete Workflow ID는 committed Post ID와 각 event 경계에서 안정적으로 파생되어야 한다(MUST). Repost 생성은 `post-repost:{postId}`, Post Delete는 `post-delete:{postId}`, Repost Delete는 `repost-delete:{postId}`를 사용한다. 같은 event의 중복 start는 기존 execution으로 수렴해야 하며(MUST), 종료된 같은 event ID를 다음 event에 재사용해서는 안 된다(MUST NOT). commit 뒤 process 종료, Temporal 연결 오류 또는 start 실패는 committed domain 결과와 caller 성공을 바꾸지 않고 관측해야 한다(MUST NOT).

#### Scenario: stable Repost와 Delete identities

- **WHEN** 같은 Repost의 생성과 이후 삭제 event가 각각 commit된다
- **THEN** Repost create와 해당 Delete Workflow는 같은 Post ID를 포함하면서 event 경계로 구분된다
- **AND** 각 event의 retry는 자기 stable Workflow identity를 유지한다

#### Scenario: commit 뒤 start 실패

- **WHEN** transition commit 뒤 process가 종료되거나 Workflow start가 실패한다
- **THEN** committed Repost/Tombstone과 GraphQL/ActivityPub 성공 결과를 유지한다
- **AND** transactional outbox, command receipt 또는 자동 backfill을 이 capability에 추가하지 않는다

### Requirement: Repost Notification lifecycle의 멱등 Activity

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-677, PROD-725 — accepted Repost Workflow는 기존 Recipient·self suppression·visibility·uniqueness 정책으로 Repost Notification을 멱등 생성해야 하며(MUST), accepted Repost Delete Workflow는 Repost ID를 source로 하는 Notification을 멱등 정리해야 한다(MUST). Post Delete Workflow는 Repost Notification Activity를 실행하지 않아야 한다(MUST NOT). Notification은 canonical Best Effort projection이며 unavailable source의 잔여 row는 모든 API surface에서 숨겨야 한다(MUST). create/delete를 직렬화하는 `FOR UPDATE` 또는 row lock을 추가하지 않아야 한다(MUST NOT).

#### Scenario: 다른 Local Profile의 Post Repost

- **WHEN** 다른 Local Profile의 Post에 대한 Repost Workflow가 accepted된다
- **THEN** Notification Activity는 기존 정책에 따라 Repost Notification을 멱등 생성한다

#### Scenario: self Repost 또는 Remote Recipient

- **WHEN** Repost Author와 Source Author가 같거나 Source Author가 Remote Profile이다
- **THEN** Notification Activity는 committed Repost를 유지하고 item을 만들지 않는 성공한 no-op으로 끝난다

#### Scenario: Repost Delete cleanup

- **WHEN** Repost Delete Workflow가 accepted된다
- **THEN** Notification Activity는 Repost kind와 committed Repost ID로 대응 item을 멱등 삭제한다
- **AND** 이미 없거나 숨겨진 item의 반복 cleanup도 성공한 no-op으로 끝난다

### Requirement: Local-origin queue handoff와 ActivityPub echo suppression

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-448`, `PROD-677`, `PROD-725` — accepted Repost Workflow는 `origin=LOCAL`일 때 canonical Announce를, accepted Post Delete Workflow는 `origin=LOCAL`일 때 canonical Delete(Note)를, accepted Repost Delete Workflow는 `origin=LOCAL`일 때 canonical Undo를 Fedify PostgreSQL MessageQueue에 handoff해야 한다(MUST). `origin=ACTIVITYPUB`인 Workflow는 outbound Announce·Delete·Undo echo를 만들면 안 된다(MUST NOT). Activity 성공 경계는 queue acceptance이고, acceptance 뒤 remote retry·ordering은 Fedify가 소유해야 한다(MUST).

#### Scenario: Local Repost Announce handoff

- **WHEN** Local Repost Workflow가 accepted되고 canonical projection이 가능하다
- **THEN** Activity는 Repost ID에서 파생한 stable Announce identity로 queue handoff를 재시도한다

#### Scenario: Local Post Delete 또는 Repost Undo handoff

- **WHEN** Local Post Delete 또는 Repost Delete Workflow가 accepted된다
- **THEN** 해당 Activity는 Tombstone row에 보존된 관계와 기존 canonical identity를 사용해 queue acceptance까지 handoff한다
- **AND** committed author가 현재 `ACTIVE`인지 여부만으로 보존된 Local Undo를 no-op하지 않는다

#### Scenario: ActivityPub-origin echo suppression

- **WHEN** verified Announce 또는 Delete/Undo에서 시작한 Workflow가 `origin=ACTIVITYPUB`으로 실행된다
- **THEN** Workflow는 outbound Activity를 실행하지 않는다
- **AND** Repost Delete는 Notification cleanup만 수행하고 Post Delete는 outbound effect 없이 완료한다

### Requirement: 독립 effects와 caller 성공 격리

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, PROD-677, PROD-725 — Notification과 federation handoff가 모두 적용되는 Workflow는 각 Activity를 독립적으로 시작하고 결과를 수집해야 하며(MUST), 한 Activity의 terminal failure가 다른 적용 가능한 Activity 시도를 막아서는 안 된다(MUST NOT). Activity retry는 유한해야 하며(MUST), effects 실패가 committed Post나 기존 GraphQL/ActivityPub 성공 의미를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 한 effect의 terminal failure

- **WHEN** Notification 또는 Fedify handoff Activity 하나가 retry를 소진한다
- **THEN** Workflow는 다른 적용 가능한 Activity의 실행과 결과 수집을 계속한다
- **AND** committed Post와 caller 성공 결과를 유지한다

#### Scenario: 모호한 queue acknowledgement

- **WHEN** queue acceptance acknowledgement가 모호해 Activity가 같은 handoff를 재시도한다
- **THEN** 시스템은 같은 canonical activity identity를 사용한다
- **AND** duplicate enqueue나 remote request가 없다는 cross-system exactly-once를 주장하지 않는다
