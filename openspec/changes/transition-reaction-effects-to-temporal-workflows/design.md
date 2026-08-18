## Context

현재 `packages/core/services/reaction.ts`의 공개 action은 optional database handle을 받아 Reaction DML을 실행하고 `postCommit`에서 Notification과 Fedify delivery를 직접 호출한다. GraphQL resolver와 `materializeInboundReaction`·`undoInboundReaction`이 이 callback을 조립한다. Reaction은 물리 삭제되며 `activitypub_reaction.reaction_id`가 `ON DELETE CASCADE`이므로 삭제 뒤에는 원본 row와 inbound mapping을 다시 읽을 수 없다.

PROD-722가 확립한 경계처럼 domain transaction은 Core에 남기고 commit 뒤 Effects Workflow start만 시도한다. 다만 inbound Like·EmojiReact·Undo는 mapping과 Reaction mutation의 기존 원자성을 유지해야 하므로 public action에 transaction handle을 남기는 대신 Core 내부 transaction primitive를 공유해야 한다.

## Goals / Non-Goals

**Goals:**

- Local과 ActivityPub Reaction 상태 전이를 같은 Core 규칙으로 유지한다.
- 실제 create/delete commit만 분리된 Effects Workflow로 연결한다.
- Notification과 federation queue handoff를 독립적으로 재시도한다.
- 삭제 row만으로 기존 Undo identity를 보존한다.
- caller-side database handle과 `postCommit`을 제거한다.
- Reaction Notification source lock을 제거해 best-effort projection이 source transaction을 지연하지 않게 한다.

**Non-Goals:**

- Reaction transaction을 Temporal Activity로 이동하지 않는다.
- outbox, receipt, relay, backfill, generation ledger나 새 DB projection을 만들지 않는다.
- UI·GraphQL schema, Fedify MessageQueue consumer와 remote retry를 바꾸지 않는다.
- create/delete Workflow 사이의 exactly-once ordering이나 unavailable Notification reconciliation을 보장하지 않는다.
- production rollout을 수행하지 않는다.

## Implementation Guidance

### Current Constraints

- Reaction add는 `(post_id, type, profile_id)` unique insert로 duplicate를 수렴하고, delete는 해당 조합의 현재 row를 물리 삭제한다. 삭제 후 재생성된 새 ID를 오래 지연된 Local delete가 제거할 수 있는 ABA는 canonical 계약이다.
- Inbound Like·EmojiReact는 mapping insert와 Reaction add를, Undo는 exact mapping 조회와 Reaction delete를 각각 한 transaction에 묶는다. Mapping을 별도 transaction으로 분리하면 first-write와 rollback 계약이 깨진다.
- Outbound Undo는 deleted Reaction의 `id`, `profileId`, `postId`, `type`, `createdAt`을 사용한다. ID만 넘겨서는 삭제 뒤 원본 activity를 복원할 수 없다.
- Notification table은 source FK를 갖지 않는다. 현재 create path의 Reaction row lock을 제거하면 create/delete Workflow 교차 실행으로 unavailable row가 남을 수 있지만 API는 source join으로 이를 숨기고 durable 정리는 PROD-328 책임이다.
- Temporal input은 plain serializable value여야 하므로 `Temporal.Instant`를 직접 전달하지 않고 문자열로 직렬화해야 한다.

### Recommended Approach

Core에 transaction-scoped Reaction add/delete primitive를 두고 Local public action과 기존 ActivityPub materialization action이 이를 재사용한다. Local public action은 기본 `db.transaction`을 직접 열고, ActivityPub action은 actor·target·mapping 검증과 primitive를 기존 outer transaction 안에서 실행한다. 두 경로 모두 outer transaction이 반환된 뒤 실제 transition 결과에만 Workflow start를 시도하며 start failure를 관측하고 domain 결과는 그대로 반환한다.

