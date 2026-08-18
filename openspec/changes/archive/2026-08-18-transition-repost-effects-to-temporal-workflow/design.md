## Context

PROD-722는 `createPost`가 Core transaction을 소유하고 commit 뒤 effects Workflow를 시작하는 경계를 이미
제공한다. Repost는 이 경계와 달리 caller가 transaction handle과 `postCommit`을 조립하고, ActivityPub Announce와
Undo에 별도 Core 저장 action을 두는 방향으로 확장되어 있었다.

PROD-725의 변경 대상은 후속 효과의 실행 경계다. Repost의 domain 관계와 PROD-495가 확정한 ActivityPub identity·
generation semantics를 다시 정의하지 않는다.

## Goals

- Local과 ActivityPub Repost 진입점이 하나의 public `repostPost` action을 사용한다.
- ActivityPub Repost input의 URI mapping 저장을 일반 `createPost`와 같은 Core 저장 경계에 둔다.
- Undo는 Fedify의 read-only identity resolution 뒤 공용 `deletePost`를 사용한다.
- commit 뒤 Repost create/Post Delete/Repost Delete effects를 event별 Temporal Workflow로 재시도한다.
- committed domain 결과와 GraphQL/ActivityPub acknowledgement를 effects 실패와 분리한다.

## Non-Goals

- Repost relation, visibility, duplicate/concurrency 정책의 재설계
- 새로운 mapping table, generation ledger, transaction Activity, outbox 또는 command receipt
- Announce/Undo protocol, queue consumer, remote delivery retry의 재설계
- Notification schema, unavailable predicate 또는 lock 정책 변경
- Worker credential·workload activation·production rollout

## Contract boundary

### Repost create

`repostPost`는 다음 두 입력 계열을 수용한다.

```ts
type RepostInput =
  | {
      origin: 'LOCAL';
      actorProfileId: string;
      sourcePostId: string;
    }
  | {
      origin: 'ACTIVITYPUB';
      actorProfileId: string;
      sourcePostId: string;
      activityUri: string;
      publishedAt: Temporal.Instant | null;
      receivedAt: Temporal.Instant;
    };
```

구체 필드명은 기존 public action conventions에 맞춰 조정할 수 있지만, Local/ActivityPub 분기와 검증된
serializable identity의 의미는 유지한다. action은 자체 transaction에서 Source 검증·Repost 저장을 수행한다.
ActivityPub 입력이면 같은 transaction 안에서 기존 `ActivityPubPosts` mapping을 저장하거나 기존 mapping의
current URI/delivery metadata를 갱신한다. 이 저장을 별도 helper나 caller transaction으로 분리하지 않는다.

### ActivityPub Undo

Fedify는 verified actor와 Undo가 가리키는 Announce URI를 read-only로 조회해 현재 Repost `postId`를 해석한다.
현재 generation과 actor가 일치하는 경우에만 공용 `deletePost({ actorProfileId, postId, origin: 'ACTIVITYPUB' })`
를 호출한다. mapping 조회와 Tombstone 전이는 별도의 단계이며, 이번 change는 둘을 하나의 atomic transaction으로
주장하지 않는다.

PROD-495의 순차 current-generation, duplicate, superseded Undo, generation replacement와 concurrent no-lock
semantics는 그대로 둔다. 새 lock, advisory lock 또는 serializable retry를 추가하지 않는다.

### Workflow start

- 새 Repost commit: `postRepostWorkflow`, `post-repost:{postId}`
- Content-bearing Post/Reply/Quote의 최초 Tombstone commit: `postDeleteWorkflow`, `post-delete:{postId}`
- Content 없는 pure Repost의 최초 Tombstone commit: `repostDeleteWorkflow`, `repost-delete:{postId}`

세 Workflow 입력은 `{ postId, origin: 'LOCAL' | 'ACTIVITYPUB' }`이며 relation discriminator를 직렬화하지
않는다. Core가 commit 뒤 start를 시도하고, duplicate/no-op/rollback에는 start하지 않는다. 동일 event의 중복
start는 event별 stable ID로 Temporal의 existing execution semantics에 맡긴다.

## Effects

Repost create Workflow는 기존 Repost Notification create와 Local-origin Announce handoff를, Repost Delete
Workflow는 Notification cleanup과 Local-origin Undo handoff를 수행한다. Post Delete Workflow는 Local-origin
canonical Delete(Note) handoff만 수행한다. ActivityPub-origin Workflow는 outbound echo를 만들지 않는다.

Notification과 queue handoff는 독립 Activity이므로 하나의 terminal failure가 다른 적용 가능한 Activity의 시도를
막지 않는다. Activity는 queue acceptance까지 책임지고, acceptance 뒤 remote retry와 ordering은 Fedify가 소유한다.
Notification은 Best Effort projection이며 create/delete 경합을 위해 source row에 `FOR UPDATE`나 row lock을 추가하지
않는다.

## Worker shape

기존 Post Create Workflow의 type `postCreateEffectsWorkflow`와 ID `post-create-effects:{postId}`를 보존한다.
production entrypoint는 하나의 process-global Worker host, 하나의 task queue, compile-time business registry를
사용하고 Repost/Post Delete/Repost Delete source를 고정 등록한다. optional registration, test-only business export,
두 번째 Worker host 또는 별도 client/connection lifecycle을 추가하지 않는다.

## Failure and rollback

Domain transaction 실패는 Workflow를 시작하지 않는다. commit 뒤 Temporal start 실패는 committed Post와 기존 성공
응답을 바꾸지 않고 구조화 관측으로 남긴다. accepted Workflow의 Activity 실패는 유한 retry 뒤 terminal failure로
관측되며 domain state를 rollback하지 않는다. transactional outbox, automatic backfill과 production cutover는 이
change에 포함하지 않는다.

## Verification strategy

- Core unit/integration: Local·ActivityPub input, AP mapping, duplicate/generation behavior, rollback, post-commit
  start, start failure isolation
- Fedify integration: verified Announce/Undo resolution, common action delegation, outbound echo suppression
- Worker/Temporal: stable type/ID/options, independent effects, retry/no-op and fixed registry
- Repository: affected package lint/typecheck/test and `openspec validate --strict`
