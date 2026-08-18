## Why

PROD-725는 Repost 생성·삭제 뒤 실행되는 Notification과 ActivityPub queue handoff를 process-local effects에서
Temporal Workflow retry 경계로 옮긴다. 현재 caller가 DB transaction과 `postCommit`을 조립하거나 ActivityPub Repost
전용 Core action을 호출하면, 같은 Repost lifecycle에 여러 저장 경계와 후속 효과 경계가 생긴다.

이번 change는 Repost 저장의 기존 공용 Post lifecycle을 하나로 유지하고, commit 뒤 effects만 event별 Workflow로
분리한다. 명시되지 않은 ActivityPub materialization 원자성·새 generation 정책·복구 ledger는 추가하지 않는다.

## What Changes

- public `repostPost`가 `origin = LOCAL | ACTIVITYPUB` 입력을 받고 자체 transaction을 소유한다.
- ActivityPub 입력의 검증된 Announce URI와 delivery metadata는 일반 `createPost`와 같은 Repost 저장 경계에서 기존
  `ActivityPubPosts` mapping에 기록한다. 별도 ActivityPub materialization/Undo action 또는 caller-owned Repost
  transaction은 만들지 않는다.
- PROD-495의 ActivityPub Post identity mapping, 같은 actor/source의 current Announce generation 교체, duplicate
  수렴과 no-lock 동작은 유지한다.
- verified ActivityPub Undo는 Fedify가 mapping과 actor를 read-only로 해석한 뒤 공용 `deletePost`에 전달한다.
  mapping 조회와 Tombstone transition을 새로운 caller-owned atomic transaction으로 정의하지 않는다.
- 실제 새 Repost 생성 commit에는 Repost Workflow를, 최초 Content-bearing Post 삭제 commit에는 Post Delete Workflow를,
  최초 pure Repost 삭제 commit에는 Repost Delete Workflow를 시작한다. 각 input은 `{ postId, origin }`이다.
- accepted Workflow가 Repost Notification과 Local-origin Announce·Delete(Note)·Undo queue handoff를 독립 Activity로
  재시도하며 ActivityPub-origin outbound echo를 억제한다.
- 기존 Post Create Workflow의 type·ID와 Worker의 단일 process/task queue 경계를 유지하면서 새 event별 Workflow를
  고정 registry에 추가한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`,
  `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Linear Contract: `PROD-725`
- Existing Repost and ActivityPub behavior: `PROD-401`, `PROD-411`, `PROD-412`, `PROD-416`, `PROD-495`, `PROD-496`,
  `PROD-669`
- Existing Post Create Temporal contract: `PROD-722`

## Capabilities

### New Capabilities

- `temporal-repost-effects`: Repost create, Post Delete와 Repost Delete event별 Workflow 및 effects retry 경계

### Modified Capabilities

- `post`: Repost 및 Post delete commit 뒤 Workflow start를 Core가 소유한다.
- `activitypub-local-repost-delivery`: Local-origin effects를 Temporal Activity retry 경계에서 queue acceptance까지
  수행한다.
- `activitypub-remote-repost`: verified Announce는 공용 Repost action을, verified Undo는 read-only resolution 뒤
  공용 `deletePost`를 사용한다.
- `temporal-worker-runtime-foundation`: 기존 고정 Worker registry에 Repost/Delete event를 추가한다.

## Impact

- Core: 하나의 public Repost action, common Post delete와 commit 뒤 Workflow start
- Fedify: Announce는 공용 Repost action, Undo는 read-only mapping resolution 후 공용 delete action
- Worker/Temporal: Repost create, Post Delete, Repost Delete Workflow와 독립 Activity retry
- Tests/OpenSpec: duplicate/no-op, echo suppression, start failure isolation과 기존 PROD-495 semantics 검증

## Explicitly Out of Scope

- Repost 제품 관계·visibility·GraphQL/UI 재설계
- 새로운 ActivityPub mapping table, generation ledger, outbox, command receipt 또는 reconciliation
- Announce/Undo delivery protocol과 Fedify MessageQueue consumer 재설계
- Notification schema와 Best Effort unavailable predicate 변경
- Worker credential, workload activation, production sync/apply/cutover
