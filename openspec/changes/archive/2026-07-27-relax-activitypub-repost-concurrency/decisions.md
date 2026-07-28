## Context

이 기록은 PROD-495에서 새로 확정한 Announce/Undo 동시성 제한과 그에 따른 명시적 row-lock 제거 선택을 정리한다. 순차 current-generation 계약, 같은 activity duplicate 수렴과 기존 Repost core action 재사용은 유지한다.

## Decision Records

### Announce와 Undo의 교차 경합은 후속 delivery 수렴으로 제한한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, PROD-495
- Status: Active
- Context / Problem: 기존 구현은 드문 Announce identity 교체와 Undo 삭제 경합에서도 새 Repost를 반드시 보존했지만, 그 보장을 위해 protocol adapter가 mapping row를 명시적으로 잠갔다.
- Decision Outcome: 선후관계가 확정된 순차 처리에서는 current identity 교체와 superseded/current Undo 계약을 유지한다. 두 delivery가 동시에 겹치면 새 Announce가 Active Repost를 남기지 못할 수 있으며, 이후 같은 actor/source의 유효한 Announce가 다시 전달될 때 기존 멱등 경로로 수렴한다.
- Alternatives Considered: 모든 Announce/Undo 교차를 계속 강하게 직렬화. 소셜 Repost delivery의 드문 race에 비해 명시적 locking 책임이 과하므로 선택하지 않았다.
- Consequences: 후속 delivery가 없으면 remote Repost가 표시되지 않을 수 있다. 동일 Announce의 personal/shared duplicate 수렴과 sequential generation 안전성은 완화하지 않는다.
- Confirmation / Follow-up: concurrent Announce/Undo의 Active 결과를 강제하는 테스트를 제거하고 순차 A→B, superseded/current/repeated Undo와 same-ID duplicate를 유지한다.

### ActivityPub Repost mapping에 명시적 잠금을 사용하지 않는다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-495
- Status: Active
- Context / Problem: `FOR UPDATE`, advisory lock 또는 serializable retry 중 무엇을 사용해도 사용자가 제거하려는 강한 직렬화 책임을 다른 형태로 유지하게 된다.
- Decision Outcome: Announce mapping 조회와 Undo mapping 조회에 explicit row/advisory lock, no-op update lock 또는 serializable retry를 사용하지 않는다. 같은 Announce duplicate는 core actor/source uniqueness와 ActivityPub mapping uniqueness로 수렴시킨다.
- Alternatives Considered: 기존 `FOR UPDATE` 유지, PostgreSQL serializable transaction과 retry, Hackers’ Pub처럼 Announce IRI/actor-source advisory lock 사용. 모두 교차 경합 보장에 비해 구현 또는 DB 조정 비용이 크다. Hackers’ Pub도 Undo는 advisory-lock protocol에 참여시키지 않는다.
- Consequences: DB가 일반 update/delete 과정에서 내부적으로 취득하는 lock은 그대로지만 application이 명시적인 비관 잠금 protocol을 소유하지 않는다. Hackers’ Pub을 완전 무잠금 구현으로 설명하지 않는다.
- Confirmation / Follow-up: `FOR UPDATE`와 lock-ordering 전용 정렬이 없어졌는지 diff로 확인하고 duplicate 및 순차 lifecycle suite를 통과시킨다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- archived `materialize-activitypub-announces`의 `Remote Repost의 기존 ActivityPub Post mapping에 현재 Announce URI를 저장한다` 결정 중 “existing mapping row를 잠가 concurrent Announce/Undo를 직렬화한다”는 부분은 이 change의 두 Active decision으로 대체한다. 같은 mapping reuse, transaction, stale Tombstone URI 인계와 collision 거절 결정은 유지한다.
