## Context

현재 PROD-495 구현은 Announce mapping 교체와 Undo 삭제가 교차해도 새 identity가 Tombstone Repost를 가리키지 않도록 양쪽에서 `activitypub_post` row를 `FOR UPDATE`로 잠근다. 사용자는 이 드문 소셜 delivery 경합을 강하게 보장하기보다 명시적 비관 잠금을 제거하는 단순한 모델을 선택했다.

Hackers’ Pub 최신 구현은 `SELECT FOR UPDATE`를 사용하지 않지만 Announce끼리는 activity IRI와 actor/source identity 기반 PostgreSQL advisory transaction lock으로 직렬화한다. 반면 Undo는 같은 lock protocol이나 serializable retry에 참여하지 않아 Announce/Undo 교차 경합을 강하게 보장하지 않는다. Kosmo는 동일 Announce 중복을 기존 DB uniqueness와 core 멱등성으로 수렴시키고, Undo 교차 경합은 같은 수준으로 허용한다.

## Goals / Non-Goals

**Goals:**

- Announce와 Undo mapping 조회에서 명시적 row lock을 제거한다.
- 순차 A→B replacement, superseded Undo, repeated Undo와 다른 actor 거절을 유지한다.
- personal/shared same-ID duplicate를 하나의 Active Repost와 mapping으로 수렴시킨다.
- 허용하는 Announce/Undo race와 후속 delivery 복구 경계를 테스트·문서와 일치시킨다.

**Non-Goals:**

- serializable transaction, advisory lock 또는 application mutex로 같은 race를 다시 직렬화
- durable receipt, generation ledger, 새 schema 또는 migration
- outbound Announce/Undo, Quote·nested Repost, GraphQL/UI 변경

## Implementation Guidance

### Current Constraints

- `repostPost`의 actor/source Active uniqueness와 `activitypub_post.uri`/`postId` uniqueness가 duplicate Announce의 기본 수렴 경계다.
- Repost 생성과 mapping write는 partial persistent state를 막기 위해 계속 같은 transaction에 있어야 한다.
- lock을 제거하면 Announce가 Post 상태를 확인한 뒤 concurrent Undo가 Tombstone 처리하고, Announce가 새 URI를 같은 mapping에 기록할 수 있다.
- 이후 같은 Announce가 다시 전달되면 existing Tombstone generation의 URI를 새 Active Repost로 인계하는 현재 경로가 복구를 담당한다.

### Recommended Approach

Announce mapping 후보 조회와 Undo mapping 조회에서 명시적 `FOR UPDATE`와 lock ordering 전용 정렬을 제거한다. 나머지 transaction, unique collision 거절, stale Tombstone mapping 인계와 한 번의 Active Repost 재확인은 유지한다. 이 재확인은 이미 완료된 Tombstone을 발견하는 best-effort 복구이지 concurrent Undo를 직렬화하는 보장으로 설명하지 않는다.

테스트는 같은 activity의 동시 duplicate가 하나로 수렴하는지 계속 확인한다. Announce B와 Undo A의 `Promise.all` 결과가 반드시 Active B라고 요구하는 테스트는 제거하고, 순차 replacement와 superseded/current/repeated Undo를 독립적으로 검증한다.

### Allowed Alternatives

없음. serializable retry와 advisory/application lock은 사용자가 선택한 단순한 경합 모델과 맞지 않는다.

### Known Traps

- `FOR UPDATE`만 다른 이름의 advisory lock이나 no-op update lock으로 바꿔 무잠금처럼 설명하지 않는다.
- same-ID personal/shared duplicate 수렴까지 완화하지 않는다.
- concurrent Announce/Undo 유실 가능성을 순차 superseded Undo 동작과 혼동하지 않는다.
- Hackers’ Pub을 완전 무잠금 선례로 설명하지 않는다. Announce끼리는 advisory lock을 사용하고 Undo만 해당 protocol 밖에 있다.

## Risks / Trade-offs

- [Announce와 Undo가 교차하면 새 mapping이 Tombstone Repost를 가리키거나 새 Announce materialization이 유실될 수 있음] → 소셜 delivery의 드문 race로 허용하고 후속 유효 Announce delivery가 기존 멱등 경로로 복구한다.
- [후속 delivery가 없으면 remote Repost가 표시되지 않을 수 있음] → 현재 범위에서 수용하며 durable receipt/retry를 추가하지 않는다.
- [같은 actor/source의 concurrent A/B 최종 current URI가 scheduling에 의존함] → actor/source와 mapping uniqueness만 유지하고 generation ordering은 보장하지 않는다.

## Migration Plan

Schema migration은 없다. application code와 active spec을 함께 배포한다. rollback은 명시적 row lock과 이전 동시성 문구를 복원하는 것이다.

## Open Questions

없음.
