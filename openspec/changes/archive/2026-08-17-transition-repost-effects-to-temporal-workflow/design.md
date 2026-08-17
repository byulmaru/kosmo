## Context

PROD-722가 `createPost`의 transaction을 Core에 유지하고 commit 뒤 `temporalClient.workflow.start(...)`를
직접 호출하는 effects-only 경계를 이미 도입했다. 현재 Repost는 같은 방향으로 정리되지 않아
`repostPost`와 `deletePost`가 optional database handle과 one-shot `postCommit`을 반환하고, GraphQL 및
Fedify caller가 callback을 실행한다. callback은 Repost Notification과 Fedify Announce·Undo를 같은 process에서
직접 실행하므로 queue handoff 전 재시작과 일시 오류를 Temporal retry로 복구하지 못한다.

verified Announce는 caller-owned transaction 안에서 `repostPost(tx)`와 ActivityPub mapping 저장을 조립하고,
Undo는 mapping을 조회한 뒤 `deletePost(tx)`를 호출한다. 이 조립을 단순히 Workflow Activity로 옮기면 domain
transaction과 외부 효과가 다시 뒤섞이고, caller handle 및 mapping 원자성 문제가 남는다. Worker는 현재 하나의
Post Create Workflow source와 두 Activity를 고정 등록한 singleton process다.

## Goals / Non-Goals

**Goals:**

- Local GraphQL은 Repost 상태 transaction을, verified Announce·Undo는 Repost 상태와 current ActivityPub mapping의 같은 transaction을 specialized Core action이 소유하게 한다.
- 최초 Repost 생성과 `deletePost`의 모든 최초 Tombstone commit을 Content-bearing Post·Reply·Quote와 pure Repost에
  맞는 Repost create, Post Delete, Repost Delete Workflow로 시작하고 caller `postCommit`·database handle을 제거한다.
- Repost Notification과 Local Announce·Undo queue handoff를 독립적이고 멱등적인 Activity로 재시도한다.
- 하나의 Worker host와 task queue 안에서 Post Create, Repost, Delete event registration을 명확히 분리·조립한다.
- 기존 Repost visibility, duplicate/concurrency, ActivityPub identity, audience, GraphQL payload를 보존한다.

**Non-Goals:**

- Post Create·Reaction·Follow·Profile의 Temporal 경계 변경
- transaction Activity, proposed Repost ID, command ledger, outbox·relay 또는 reconciliation
- Fedify MessageQueue consumer, remote HTTP retry·ordering 또는 공통 recipient dispatcher 재설계
- database role·credential·RLS 변경과 production rollout

## Implementation Guidance

### Current Constraints

- `packages/core/services/post.ts`의 `repostPost`·`deletePost`는 같은 파일과 반환형에서 database handle 및
  `postCommit`을 공유한다. `deletePost`의 모든 최초 Tombstone commit을 Content-bearing Post·Reply·Quote와 pure
  Repost에 맞는 Post Delete 또는 Repost Delete Workflow로 옮기며, ordinary Post·Reply·Quote 적용과 Repost 적용은
  PROD-677·PROD-725가 같은 계약을 공동으로 사용한다.
- `packages/fedify/src/inbound-announce.ts`와 Undo dispatch는 mapping 검사·저장과 Core action을 caller-owned
  transaction으로 조립한다. Core가 mapping을 저장하려면 Fedify vocab 객체나 request context가 아니라 검증된
  serializable identity·timestamp만 입력받아야 한다.
- Repost 생성은 partial unique index와 conflict 뒤 재조회로 동시 요청을 수렴시킨다. Workflow start 여부는
  반환된 `created`나 최초 Tombstone UPDATE 결과에서 결정해야 하며 사전 조회로 대체하면 안 된다.
- `sendRepostAnnounce`·`sendRepostUndo`는 process 기본 `db`에서 canonical projection을 다시 읽고 Fedify queue에
  handoff한다. Activity는 이 함수를 직접 등록하거나 얇은 이름 alias로 등록할 수 있지만 remote delivery owner가
  되어서는 안 된다.
- Tombstone row는 Content·Reply Parent·Repost Source 관계와 actor Profile identity, immutable `createdAt`과
  visibility를 보존한다. Post Delete와 Repost Delete Workflow input은 모두 `{ postId, origin }`이다. Core는
  committed relation shape에 Content가 있으면 Post Delete Workflow를, Content 없이 Repost Source만 있으면 Repost
  Delete Workflow를 시작한다. Post Delete Activity는 Tombstone projection으로 canonical Delete(Note)를 만들고,
  Repost Delete Activity는 Tombstone projection으로 Notification cleanup과 Undo identity를 만든다. Local Undo는
  author Profile이 더 이상 `ACTIVE`가 아니어도 committed Tombstone의 identity를 사용해 no-op이 되지 않아야 한다.