Create Workflow input은 `{ reactionId, origin }`으로 제한한다. Notification과 Local outbound Activity는 실행 시점의 committed Reaction을 각각 조회하며, source가 이미 삭제됐으면 멱등 no-op이 된다. Delete Workflow input은 delete `RETURNING` row의 다섯 필드와 origin을 plain value로 직렬화한다. Notification cleanup은 ID만 사용하고 Local Undo Activity는 snapshot의 나머지 필드로 기존 projection을 호출한다.

두 Workflow는 필요한 Activity promise를 먼저 시작하고 각 결과를 모두 수집한 뒤 terminal failure를 전파한다. 따라서 한 효과가 실패해도 sibling 효과의 시도와 retry 결과를 차단하지 않는다. ActivityPub origin은 federation Activity를 목록에 넣지 않는다.

Worker는 기존 하나의 compile-time registry와 process host에 두 Workflow와 Activities를 추가한다. 별도 Worker instance, runtime enable flag, registration validator나 테스트 전용 export를 만들지 않는다.

### Allowed Alternatives

Core 내부 transaction primitive의 구체적 모듈 위치와 반환형은 public caller handle을 노출하지 않고 inbound mapping atomicity를 유지하는 한 구현자가 선택할 수 있다. Notification과 federation Activity의 내부 함수 배치도 기존 package dependency 방향과 compile-time registry를 유지하는 한 선택할 수 있다.

### Known Traps

- `materializeInboundReaction`이 top-level public `addReaction`을 호출하도록 바꾸면 nested transaction 또는 mapping 분리 문제가 생긴다.
- Create와 Delete를 같은 Workflow ID나 transition discriminator 하나로 합치면 완료된 create execution이 delete start를 막을 수 있다.
- Delete Activity에서 Reaction이나 mapping을 재조회하면 이미 cascade 삭제되어 Undo identity를 잃는다.
- `Promise.all`의 첫 rejection만 기다리거나 Activity를 순차 실행하면 한 terminal failure가 sibling 효과 시도를 막을 수 있다.
- Notification 정합성을 이유로 source row lock, 새 FK, outbox 또는 reconciliation을 이 변경에 추가하면 승인된 범위를 넘는다.

## Risks / Trade-offs

- [Commit과 Workflow start 사이 process 종료로 효과 유실] → 감지된 start 실패만 관측하고 committed domain 결과를 유지한다. Durable intent는 이번 범위에서 만들지 않는다.
- [Create/Delete Workflow 교차 실행으로 outbound 순서 또는 unavailable Notification 발생] → stable activity identity와 queue ordering key, API source visibility를 유지하되 cross-transition exactly-once와 durable cleanup은 주장하지 않는다.
- [삭제 snapshot이 오래된 Profile·Post 상태를 포함] → snapshot은 원본 activity identity에 필요한 immutable Reaction 값만 포함하고 recipient availability와 visibility는 Activity 실행 시점에 기존 projection으로 다시 평가한다.
- [Activity retry 중 duplicate queue message] → Activity 성공 경계를 queue acceptance로 유지하며 같은 identity와 ordering key를 재사용한다.

## Migration Plan

1. Core Temporal input·ID와 Worker Workflow·Activity 등록을 추가한다.
2. Core Reaction public action과 inbound materialization을 자체 transaction 및 post-commit Workflow start 경계로 전환한다.
3. API와 Fedify caller의 database handle·`postCommit` 조립을 제거한다.
4. Reaction Notification source lock을 제거하고 unavailable visibility 및 Workflow 교차 경계를 검증한다.
5. Core/API/Fedify/Worker 정적·통합 테스트와 exact revision dev retry·restart 검증을 완료한다.
6. Rollback은 application revision을 이전 버전으로 되돌린다. DB schema 변경이 없으므로 contract migration은 없다. 이미 수락된 Workflow는 구 Worker가 poll할 수 있는 동안 완료시키고 production에는 별도 승인 없이 적용하지 않는다.

## Open Questions

없음.
