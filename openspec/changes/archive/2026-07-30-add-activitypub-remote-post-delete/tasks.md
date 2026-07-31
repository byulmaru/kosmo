## 1. PROD-579 Typed Delete와 canonical Tombstone 전이

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/architecture/core-services.md`
- PROD-579
- PROD-365

**Deliverable**

personal/shared inbox의 verified typed Delete가 direct object IRI 또는 지원하는 embedded Tombstone을 no-network로
해석하고, 저장 remote actor/mapping/Author의 exact identity chain이 일치하는 Post만 canonical Tombstone으로
전환한다.

**Guardrails**

- actor와 object HTTP(S) URI는 각각 정확히 하나여야 한다.
- stored ActivityPub Actor와 ACTIVITYPUB Instance Type을 요구하되 Profile/Instance의 현재 가용 상태와 무관하게
  검증된 Delete를 반영한다.
- Local Post, 다른 actor/object/Author와 unsupported embedded object를 변경하지 않는다.
- canonical Post delete action을 재사용하고 handler에서 Post lifecycle을 직접 복제하지 않는다.
- inbound remote Delete는 Local outbound Delete/Repost Undo/Notification cleanup을 만들지 않는다.
- caller transaction 유무로 Post origin을 추론하지 않는다.

**Verification**

- personal/shared, direct IRI, embedded Tombstone과 no-network 처리를 검증한다.
- unknown/non-ActivityPub actor, ambiguous URI, cross-actor/object, Announce mapping과 Local Post 거부 및 unavailable
  remote Author의 Delete 반영을 검증한다.
- Active→Tombstone, deletedAt, transaction rollback과 Local delivery 부재를 검증한다.
- 기존 Local root/Reply Delete delivery와 repeated Local Delete를 회귀 검증한다.

- [x] 1.1 typed personal/shared Delete 입력과 direct IRI/embedded Tombstone no-network 검증 경계를 구현한다.
- [x] 1.2 stored actor, Instance, exact mapping, remote Author와 Local origin 검증을 하나의 transaction 경계에 구현한다.
- [x] 1.3 canonical Post delete action을 재사용하면서 mapped remote Post가 Local outbound lifecycle 후보가 되지 않게 정렬한다.
- [x] 1.4 supported Delete, actor/object/ownership 거부, rollback과 Local lifecycle 회귀 테스트를 추가한다.

## 2. PROD-579 Mapping 보존과 bounded 멱등·동시성

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/architecture/core-services.md`
- PROD-579
- PROD-365

**Deliverable**

remote Post Tombstone 뒤 mapping과 content history가 보존되고 repeated, missing, out-of-order와 concurrent Delete가
승인된 bounded no-op/전이 결과를 제공한다.

**Guardrails**

- ActivityPub Post mapping, PostContent와 currentContent pointer를 삭제하거나 바꾸지 않는다.
- 최초 deletedAt만 기록하고 repeated Delete와 duplicate Create는 Tombstone을 변경하거나 부활시키지 않는다.
- missing mapping에 receipt, placeholder, fetch, backfill 또는 retry queue를 만들지 않는다.
- concurrent Delete에 explicit `FOR UPDATE`, table/advisory lock이나 activity receipt를 추가하지 않는다.
- first Create와 Delete가 겹치면 committed mapping 관찰 여부에 따른 계약을 유지한다.

**Verification**

- repeated Delete의 stable deletedAt과 mapping/content/currentContent 보존을 검증한다.
- Delete-before-Create, Tombstone-after-Create duplicate Create와 두 first Create/Delete interleaving을 검증한다.
- 독립 PostgreSQL connection의 concurrent Delete에서 하나의 terminal state와 no partial side effect를 검증한다.

- [x] 2.1 Tombstone 전이 뒤 mapping/content/currentContent 보존과 repeated Delete no-op을 검증한다.
- [x] 2.2 missing mapping, Delete-before-Create와 Tombstone 뒤 duplicate Create first-write-wins 회귀를 검증한다.
- [x] 2.3 committed mapping 관찰 여부가 다른 first Create/Delete interleaving을 deterministic test로 고정한다.
- [x] 2.4 independent connection concurrent Delete에서 single transition과 stable deletedAt을 검증한다.

## 3. PROD-579 GraphQL/Create 통합 검증과 Delete-only archive

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/architecture/core-services.md`
- PROD-579
- PROD-365

**Deliverable**

실제 remote Create materializer output이 inbound Delete 뒤 기존 GraphQL DB-only deletion 결과와 Post List Policy를
따르고, public remote Create가 회귀하지 않으며 PROD-579의 Delete-only 계약이 독립 archive된다.

**Guardrails**

- remote 전용 GraphQL schema/resolver나 request-time mapping lookup/fetch/refresh/backfill을 추가하지 않는다.
- Tombstone Post와 current/historical PostContent는 기존 state authorization으로 숨긴다.
- home/profile connection에서 삭제 Post만 제외하고 기존 ordering/cursor를 바꾸지 않는다.
- remote Update, Reply/FOLLOWERS/DIRECT, media/Mention/Notification과 physical cleanup을 포함하지 않는다.
- PR readiness와 OpenSpec archive를 분리하되 PROD-579가 모든 task·검증·spec sync와 archive를 소유한다.
- 모든 scope와 task가 완료되고 최신 canonical·Linear·구현과 delta spec이 일치하기 전에는 archive하지 않는다.

**Verification**

- actual Create handler output에서 Delete 전후 Post/current·historical PostContent Node, `Profile.posts`와
  `homeTimeline`을 비교하고 GraphQL zero-network read를 검증한다.
- 신규 PUBLIC/UNLISTED Create, duplicate Create first-write-wins와 connection ordering/cursor를 회귀 검증한다.
- 관련 core/Fedify/API test, lint/type/format, scoped·전체 OpenSpec strict validation과 diff check를 통과시킨다.
- archive 전후 delta spec 동기화와 strict validation, PROD-579 완료 상태를 확인한다.

- [x] 3.1 actual remote Create materializer output을 Delete handler로 전이하는 Post/PostContent Node와 home/profile connection 통합 테스트를 추가한다.
- [x] 3.2 GraphQL zero-network read, connection ordering/cursor와 PUBLIC/UNLISTED 최초·duplicate Create 회귀를 검증한다.
- [x] 3.3 관련 workspace checks와 scoped·전체 OpenSpec strict validation을 통과시키고 구현·canonical·Linear·OpenSpec 정합성을 재검토한다.
- [x] 3.4 모든 task와 검증 완료 뒤 active spec delta를 동기화하고 `add-activitypub-remote-post-delete`를 archive한 뒤 validation과 PROD-579 완료 상태를 확인한다.
