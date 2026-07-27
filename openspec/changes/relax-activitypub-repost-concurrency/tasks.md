## 1. PROD-495 ActivityPub Repost 동시성 완화

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- PROD-495

**Deliverable**

순차 Announce/Undo lifecycle과 동일 activity duplicate 수렴은 유지하면서, Announce current identity 교체와 Undo 삭제가 동시에 겹칠 때 새 Repost 보존을 강하게 보장하지 않고 후속 유효 delivery로 수렴한다.

**Guardrails**

- Announce mapping과 Undo 처리에 explicit row/advisory lock, no-op update lock 또는 serializable retry를 추가하지 않는다.
- 같은 Announce의 personal/shared duplicate는 하나의 Active Repost와 mapping으로 수렴한다.
- 순차 A→B replacement, superseded/current/repeated Undo와 different-actor 거절을 유지한다.
- Repost 생성과 mapping 저장 transaction, URI/Post uniqueness, stale Tombstone URI 인계와 기존 core action을 유지한다.
- schema, outbound Announce, Quote·nested Repost, GraphQL/UI를 변경하지 않는다.

**Verification**

- 코드 diff에 explicit mapping row lock과 lock-ordering 전용 정렬이 없는지 확인한다.
- personal/shared concurrent same-ID duplicate와 sequential generation/Undo lifecycle을 검증한다.
- concurrent Announce/Undo가 반드시 Active Repost를 남긴다는 assertion이 제거됐는지 확인한다.
- Fedify 전체 suite, TypeScript, ESLint, Prettier, strict OpenSpec과 GitHub CI를 통과시킨다.

- [x] 1.1 Announce mapping 교체와 Undo 조회의 명시적 row lock을 제거하고 기존 transaction·uniqueness 경계를 유지한다.
- [x] 1.2 concurrent Announce/Undo 강보장 테스트를 제거하고 duplicate 및 순차 generation/Undo 검증을 유지한다.
- [ ] 1.3 active spec, PR과 Linear 검증 기록을 최종 구현과 정렬하고 관련 검증을 통과시킨다.
