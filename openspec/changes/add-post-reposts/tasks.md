## 1. PROD-394 Repost와 Quote가 공유하는 Source 저장

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`
- `PROD-394`

**Deliverable**

Repost와 Quote가 같은 nullable direct Repost Source를 저장할 수 있게 하고, Active contentless Repost 유일성을 데이터베이스 경계에서 보장한다.

**Guardrails**

- 별도 Post Kind, Repost table 또는 Quote Source를 추가하지 않는다.
- actor 권한, Source visibility/eligibility, 결과 visibility와 멱등 application action은 PROD-401에서 실제 caller와 함께 구현한다.
- Quote Source 연결은 실제 Quote 작성 action을 소유하는 후속 작업에서 구현한다.
- Tombstone에서 Repost Source를 제거하지 않고 Source Tombstone도 참조를 cascade/nullify하지 않는다.
- DB constraint trigger와 명시적 비관적 row lock을 추가하지 않는다.
- GraphQL mutation·조회, 목록, UI와 Notification을 이 slice에 포함하지 않는다.

**Verification**

- additive migration의 기존 row 보존, nullable self-FK, Active contentless Repost 유일성, direct 관계, Tombstone 관계 보존과 재Repost를 catalog·DB test로 검증한다.
- 기존 contentful Local/ActivityPub `createPost` 계약과 non-null Content 반환이 유지되는지 기존 core check로 확인한다.

- [x] 1.1 nullable direct Repost Source와 Active Repost 유일성을 저장하고 기존 Post row·workload를 보존하는 additive migration을 생성한다.
- [x] 1.2 Drizzle schema와 migration snapshot에 nullable self-reference와 partial unique index를 동기화한다.
- [x] 1.3 migration catalog, 기존 row, direct FK, 순차·동시 유일성, Repost·Source Tombstone과 재Repost 검증을 추가한다.
- [x] 1.4 기존 contentful `createPost` 계약을 변경하지 않고 core 관련 check를 통과시킨다.

## 2. PROD-401 Repost 생성

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`
- `PROD-401`

**Deliverable**

권한이 있는 Local Profile이 조회 가능한 Content Post를 visibility 정책에 맞게 멱등 Repost하고 기존 `Post` Node 결과를 받는다.

**Guardrails**

- Public/Unlisted Source의 Repost는 Unlisted, Followers Only Source는 Source Author만 Followers Only로 생성한다.
- Local GraphQL entry는 공통 `usingProfile` 인증이 검증한 Account.Active와 선택된 Local Profile membership·visibility를 사용하며 역할별 제한을 다시 적용하지 않는다.
- 공통 core action은 검증된 actor Profile ID와 Source Post ID만 받고 Active Profile과 Suspended가 아닌 Instance라는 공통 actor 가용성, Source visibility/eligibility와 저장 정책을 검증한다.
- Mentioned Profiles, Tombstone, unavailable, Content 없는 Repost Source를 거부한다.
- 누락·Tombstone·조회 불가 Source는 `NOT_FOUND`, 조회 가능한 허용 불가 Source는 `VALIDATION(sourceId)`, actor 권한 실패는 `PERMISSION_DENIED`로 처리한다.
- duplicate/concurrent 생성은 같은 Active Repost identity로 수렴한다.
- Quote 작성과 ActivityPub Repost ingress·delivery를 포함하지 않는다.

**Verification**

- core DB test는 검증된 Local/Remote actor의 공통 action 사용, 비활성 Profile·Suspended Instance 거부, visibility·Source 정책, direct Source, 순차·동시 duplicate와 실패 transaction rollback을 검증한다.
- GraphQL integration test는 Owner/Admin/Member 성공과 membership 부재·비활성 Account/Profile 거부, 기존 error code/field와 payload를 검증한다.

- [x] 2.1 검증된 actor의 공통 가용성, Source visibility와 derived visibility를 적용하는 멱등 Repost core action을 구현한다.
- [x] 2.2 `repostPost` mutation과 `RepostPostPayload.repost`를 기존 Post global ID 계약에 맞춰 제공한다.
- [x] 2.3 GraphQL Local 인증과 core 공통 actor/Source 정책의 성공·거부, 순차/동시 멱등성 및 schema/payload 검증을 추가하고 core/API check를 통과시킨다.

## 3. PROD-402 Repost와 Quote의 Source 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`
- `PROD-402`

**Deliverable**

기존 단일 GraphQL `Post` Node가 Repost와 Quote의 nullable direct `repostSource`를 제공한다. unavailable
Source를 가진 Content 없는 Repost는 숨기고 Content 있는 Quote는 자체 Content와 함께 유지한다.