- Repost Notification은 canonical Best Effort projection이다. create와 delete가 경합해 stale row가 남아도
  unavailable predicate가 모든 API surface에서 숨기며, 이를 막기 위해 source row에 `FOR UPDATE` 또는 row lock을
  추가하지 않는다.
- 기존 `temporalClient`는 startup에 환경변수를 검증하는 실제 process-global Client다. Repost용 client wrapper나
  별도 connection lifecycle은 필요하지 않다.
- PROD-722에서 이미 배포한 Post Create Workflow의 외부 type `postCreateEffectsWorkflow`와 Workflow ID
  `post-create-effects:{postId}`는 기존 caller와 실행 history가 의존하므로 변경하지 않는다. 새 event-specific
  type·ID는 Repost create `postRepostWorkflow`/`post-repost:{postId}`, Post Delete `postDeleteWorkflow`/`post-delete:{postId}`와
  Repost Delete `repostDeleteWorkflow`/`repost-delete:{postId}`에만 추가한다.

### Recommended Approach

1. Core의 Repost create와 `deletePost` transition 결과를 최초 Repost 생성 또는 최초 Tombstone의 committed Post ID와
   `origin`으로 정규화한다. Content-bearing Post·Reply·Quote이면 `postDeleteWorkflow`/`post-delete:{postId}`를,
   Content 없이 Repost Source만 있는 pure Repost이면 `repostDeleteWorkflow`/`repost-delete:{postId}`를 시작한다.
   Repost create input, Post Delete input과 Repost Delete input은 모두 `{ postId, origin }`이며 relation discriminator를
   직렬화하지 않는다. Delete Activity는 Tombstone UPDATE 뒤에도 보존되는 관계 projection을 다시 읽는다. Post
   Delete는 canonical Delete(Note) identity를 만들고, Repost Delete는 `actorProfileId`, `repostSourceId`, `createdAt`,
   `visibility` projection으로 Notification cleanup과 Undo identity를 만든다. 별도 serialized snapshot을 전달하지
   않는다. author Profile의 non-`ACTIVE` state는 committed local Undo를 no-op으로 만드는 조건이 아니다. 자체
   transaction이 commit된 직후 shared `temporalClient`로 event-specific Workflow start를 시도하고 오류를 짧은 deadline과
   구조화 로그로 격리한다.
2. verified Announce·Undo용 specialized Core entry가 검증된 actor/source/activity identity를 받아 Repost 상태와
   `ActivityPubPosts` current mapping을 같은 transaction에서 저장한다. Fedify handler는 URI·actor·object 검증과
   protocol 관측만 소유하고 database handle이나 callback을 전달하지 않는다.
3. 기존 Post Create Temporal source와 외부 type·ID는 그대로 두고, Core Temporal source에 Repost create, Post Delete와
   Repost Delete event별 module을 추가해 input, workflow type, event-specific ID와 start options를 둔다. 세 input은
   모두 `{ postId, origin }`이며 공통 client와 task queue는 기존 module을 재사용하고 workflow-specific 상수는 client
   module에 모으지 않는다.
4. Worker는 Repost create, Post Delete와 Repost Delete Workflow를 각각 source module로 둔다. Repost create Workflow는
   Notification create와 Local Announce Activity를 적용한다. Post Delete Workflow는 `origin=LOCAL`일 때 canonical
   Delete(Note) Activity를 적용하고, Repost Delete Workflow는 Notification delete를 적용한 뒤 `origin=LOCAL`이면 Local
   Undo Activity를 추가한다. `origin=ACTIVITYPUB`에서는 Repost Delete의 Notification cleanup만 남기고 outbound
   Activity를 적용하지 않는다. 적용 가능한 Activity는 동시에 시작해 `allSettled`와 동등한 방식으로 모두 관찰한 뒤
   terminal failure를 Workflow 실패로 남긴다.
5. Notification Activity는 Repost ID로 기존 멱등 create/delete 저장 경계를 실행한다. Notification은 canonical
   Best Effort projection이므로 create/delete 경합을 `FOR UPDATE`나 row lock으로 직렬화하지 않는다. 남은 stale
   row는 unavailable predicate로 숨긴다. Fedify Activity는 기존 canonical producer를 사용하며 queue acceptance까지만
   기다린다.
6. API/Fedify caller에서 `db`, `ctx.db`, `postCommit` 조립을 제거하고, integration test는 commit 결과, duplicate
   no-start, AP echo suppression, start failure 격리와 Activity retry identity를 검증한다.
7. Worker registration은 기존 Post Create source와 외부 계약을 유지한 채 entrypoint의 하나의 고정 activities
   object와 workflows entrypoint를 유지한다. Repost와 Delete event source 파일을 추가하되 generic registry builder,
   optional registration 또는 두 번째 Worker host를 만들지 않는다. start policy, registration과 Activity persistence는
   unit/package test로 검증하고, Workflow Activity 독립 실행·retry·origin 분기와 restart 복구는 module mock이나
   별도 testing dependency 대신 실제 dev Temporal history로 검증한다.

