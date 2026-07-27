## 1. PROD-498 ActivityPub Reaction mapping

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- PROD-498

**Deliverable**

Remote reaction activity URI와 core Reaction의 1:1 관계가 기존 data를 변경하지 않는 additive schema로 저장되고
Reaction lifecycle과 함께 정리된다.

**Guardrails**

- activity URI와 Reaction FK는 각각 unique이고 Reaction 없는 mapping은 존재하지 않는다.
- 기존 row backfill이나 rewrite를 수행하지 않는다.

**Verification**

- migration SQL·snapshot, Drizzle schema와 catalog/direct DB fixture에서 unique, FK cascade와 기존 data 보존을
  검증한다.

- [x] 1.1 ActivityPub Reaction mapping의 additive schema와 forward migration을 추가한다.
- [x] 1.2 mapping 1:1 uniqueness, FK cascade와 migration 적용을 DB test로 검증한다.

## 2. PROD-498 Core inbound Reaction lifecycle

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-498

**Deliverable**

검증된 remote activity가 local·stored remote Post의 기존 core Reaction으로 원자적·멱등 materialize되고, 저장
activity URI를 가리키는 소유 actor의 Undo만 정확한 source를 제거한다.

**Guardrails**

- Remote actor와 Post를 새로 fetch/materialize하지 않고 현재 저장 상태와 Post 조회 정책을 사용한다.
- exact duplicate만 멱등 성공하고 충돌 activity URI는 최초 mapping을 바꾸지 않는다.
- Undo는 Post/Type current-state가 아니라 mapping된 exact Reaction을 제거하며 네트워크 역참조를 하지 않는다.
- 실제 source 생성·제거에만 기존 Best Effort Notification lifecycle을 적용한다.

**Verification**

- local·remote target, actor/recipient/object/access 거부, core Reaction 선존재, exact duplicate, concurrent conflict,
  URI·embedded Undo, actor mismatch와 Notification 실패 격리를 core DB-backed test로 확인한다.

- [x] 2.1 local·remote object URI, Post Author recipient와 actor Post 접근을 검증하는 저장 lookup을 제공한다.
- [x] 2.2 core Reaction 추가와 activity mapping을 하나의 transaction에서 materialize한다.
- [x] 2.3 activity URI mapping 기반 exact Undo와 반복·다른 actor no-op을 구현한다.
- [x] 2.4 실제 생성·제거 결과에 기존 Reaction Notification 생성·정리를 연결한다.
- [x] 2.5 core lifecycle의 성공·duplicate·conflict·실패 경계를 DB-backed test로 검증한다.

## 3. PROD-498 Fedify typed inbox integration

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- PROD-498

**Deliverable**

중앙 Fedify personal/shared inbox가 typed `Like`, `EmojiReact`와 대응 `Undo`를 동일한 inbound Reaction lifecycle로
전달한다.

**Guardrails**

- 정확한 여섯 Unicode Type만 그대로 사용하고 나머지 content는 `❤️`로 투영한다.
- legacy `EmojiReaction`, Misskey `_misskey_reaction`, custom emoji 저장과 outbound/collection 동작을 추가하지 않는다.
- URI-only Undo는 remote document loader를 호출하지 않는다.

**Verification**

- typed listener routing, Like·EmojiReact content fixtures, personal/shared recipient, local·remote object, malformed URI,
  legacy exclusion과 URI·embedded Undo를 Fedify unit/inbox integration test로 확인한다.

- [x] 3.1 `Like`와 `EmojiReact`를 공통 검증·Type 투영·core materialization 경계에 연결한다.
- [x] 3.2 기존 `Undo` dispatcher에 mapping 기반 Reaction URI·embedded 분기를 추가한다.
- [x] 3.3 personal/shared inbox routing과 supported/fallback/invalid/Undo fixture를 검증한다.

## 4. PROD-498 Contract and regression verification

**Authority / Provenance**

- `docs/domain/objects/reaction.md`
- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- PROD-498

**Deliverable**

PROD-498의 inbound Reaction 계약과 기존 actor, Follow, Create(Note), Local Note와 GraphQL Reaction 동작이 함께
검증된다.

**Guardrails**

- PROD-500 `emojiReactions` collection과 outbound Reaction activity를 구현하지 않는다.
- PROD-498 PR 완료만으로 다른 active OpenSpec change를 archive하지 않는다.

**Verification**

- 관련 core/Fedify/API tests, TypeScript, formatting, migration test, strict OpenSpec validation과 `git diff --check`를
  통과한다.

- [x] 4.1 관련 package TypeScript와 focused test를 통과시킨다.
- [x] 4.2 core/Fedify 회귀와 migration 검증을 실행한다.
- [x] 4.3 formatting, strict OpenSpec validation과 diff integrity를 확인한다.
