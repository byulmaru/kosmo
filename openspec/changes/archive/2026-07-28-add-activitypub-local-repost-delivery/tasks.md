## 1. PROD-496 Announce/Undo identity와 recipient delivery

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-496

**Deliverable**

Committed Local Repost identity를 Local/Remote Source에 공통인 안정적인 Announce와 정확한 Undo로 직렬화하고, Repost audience를 가진 activity를 행동 Profile의 지원되는 established remote follower에게 Fedify로 전달할 수 있다.

**Guardrails**

- Announce와 Undo identity는 configured Local Instance canonical origin과 immutable Repost Post UUID에서 파생한다.
- Local/Remote Source는 PROD-494 Post URI resolver를 재사용하고 별도 mapping이나 URI 규칙을 만들지 않는다.
- Announce는 Active contentless Repost와 Content Source만 지원하고, Undo는 Tombstone Repost에 보존된 Source identity를 사용한다.
- Source Author를 follower 관계와 무관한 recipient로 추가하지 않는다.
- Local, inactive, Suspended와 missing inbox recipient를 제외하고 ACTIVE/UNRESPONSIVE remote follower를 지원한다.
- followers/outbox collection, queue, retry와 delivery history를 추가하지 않는다.

**Verification**

- Local/Remote Source의 ID·actor·object·published와 Unlisted/Followers Only audience를 검증한다.
- Source Tombstone 뒤 exact Undo, 반복 projection identity와 같은 ordering domain을 검증한다.
- follower 방향, Profile/Instance 상태, actor inbox/shared inbox, local follower 제외와 Source Author 비포함을 검증한다.
- unsupported 구조, missing mapping과 unavailable Author/Instance가 delivery를 만들지 않는지 검증한다.

- [x] 1.1 Local/Remote Source를 공통 identity로 해석하는 Repost Announce와 exact Undo projection을 구현한다.
- [x] 1.2 Repost Visibility audience와 established remote follower recipient projection을 구현하고 Fedify direct delivery에 연결한다.
- [x] 1.3 identity, audience, recipient, shared inbox, unavailable와 Source lifecycle matrix의 Fedify 검증을 추가한다.

## 2. PROD-496 최초 상태 전이와 post-commit failure isolation

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- PROD-447
- PROD-496

**Deliverable**

최초 Local Repost 생성과 최초 Repost 취소 transaction이 commit된 뒤에만 Announce/Undo delivery가 시작되고, projection 또는 remote delivery 실패에도 committed Repost 상태와 기존 GraphQL payload가 성공으로 유지된다.

**Guardrails**

- transaction callback이나 commit 전에 Fedify delivery와 broker enqueue를 수행하지 않는다.
- duplicate/concurrent Repost 생성은 기존 `created` 결과에 따라 추가 Announce를 시작하지 않는다.
- duplicate/concurrent 삭제는 conditional Active→Tombstone 전이 결과에 따라 추가 Undo를 시작하지 않는다.
- 일반 Post, Reply, Quote와 Reply이면서 Quote 삭제는 Repost Undo를 만들지 않는다.
- protocol adapter는 non-local Author의 Repost를 Local activity로 보내지 않는다.
- GraphQL public schema와 `repostPost`·`deletePost` payload를 변경하지 않는다.
- Notification 생성·정리와 ActivityPub delivery 실패는 독립적으로 격리한다.

**Verification**

- transaction rollback에는 delivery가 없고 최초 commit에만 delivery가 있음을 검증한다.
- 순차·동시 생성과 취소에서 한 결과만 delivery를 시작함을 검증한다.
- non-local Author와 non-Repost 삭제가 delivery를 만들지 않는지 검증한다.
- Announce/Undo projection·HTTP failure를 주입해 DB state, count, uniqueness, 재Repost와 GraphQL payload가 성공으로 유지되는지 검증한다.
- 기존 Repost Notification 생성·정리 실패 격리와 일반 Post 삭제 회귀를 검증한다.

- [x] 2.1 Repost 생성 결과를 commit한 뒤 최초 생성에만 Local Announce delivery를 시작하고 실패를 관측 경계에서 격리한다.
- [x] 2.2 Post 삭제의 실제 Active→Tombstone 전이 여부를 내부 결과로 보존하고 최초 Repost 취소에만 Undo delivery를 연결한다.
- [x] 2.3 duplicate/concurrent action, rollback, non-local/non-Repost 분기와 post-commit delivery 실패의 core/API 검증을 추가한다.
- [x] 2.4 기존 GraphQL payload와 Repost Notification·count·재Repost lifecycle 회귀 검증을 통과시킨다.

## 3. PROD-496 통합 검증과 OpenSpec 완료

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `docs/domain/decisions/0017-activitypub-local-post-note.md`
- PROD-496

**Deliverable**

PROD-496의 Local Repost Announce/Undo 전체 계약이 package와 GraphQL 경계에서 검증되고, sibling interaction이나 durable transport 범위를 추가하지 않은 채 change를 완료할 수 있다.

**Guardrails**

- inbound Announce, Reply·Reaction federation, Quote·중첩 Repost, collection과 PROD-448 migration을 구현하지 않는다.
- OpenSpec archive는 PROD-496 구현·검증과 delta spec 정합성이 모두 완료된 뒤에만 수행한다.

**Verification**

- Fedify, core와 API targeted/full test, TypeScript check와 workspace lint를 통과시킨다.
- `openspec validate add-activitypub-local-repost-delivery --strict`와 전체 strict validation을 통과시킨다.
- 최종 diff와 테스트 목록에서 제외 범위 침범이 없는지 확인한다.

- [x] 3.1 관련 Fedify/core/API targeted test와 package full test를 통과시킨다.
- [x] 3.2 workspace ESLint, Prettier, Syncpack과 OpenSpec strict validation을 통과시킨다.
- [x] 3.3 PROD-496 완료 기준과 제외 범위를 최종 대조하고 구현·검증 증거를 정리한다.
- [x] 3.4 전체 change 완료 뒤 delta spec을 canonical spec에 동기화하고 OpenSpec을 archive한다.

## Verification Evidence

- `pnpm --filter @kosmo/fedify test`: 119 passed
- `pnpm --filter @kosmo/core test`: 121 passed
- `pnpm --filter @kosmo/api test`: 154 passed, 1 skipped
- `pnpm lint:eslint`, `pnpm lint:prettier`, `pnpm lint:syncpack`: passed
- `openspec validate add-activitypub-local-repost-delivery --strict`: passed
- `openspec validate --all --strict`: 39 passed, 0 failed
- 최종 diff에는 inbound Announce, Reply/Reaction/Quote federation, followers/outbox collection, broker/queue/outbox, durable retry/history, schema migration이 없다.