**Guardrails**

- Source를 평탄화하거나 별도 concrete Post type으로 노출하지 않는다.
- Content 없는 Repost는 direct Source의 viewer 기준 visibility와 eligibility를 적용한다.
- Content 있는 Quote와 Reply+Quote는 Source와 독립적으로 유지하고 unavailable direct Source는
  `repostSource: null`로 반환한다.
- 전역 Post/PostContent 조회 경계에 Source 조건을 적용하지 않는다.
- resolver별 반복 조회로 N+1을 만들지 않는다.

**Verification**

- Repost·Quote·Reply+Quote direct Source, unavailable Source의 Repost 제외와 Quote Content 유지,
  nested Quote의 독립 nullable Source, Node/global ID와 fragment 호환을 GraphQL integration test로 검증한다.

- [x] 3.1 기존 Post Node에 nullable direct `repostSource` field와 batched loading을 추가한다.
- [x] 3.2 Content 없는 Repost에는 direct Source eligibility를 적용하고 Quote는 nullable direct Source와
      독립적으로 유지한다.
- [x] 3.3 direct/nested Source, unavailable Source의 Repost·Quote 분리와 기존 Post Node 회귀 검증을
      추가하고 API check를 통과시킨다.

## 4. PROD-403 Repost count와 현재 Profile의 Active Repost 조회

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-403`

**Deliverable**

Post가 모든 viewer에게 같은 direct Active Repost count와 현재 selected Profile이 소유한 nullable Active Repost identity를 제공한다.

**Guardrails**

- count에는 Content와 Reply Parent가 없는 eligible Active direct Repost만 포함하고 Quote·Tombstone을 제외한다.
- Profile Block/Mute 같은 viewer별 control로 count를 바꾸지 않는다.
- `viewerRepost`는 selected Profile별로 격리하고 boolean으로 축약하지 않는다.
- resolver별 count query로 N+1을 만들지 않는다.

**Verification**

- 서로 다른 viewer의 동일 count, Quote/Tombstone 제외, selected Profile 전환·부재와 active Repost identity를 batched GraphQL integration test로 검증한다.

- [ ] 4.1 viewer-independent `repostCount`와 selected Profile별 nullable `viewerRepost`를 batched query 경계로 제공한다.
- [ ] 4.2 count membership, actor 격리, selected Profile 부재와 N+1 회귀 검증을 추가하고 API check를 통과시킨다.

## 5. PROD-430 Home과 Profile Post List Repost 후보 정책

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-430`

**Deliverable**

Home과 Profile Post List가 Content 없는 Repost의 Author와 direct Source visibility·eligibility를 적용해
Repost 후보를 pagination 전에 선택하고, Content 있는 Quote는 자신의 조회 정책으로 선택한다.

**Guardrails**

- Home은 viewer 또는 followee Repost, Profile은 Target Profile Repost만 포함한다.
- Reply Parent가 있는 Post는 Profile 목록에서 제외하고 Hashtag 목록에는 Content 없는 Repost를 포함하지 않는다.
- hidden Source를 가진 Content 없는 Repost를 page limit 뒤 application filtering하지 않는다.
- unavailable Source를 이유로 Content 있는 Quote를 제외하지 않는다.
- 렌더링, action과 Notification을 포함하지 않는다.

**Verification**

- Home/Profile 작성자·팔로우 관계, Repost/Quote/Reply 후보, unavailable direct Source의 Repost 제외와
  Quote 유지 및 cursor page boundary를 API integration test로 검증한다.

- [ ] 5.1 canonical Home/Profile 후보와 Content 없는 Repost의 direct Source eligibility를 기존 connection
      query에 적용한다.
- [ ] 5.2 Hashtag 목록의 Content 없는 Repost 제외와 Source Hashtag 비상속을 보존한다.
- [ ] 5.3 mixed candidate pagination, unavailable Source의 Repost filter-before-limit·Quote 유지와 기존
      목록 회귀 검증을 추가하고 API check를 통과시킨다.

