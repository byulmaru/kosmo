## 1. PROD-495 ActivityPub Announce/Undo Repost materialization

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-494
- PROD-495

**Deliverable**

verified remote Announce가 저장된 remote 또는 canonical local Content Post를 기존 Repost로 materialize하고, 정확한 current Announce identity의 Undo만 해당 Repost를 멱등 삭제한다. personal/shared duplicate는 하나의 Repost로 수렴하고 기존 count·조회 결과가 같은 core 경로로 갱신된다.

**Guardrails**

- 기존 `repostPost`와 `deletePost` action의 eligibility, visibility, actor/source uniqueness와 Tombstone 계약을 우회하거나 복제하지 않는다.
- remote Repost 자체의 기존 ActivityPub Post mapping `uri`/`postId`를 current Announce identity로 사용하고 새 table, column, enum 또는 migration을 추가하지 않는다.
- 같은 actor/source의 새 Announce는 같은 Active Repost mapping의 current identity를 교체하며 all-generation ledger와 ABA ordering을 추가하지 않는다.
- Announce/Undo activity identity와 actor origin은 일치시키되 Source object의 cross-origin은 허용한다.
- exact stored remote mapping 또는 configured canonical local Note URI만 Source로 해석하고 unknown actor/object/activity를 network fetch/materialize하지 않는다.
- shared inbox recipient 부재와 `to`/`cc`의 개별 Local Recipient 부재를 허용하며 기존 personal recipient 검증을 유지한다.
- outbound Announce, Quote·nested Repost, GraphQL과 UI를 변경하지 않는다.

**Verification**

- local/remote Source 성공, actor/activity/object/recipient/visibility 거절과 no-side-effect를 검증한다.
- personal/shared 순차·동시 duplicate, mapping URI/Post unique collision과 transaction rollback을 검증한다.
- A→B current replacement, Undo A no-op, Undo B delete, B→C 뒤 repeated Undo B와 different-actor Undo를 검증한다.
- 기존 Follow Undo, Create(Note), Repost core count/조회와 Fedify listener 회귀를 검증한다.
- Fedify/core TypeScript·unit/integration, formatter/linter, strict OpenSpec과 diff check를 통과시킨다.

- [x] 1.1 verified actor와 activity/object identity를 검증하고 exact remote/local Post identity를 해석하는 inbound Announce 경계를 구현한다.
- [x] 1.2 기존 Repost action과 ActivityPub Post mapping current identity를 한 transaction으로 materialize하고 duplicate/concurrent delivery를 수렴시킨다.
- [x] 1.3 current mapping identity와 verified Author가 일치하는 Undo만 기존 delete action에 연결하고 Follow Undo routing을 유지한다.
- [x] 1.4 success, rejection, duplicate/concurrency, generation/Undo와 production listener 회귀 테스트를 추가한다.
- [x] 1.5 관련 package와 workspace 검증, strict OpenSpec validation과 diff check를 통과시키고 구현 결과에 맞춰 artifact를 최종 정렬한다.
