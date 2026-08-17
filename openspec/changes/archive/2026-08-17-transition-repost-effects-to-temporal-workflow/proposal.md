## Why

Repost 생성·취소와 verified ActivityPub Announce·Undo materialization은 Core transaction에서 동기적으로
확정되지만, Repost Notification과 Post Delete의 Local-origin federation queue handoff는 process-local
`postCommit`에 남아 있다. `deletePost`는 ordinary Post·Reply·Quote와 pure Repost를 모두 Tombstone으로
전이하는 공통 domain 진입점인데, 삭제 구조마다 서로 다른 후속 처리 경계를 가지면 commit 뒤 실패를 Worker
restart와 Activity retry로 복구할 수 없다. PROD-725는 이 callback과 caller database handle 조립을 제거하고,
실제 transition commit 뒤에만 사건별 Temporal Workflow가 후속 효과를 재시도하도록 경계를 통일한다.

## What Changes

- Local GraphQL Repost는 Repost 상태를 Core transaction에 저장한다. verified ActivityPub Announce·Undo는
  Repost 상태와 필요한 current ActivityPub mapping을 specialized Core action의 같은 transaction에 저장한다.
  transaction Activity, proposed domain ID, command receipt 또는 outbox를 추가하지 않는다.
- 최초 실제 Repost 생성 commit과 `deletePost`의 모든 최초 Tombstone commit은 각각 Repost와 공통 Delete
  Workflow를 시작한다. Repost Workflow input은 `{ postId, origin: LOCAL | ACTIVITYPUB }`이고 Delete Workflow
  input은 `{ postId, origin: LOCAL | ACTIVITYPUB, postKind: POST | REPLY | QUOTE | REPLY_QUOTE | REPOST }`다. `postKind`는 commit된
  관계 조합에서 도출한다. Current Content와 Reply Parent·Repost Source의 조합에 따라 `POST`, `REPLY`, `QUOTE`,
  `REPLY_QUOTE`를 사용하고, Content가 없고 Repost Source가 있으면 `REPOST`(순수 Repost)다. Workflow ID는 event 경계별로 안정적으로
  파생한다. Delete Activity는 Tombstone row에 보존된 관계 projection을 다시 사용하고, Repost Delete에서는
  actor·source·createdAt·visibility로 Undo identity를 만든다. duplicate·no-op·rollback은 Workflow를 시작하지 않는다.
- accepted Repost Workflow는 Repost Notification 생성과 Local-origin Announce handoff를, accepted Delete
  Workflow는 `postKind=POST | REPLY | QUOTE | REPLY_QUOTE`일 때 Local-origin canonical Delete(Note) handoff를, `postKind=REPOST`일
  때 Notification 정리와 Local-origin Undo(Announce) handoff를 독립 Activity로 멱등 재시도한다.
  ActivityPub-origin event는 모든 outbound echo를 만들지 않으며, `postKind=REPOST`일 때만 Notification
  lifecycle을 적용한다.
  Notification은 canonical Best Effort projection과 unavailable 결과 숨김을 유지하며, create/delete 직렬화를
  위한 `FOR UPDATE` 또는 row lock을 추가하지 않는다.
- Fedify queue acceptance를 Activity 성공 경계로 유지한다. queue acceptance 뒤 remote retry·ordering은
  Fedify가 소유하며, acknowledgement가 모호한 handoff의 cross-system exactly-once는 보장하지 않는다.
- Core Repost action과 모든 Post delete 경로의 database handle 및 반환형 `postCommit`, API/Fedify caller의
  후속 효과 조립을 제거한다. Workflow start 실패와 commit→start process gap은 관측하지만 committed Post와
  기존 GraphQL/ActivityPub 성공 결과를 유지한다.
- Worker는 하나의 process-global host와 task queue를 유지하면서 compile-time business registration에 Post
  Create, Repost, Delete Workflow·Activity를 추가한다. event별 Workflow 계약은 Core의 분리된 Temporal module에 둔다.
- PROD-722에서 이미 배포한 Post Create Workflow의 외부 계약인 type `postCreateEffectsWorkflow`와 ID
  `post-create-effects:{postId}`는 그대로 유지한다. 새 event-specific type·ID는 Repost와 Delete에만 추가한다.
- 새 event-specific 계약은 Repost type `postRepostWorkflow`·ID `post-repost:{postId}`와 Delete type
  `postDeleteWorkflow`·ID `post-delete:{postId}`로 분리한다.
- 기존 `add-post-reposts` active change에 남은 PROD-669 process-local `postCommit` 실행 경계는 PROD-725의
  Temporal 경계로 동기화하되, canonical Best Effort·hidden unavailable 효과 계약은 유지한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`,
  `docs/domain/decisions/0014-post-structure-relations.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-725`
- Linear Implementations: `PROD-725`; 기존 Repost 기반과 ActivityPub wiring은 `PROD-401`, `PROD-411`,
  `PROD-412`, `PROD-416`, `PROD-495`, `PROD-496`, `PROD-669`

## Capabilities

### New Capabilities

- `temporal-repost-effects`: 실제 Repost 생성과 모든 Post 삭제 commit에서 각각 시작해 Repost Notification
  lifecycle과 관계별 Local-origin Announce·Delete(Note)·Undo queue handoff를 독립적으로 재시도하는
  event-specific Workflow들

### Modified Capabilities

- `post`: 모든 Post의 최초 Tombstone commit 뒤 관계 기반 `postKind`를 포함한 공통 Delete Workflow start로
  후속 효과 경계를 변경한다.
- `activitypub-local-repost-delivery`: 최초 Local Repost create/delete의 Announce·Undo handoff를 process-local
  post-commit 실행에서 Temporal Activity retry 경계로 이동한다.
- `activitypub-remote-repost`: verified Announce·Undo가 Repost와 current ActivityPub mapping을 같은 Core
  transaction에 저장하고 commit 뒤 각각 Notification-only Repost 또는 Delete Workflow를 시작하도록 caller 경계를 변경한다.
- `temporal-worker-runtime-foundation`: singleton Worker host의 compile-time business registration을 Post Create
  전용에서 Post Create, Repost, Delete Workflow를 함께 등록하는 고정 registry로 확장한다.

## Impact

- `packages/core/services/post.ts`와 Repost domain service: transaction ownership, stable event 결과와
  관계 기반 `postKind`, database handle·`postCommit` 제거, Workflow start 관측
- `packages/core/temporal`: 기존 Post Create Workflow type·ID는 유지하고, Repost·Delete Workflow
  type/input/identity/start 계약만 event별 module로 추가
- `apps/api`: Repost/create-delete resolver에서 database handle과 `postCommit` 조립 제거
- `packages/fedify`: inbound Announce·Undo caller를 공통 Core transaction 경계로 단순화하고 기존 canonical
  Announce·Undo producer를 Activity에서 재사용
- `apps/worker`: Repost·Delete Workflow·Activity source와 고정 registry registration, 독립 effects 실행
- `openspec/changes/add-post-reposts`: 최신 PROD-725가 대체한 PROD-669 post-commit lifecycle 문구 동기화
- OpenSpec archive: 이 change는 `notification` capability를 수정하지 않고 독립된
  `temporal-repost-effects` capability를 추가하므로 `add-post-reposts`의 archive와 독립적으로 archive
- 외부 GraphQL schema, Repost·Notification read API, Fedify MessageQueue consumer와 production rollout은
  변경하지 않는다.