## 6. PROD-411 Repost 취소

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-411`

**Deliverable**

Repost Author가 기존 Post 삭제 행동으로 Active Repost를 멱등 Tombstone 처리하고 count·유일성·재Repost lifecycle을 일관되게 유지한다.

**Guardrails**

- Source 관계와 최초 삭제 시각을 보존한다.
- 다른 Profile의 Post 삭제를 거부하고 Tombstone Node를 payload로 반환하지 않는다.
- Notification cleanup은 PROD-416이 소유한다.

**Verification**

- 정상·반복·동시 삭제, 권한 실패, `postId` payload, count 감소, partial unique 해제와 재Repost를 core/API integration test로 검증한다.

- [ ] 6.1 Author·Active 상태를 확인하고 Post를 멱등 Tombstone 처리하는 공통 삭제 core action을 구현한다.
- [ ] 6.2 `deletePost` mutation과 `DeletePostPayload.postId`를 concrete Post global ID 계약에 맞춰 제공한다.
- [ ] 6.3 Tombstone·권한·동시성·count·재Repost와 GraphQL payload 검증을 추가하고 core/API check를 통과시킨다.

## 7. PROD-453 Repost/Quote presentation UI

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`
- `PROD-453`

**Deliverable**

production fragment shape를 유지하는 fixture와 Storybook에서 Repost·Quote Author, Content와 Source를 구분해 표시하고 canonical Source route 이동을 검증한다.

**Guardrails**

- `content === null`만으로 Repost를 판별하지 않는다.
- raw object를 fragment key로 cast하지 않고 React Native primitive와 theme token을 사용한다.
- 실제 GraphQL list 연결, generated type과 production navigation 연결은 PROD-415에 남긴다.
- Action과 공통 Action Bar를 포함하지 않는다.

**Verification**

- 일반 Post, Repost, Quote, Reply+Quote, 긴 Author·Content, nullable Source와 Repost/Source Author navigation을 Storybook state·interaction·a11y test로 검증한다.

- [ ] 7.1 production Post fragment shape의 Repost·Quote fixture와 presentation component 상태를 구현한다.
- [ ] 7.2 Repost/Source Author와 Source Post mock navigation, 긴 내용·접근성 상태를 Storybook interaction으로 검증한다.
- [ ] 7.3 app unit·Storybook check를 통과시키고 PROD-415가 연결할 fragment 경계를 문서화한다.

## 8. PROD-414 Repost action

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-414`

**Deliverable**

사용자가 selected Profile 기준 Repost 상태와 viewer-independent count를 확인하고 독립 component에서 생성·취소하며 pending·실패 뒤 일관된 상태를 유지한다.

**Guardrails**

- fragment와 mutations를 실제 component에 colocate하고 actor별 Relay Store를 격리한다.
- mutation payload의 normalized Post identity·count·viewer relation을 사용하고 임시 목록 membership updater를 만들지 않는다.
- 공통 Action Bar와 실제 surface 조립은 PROD-432에 남긴다.

**Verification**

- 선택·미선택, pending 중 중복 차단, 생성·취소 성공, 실패 복구, selected Profile 전환과 접근성 상태를 component/integration test로 검증한다.

- [ ] 8.1 `repostCount`와 `viewerRepost` fragment를 소비하는 독립 Repost action component와 접근성 상태를 구현한다.
- [ ] 8.2 `repostPost`·`deletePost` mutation과 normalized actor Store 갱신을 연결한다.
- [ ] 8.3 Relay mock/Storybook에서 pending·성공·오류·Profile 전환을 검증하고 relay/app check를 통과시킨다.

## 9. PROD-415 Post List Repost 연결

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `PROD-389`
- `PROD-415`
- `PROD-453`

**Deliverable**

Home과 Profile Post List가 실제 GraphQL fragment와 generated type으로 Repost·Quote presentation을 표시하고 Source·Author route를 정확히 연결한다.

**Guardrails**

- route query에 leaf presentation scalar를 중복하지 않고 공용 Post list item fragment를 확장한다.
- Source preview Link를 전체 Post Link 안에 중첩하지 않는다.
- Source가 API에서 제외된 불완전한 row를 client에서 합성하지 않는다.
- Repost action과 Notification UI를 이 slice에 포함하지 않는다.

**Verification**

- Home/Profile fragment 연결, Repost/Quote Author 구분, Source·Profile navigation, 일반 Post 회귀와 Relay generated type을 app integration/E2E로 검증한다.

- [ ] 9.1 PROD-453 presentation fragment를 production Post list item과 실제 API shape에 연결한다.
- [ ] 9.2 Home/Profile 목록의 Source·Author navigation과 중첩 Link 회귀를 검증한다.
- [ ] 9.3 Relay compile, app check·Storybook과 목록 integration 검증을 통과시킨다.

## 10. PROD-412 Repost Notification 생성과 inbox 표시

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-412`

**Deliverable**