### Allowed Alternatives

- Repost 생성과 모든 Post 삭제는 각각 Repost create, Post Delete와 Repost Delete Workflow로 분리한다. 세 Workflow의
  ID와 input은 event 경계를 반영하고, Core가 committed relation shape로 Post Delete와 Repost Delete를 선택하며,
  각 Workflow input에는 discriminator를 전달하지 않는다. 적용 효과·retry·echo suppression 계약을 유지해야 한다.
- Activity 이름 alias를 `apps/worker`에서 re-export하거나 domain별 activity module에서 직접 구현할 수 있다.
  business 함수는 Core/Fedify의 기존 경계를 재사용하고 Worker-only pass-through 계층을 불필요하게 늘리지 않아야
  한다.

### Known Traps

- ordinary Post·Reply·Quote delete를 Repost Workflow로 보내지 않는다. 이들은 Post Delete Workflow에서 처리하며
  pure Repost delete와 별도 retry·effects 경계를 사용한다. ordinary delete의 적용·검증 책임은 PROD-677에 남긴다.
- ActivityPub mapping을 Workflow Activity에서 뒤늦게 저장하거나 Repost transaction과 분리하지 않는다.
- Announce mapping 교체와 Undo 경합을 `FOR UPDATE`, advisory lock 또는 serializable retry로 새로 직렬화하지 않는다.
- duplicate/no-op을 누락 effects backfill 계기로 사용하지 않는다.
- delete Activity에서 Tombstone Repost의 현재 Active projection이나 author Profile `ACTIVE` state를 요구해 canonical
  Undo를 no-op으로 만들지 않는다. Tombstone row에 보존된 actor/source/createdAt/visibility projection을 사용한다.
- Notification create/delete 경합을 막기 위해 `FOR UPDATE` 또는 row lock을 추가하지 않는다. stale Notification은
  canonical unavailable predicate로 숨겨지는 Best Effort 잔여 projection이다.
- Notification과 Fedify Activity를 직렬 await해 첫 실패가 다음 효과 시작을 막지 않게 한다.

## Risks / Trade-offs

- [commit 뒤 Workflow start 전에 process가 종료되면 효과가 유실될 수 있음] → PROD-725가 허용한 경계로
  구조화 관측하고, outbox나 caller 재시도를 이 change에 추가하지 않는다.
- [queue acknowledgement가 모호하면 같은 activity가 중복 enqueue될 수 있음] → canonical Announce·Undo ID를
  유지하고 ActivityPub 수신 측 idempotency에 수렴시킨다.
- [active `add-post-reposts` change의 Best Effort 문구와 새 delta가 충돌할 수 있음] → 구현 전 해당 active
  artifact의 lifecycle 문구와 남은 task를 PROD-725 소유로 명시해 동기화한다.
- [Notification create와 delete가 경합해 stale row가 남을 수 있음] → canonical Best Effort semantics를 유지하고
  unavailable predicate로 모든 API surface에서 숨기며, domain transaction에 `FOR UPDATE` 또는 row lock을 추가하지
  않는다.
- [Post Create, Repost와 Delete Workflow를 한 Worker bundle에 추가하면 registration 회귀가 생길 수 있음] → 하나의
  compile-time registry와 package build·registration test로 검증한다. merge된 revision의 실제 dev Workflow 실행은
  rollout evidence로 별도 관찰한다.

## Migration Plan

1. active OpenSpec drift를 동기화하고 새 change를 strict validation한다.
2. 기존 Post Create transition/start 계약을 유지한 채 Core transition/start 경계와 caller 단순화를 구현하고,
   event-specific Repost/Delete Workflow·Activity registration을 추가한다.
3. unit/package integration test로 duplicate·rollback·start failure·Activity 멱등성과 terminal no-op을 검증한다.
4. 구현이 완료되면 active specs에 delta를 동기화하고 이 change를 archive한다. 이 change는 `notification`
   capability를 수정하지 않으므로 `add-post-reposts` archive를 기다리지 않으며, archive 동작 자체는 구현 task로
   두지 않는다.
5. merge된 exact revision을 dev에 배포한 뒤 Repost/Delete Workflow history, Notification, Announce·Undo queue
   handoff, Activity 독립 실행·retry·origin 분기와 Worker restart 복구를 rollout evidence로 별도 확인한다. 이
   관찰은 OpenSpec 구현 완료나 archive의 선행 조건이 아니다.
6. 회귀 시 application revision을 이전 구현으로 rollback한다. schema migration과 production cutover는 없으며,
   production 적용은 별도 사용자 승인 없이는 수행하지 않는다.

## Open Questions

없음.