다른 Local Profile의 Post를 Repost하면 기존 Profile Notification projection에 Repost source가 Best Effort로 생성되고 concrete Node·connection·Unread·Read·inbox·badge 흐름에 표시된다.

**Guardrails**

- 기존 Notification 기반을 재사용하고 Repost 전용 table, source FK, snapshot과 generic fallback을 만들지 않는다.
- Recipient·Related Profile·Related Post는 Source Repost에서 파생하고 자기 Post Repost와 Remote Recipient 알림을 억제한다.
- source transaction commit 뒤 같은 request에서 create를 await/catch하며 실패가 Repost 결과를 바꾸지 않는다.
- retry, outbox, queue, backfill과 ActivityPub delivery를 포함하지 않는다.

**Verification**

- source mapping, 자기/Remote 억제, duplicate·실패 격리, mixed-kind pagination, concrete Node, Recipient visibility, Read·Unread·badge/cache와 Source Post 이동을 core/API/app integration test로 검증한다.

- [x] 10.1 기존 Notification projection에 Repost kind와 source-only 멱등 create lifecycle을 추가한다.
- [x] 10.2 `RepostNotification` concrete Node와 kind-aware visible connection·count·Read를 구현한다.
- [x] 10.3 inbox row, Source Post navigation, Read와 actor별 badge/cache를 기존 Notification UI에 연결한다.
- [x] 10.4 source mapping·실패 격리·mixed-kind visibility와 core/API/app 검증을 추가해 관련 check를 통과시킨다.

## 11. PROD-416 Repost Notification 정리

**Authority / Provenance**

- `docs/domain/objects/notification.md`
- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-416`

**Deliverable**

Repost Tombstone 뒤 대응 Notification cleanup을 Best Effort로 시도하고, 실패하거나 반복해도 Repost 삭제 결과와 모든 Notification API surface의 가시성이 일관된다.

**Guardrails**

- cleanup은 source transaction commit 뒤 같은 request에서 await/catch한다.
- 반복·없는 item cleanup은 성공한 멱등 no-op이다.
- retry, queue, cron, backfill, bulk cleanup과 동기 cascade를 포함하지 않는다.
- Source Repost가 Active pure Repost가 아닌 잔존 row를 connection/count/Node/Read에서 숨긴다.

**Verification**

- 정상·반복·누락 cleanup, 실패 격리와 stale row의 list/count/Node/Read 숨김을 core/API integration test로 검증한다.

- [ ] 11.1 Repost Tombstone 결과에 연결되는 idempotent Notification cleanup을 구현한다.
- [ ] 11.2 kind-aware visible predicate가 stale Repost Notification을 모든 API surface에서 숨기게 한다.
- [ ] 11.3 cleanup 성공·반복·실패와 stale visibility 검증을 추가하고 core/API check를 통과시킨다.

## 12. PROD-389 Repost 통합 검증·정합성 확인·archive

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/notification.md`
- `docs/domain/policies/post-list.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`

**Deliverable**

저장, 생성·취소, Source·count·목록, presentation·action과 Notification lifecycle이 하나의 Repost 사용자 흐름으로 동작하고 canonical 문서와 active specs에 동기화된다.

**Guardrails**

- 모든 구현 자식과 담당 검증이 완료되기 전에 change를 archive하지 않는다.
- PROD-432의 공통 Action Bar rollout과 Quote 작성·ActivityPub·Notification retry 등 제외 범위를 완료된 것으로 기록하지 않는다.
- Blocked 또는 supersede되지 않은 Upstream Change Required decision을 남긴 채 완료하지 않는다.

**Verification**

- direct Source 저장부터 Repost 생성·취소·재Repost, count/viewer 상태, Home/Profile 표시·Source 이동·action, 자기 알림 억제, inbox/read/badge와 Tombstone cleanup을 연결한 vertical flow를 검증한다.
- canonical 문서·Linear·OpenSpec delta·구현 정합성, archive diff와 archive 후 strict validation을 확인한다.

- [ ] 12.1 모든 자식 이슈·PR·담당 검증 완료와 Remaining Decisions 정리를 확인한다.
- [ ] 12.2 전체 Repost 사용자·Notification lifecycle과 mixed Post/Notification 회귀 통합 검증을 실행한다.
- [ ] 12.3 canonical 문서와 OpenSpec delta를 최종 구현에 맞춰 동기화하고 strict validation을 통과시킨다.
- [ ] 12.4 Completion Gate 승인 뒤 change를 archive하고 archive 후 strict validation을 통과시킨다.
