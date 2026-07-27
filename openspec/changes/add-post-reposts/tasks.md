## 1. PROD-394 Repost와 Quote가 공유하는 Source 저장

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `docs/design/post-action-bar.md`
- `docs/domain/decisions/0014-post-structure-relations.md`
- `PROD-389`
- `PROD-394`

**Deliverable**

Repost와 Quote가 같은 nullable direct Repost Source를 저장할 수 있게 하고, Active contentless Repost 유일성을 데이터베이스 경계에서 보장한다.

**Guardrails**

- 별도 Post Kind, Repost table 또는 Quote Source를 추가하지 않는다.
- 행동 주체 권한, Source visibility/eligibility, 결과 visibility와 멱등 application action은 PROD-401에서 실제 caller와 함께 구현한다.
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

권한이 있는 selected Profile이 Instance Type과 무관하게 조회 가능한 Content Post를 visibility 정책에 맞게 멱등 Repost하고 기존 `Post` Node 결과를 받는다.

**Guardrails**

- Public/Unlisted Source의 Repost는 Unlisted, Followers Only Source는 Source Author만 Followers Only로 생성한다.
- GraphQL entry는 공통 `usingProfile` 인증이 검증한 Account.Active와 selected Profile membership·visibility를 사용하며 역할별 제한이나 Instance Type 제한을 다시 적용하지 않는다.
- 공통 core action은 검증된 행동 주체 Profile ID와 Source Post ID만 받고 Profile/Instance 상태를 다시 조회하지 않으며 Source visibility/eligibility와 저장 정책을 검증한다.
- Mentioned Profiles, Tombstone, unavailable, Content 없는 Repost Source를 거부한다.
- 누락·Tombstone·조회 불가 Source는 `NOT_FOUND`, 조회 가능한 허용 불가 Source는 `VALIDATION(sourceId)`, 진입점 권한 실패는 `PERMISSION_DENIED`로 처리한다.
- duplicate/concurrent 생성은 같은 Active Repost identity로 수렴한다.
- Quote 작성과 ActivityPub Repost ingress·delivery를 포함하지 않는다.

**Verification**

- core DB test는 진입점에서 검증된 행동 주체의 Profile/Instance 상태 비재조회, visibility·Source 정책, direct Source, 순차·동시 duplicate와 실패 transaction rollback을 검증한다.
- GraphQL integration test는 Owner/Member 성공과 membership 부재·비활성 Account/Profile·Suspended Instance 거부, 기존 error code/field와 payload를 검증한다.

- [x] 2.1 검증된 행동 주체 identity, Source visibility와 derived visibility를 적용하는 멱등 Repost core action을 구현한다.
- [x] 2.2 `repostPost` mutation과 `RepostPostPayload.repost`를 기존 Post global ID 계약에 맞춰 제공한다.
- [x] 2.3 GraphQL `usingProfile` 인증과 core Source 정책의 성공·거부, 순차/동시 멱등성 및 schema/payload 검증을 추가하고 core/API check를 통과시킨다.

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

- [x] 4.1 viewer-independent `repostCount`와 selected Profile별 nullable `viewerRepost`를 batched query 경계로 제공한다.
- [x] 4.2 count membership, actor 격리, selected Profile 부재와 N+1 회귀 검증을 추가하고 API check를 통과시킨다.

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

- Home/Profile 작성자·팔로우 관계, 익명 Profile과 인증 Home의 Repost/Quote/Reply 후보, Source Post와
  Source Profile lifecycle 뒤 unavailable direct Source Repost의 filter-before-limit 제외, Quote 유지,
  Node/global ID 은닉과 cursor page boundary를 API integration test로 검증한다.

- [x] 5.1 Home/Profile connection에서 Content 없는 Repost의 direct Source eligibility를 pagination 전에 적용한다.
- [ ] 5.2 Hashtag 목록의 Content 없는 Repost 제외와 Source Hashtag 비상속을 보존한다.
- [x] 5.3 unavailable Source Repost의 filter-before-limit, Quote 유지와 Repost cursor 경계를 API integration test로 검증한다.

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

- [x] 6.1 Author·Active 상태를 확인하고 Post를 멱등 Tombstone 처리하는 공통 삭제 core action을 구현한다.
- [x] 6.2 `deletePost` mutation과 `DeletePostPayload.postId`를 concrete Post global ID 계약에 맞춰 제공한다.
- [x] 6.3 Tombstone·권한·동시성·count·재Repost와 GraphQL payload 검증을 추가하고 core/API check를 통과시킨다.

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

- [x] 7.1 production Post fragment shape의 Repost·Quote fixture와 presentation component 상태를 구현한다.
- [x] 7.2 Repost/Source Author와 Source Post mock navigation, 긴 내용·접근성 상태를 Storybook interaction으로 검증한다.
- [x] 7.3 app unit·Storybook check를 통과시키고 PROD-415가 연결할 fragment 경계를 문서화한다.

## 8. PROD-414 Repost action

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-414`
- `PROD-432`
- `PROD-433`

**Deliverable**

`PostActionBar_post` composite fragment가 private `RepostAction_post` child fragment를 조립하고, private `RepostAction`이 selected Profile별 상태, viewer-independent count, 생성·취소 mutation과 pending을 한 Relay 소유 경계에서 파생한다. `PostListItem`·`PostLayout`은 Action Bar를 content grid의 마지막 sibling으로 처음 배치하고, 순수 Repost에서는 direct Source를 target으로 삼아 cross-platform Repost menu와 action별 실패 toast를 제공한다. 생성 성공은 normalized Source 상태를 반영하고, 취소 성공은 실제 Repost를 삭제하되 Source cache 동기화는 PROD-471에 남긴다.

**Guardrails**

- #341로 main에 포함된 PROD-433의 공개 `PostActionBar` 경계를 재사용하고 branch 코드를 복사하거나 `PostActionBar` 또는 독립 공개 action leaf를 중복 구현하지 않는다. 최초 production surface를 시작할 때 PR #357이 열려 있으면 검증한 exact `prod-415` head 위에 PROD-414 고유 변경만 stack하고 PR base를 `prod-415`로 두며, 이미 merge됐으면 해당 merge가 포함된 최신 `main` 위에서 이어간다.
- #341 squash merge 뒤 기존 부모·자식 tip을 backup ref로 보존하고 자식 고유 커밋만 main 위에 옮긴다. 최신 main의 PROD-453와 PROD-414가 함께 수정한 `add-post-reposts`의 `decisions.md`, `design.md`, `tasks.md`를 어느 한쪽으로 덮지 않고 presentation과 action 계약을 명시적으로 reconcile한 뒤 range-diff와 전체 검증을 수행하고, 명시적 lease로 원격을 갱신한다.
- `PostActionBar`는 composite Post fragment를 받고 private Repost child fragment를 실제 fragment ref로 전달한다.
- child action은 fragment, create/delete mutation, pending, actor 격리와 선택 상태·label·정확한 delete identity를 함께 소유한다. 이 값을 독립 scalar config로 분해하지 않는다.
- `PostListItem`과 `PostLayout`이 Action Bar를 직접 렌더링하고 `PostList`, route 또는 `actionBar?: ReactNode` 주입 경계를 추가하지 않는다.
- Action Bar는 Post content grid의 마지막 sibling이자 본문·작성자·생성 시각·Source navigation link 밖에 두며, 순수 Repost에서는 바깥 Repost가 아니라 direct Source fragment를 target으로 공급한다.
- Repost trigger는 즉시 mutation을 실행하지 않고 항상 menu를 연다. Web은 anchored popup, Android·iOS는 bottom action sheet를 사용하며 현재 상태에 따라 `재게시하기` 또는 `재게시 취소`만 표시한다. `인용하기`는 PROD-431 전까지 노출하지 않는다.
- 생성 mutation payload의 normalized Post identity·count·viewer relation을 사용하고 임시 목록 membership updater를 만들지 않는다.
- 취소 성공 뒤 client count 산술, 광범위한 cache invalidation, 임시 refetch 또는 Source cache 직접 변경을 추가하지 않는다.
- 취소 성공 뒤 임시 local deselect나 같은 Tombstone ID의 후속 입력을 막는 client 상태를 추가하지 않는다.
- mutation 실패는 pending을 종료하고 서버 확정 domain/cache 상태를 유지한 채 action별 error callback을 호출한다. actual surface는 하나의 공용 transient toast host를 통해 정확한 한국어 문구, 약 3초 자동 dismiss, latest-replace와 alert semantics를 제공하고 persistent 오류·toast close/retry control·success toast는 추가하지 않는다.
- 새 외부 dependency를 추가하지 않고 최소 공용 toast host와 cross-platform action menu 경계만 만든다. private `RepostAction`의 Relay·mutation 소유권을 platform UI에 옮기지 않는다.
- Storybook 전용 wrapper는 실제 Relay operation의 Post fragment ref를 `PostActionBar_post`에서 `RepostAction_post`까지 전달한다. 나머지 action의 production 조립·최종 disabled 정책과 전체 통합 검증은 PROD-432에 남긴다.
- 공통 test harness를 신설하거나 기존 harness를 범용 확장하지 않는다.

**Verification**

- raw Relay unit test로 생성 payload의 Source Post cache 정규화, 취소 payload 뒤 Source cache 비변경과 서로 다른 actor Store 격리를 검증한다.
- actual Post fragment ref를 받는 Storybook `PostActionBar` wrapper의 `play` interaction으로 parent→child fragment 전달, menu open·dismiss·항목 선택, Source Post ID 생성 호출, 정확한 Active Repost ID 취소, 같은 tick pending 중복 차단, 생성 성공, 취소 뒤 cache 비변경, network·GraphQL 오류 callback·재시도, selected Profile actor reset과 접근성 상태를 검증한다.
- 목록·상세 integration에서 일반 Post·순수 Repost·Quote의 Action Bar final sibling·link 비중첩, 순수 Repost Source target과 action별 toast를 검증한다. Web anchored menu와 Android·iOS bottom action sheet는 각 runtime의 dismiss·focus/back·safe area·접근성을 확인한다.

- [x] 8.1 `PostActionBar_post` composite fragment와 private `RepostAction_post` child fragment를 연결하고 Repost 선택 상태·label·delete identity·mutation 종류를 child action에서 함께 파생한다.
- [x] 8.2 private `RepostAction`에 `repostPost`·`deletePost`, pending·actor callback 격리를 두고 생성 normalized cache, 정확한 취소 identity, 취소 뒤 Source cache 비변경과 error callback 계약을 유지한다.
- [x] 8.3 raw Relay unit과 실제 parent→child fragment ref를 사용하는 Storybook `play` interaction으로 pending·생성·취소·오류 재시도·Profile actor reset을 검증하고 relay/app/Storybook scoped check를 통과시킨다.
- [x] 8.4 `PostListItem`·`PostLayout`에 Action Bar를 final content-grid sibling이자 navigation link 밖에 배치하고, 순수 Repost surface는 direct Source fragment를 Action Bar target으로 공급한다.
- [x] 8.5 새 dependency 없이 Web anchored menu와 Android·iOS bottom action sheet의 공용 Repost action menu 경계를 구현하고 선택·미선택 label, dismiss·keyboard/focus/back·접근성 및 pending 중복 차단을 검증한다.
- [x] 8.6 앱 provider의 단일 transient toast host와 actual surface의 action별 Repost error callback 연결을 구현하고 정확한 문구, latest-replace, 약 3초 dismiss, safe area·tab bar 위치, alert semantics와 실패 뒤 상태 유지·재시도를 검증한다.
- [ ] 8.7 app check·unit·Relay·Storybook·static Storybook·Web/Android/iOS runtime 및 scoped·전체 strict OpenSpec 검증을 통과시킨다.

## 9. PROD-415 Post renderer Repost 연결

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/policies/post-list.md`
- `PROD-389`
- `PROD-415`
- `PROD-453`

**Deliverable**

Home, Profile, Bookmark와 Post 상세이 실제 GraphQL fragment와 generated type으로 Repost·Quote presentation을 표시하고 Source·Author route를 정확히 연결한다. Content 없는 Repost 목록은 Repost Author attribution 뒤 direct Source를 일반 Post와 같은 표준 목록 행으로 표시한다. Quote와 Reply+Quote는 direct Source 한 단계까지만 preview하고 두 번째 Source를 위한 별도 placeholder나 CTA를 표시하지 않는다. Content 없는 Repost 상세 진입은 direct Source canonical route로 대체한다. 순수 Repost의 direct Source 자체가 Quote인 조합의 preview 정책은 이번 slice의 완료 조건에서 제외한다.

**Guardrails**

- route query에 leaf presentation scalar를 중복하지 않고 공용 Post list item fragment를 확장한다.
- Bookmark도 Home/Profile과 같은 공용 Post list item fragment를 사용하고 별도 presentation scalar를 중복하지 않는다.
- 현재 상세 Post는 `PostLayout`, 목록과 상세 thread의 조상·하위 Reply는 `PostListItem`이 자신의 direct Source를 소유하고 공용 preview leaf를 `PostBody` 아래 sibling으로 정확히 한 번 표시한다.
- `PostDetailThread`는 Source를 별도 선택·운반·추가 렌더링하지 않는다.
- thread connector segment는 목록형 48px avatar와 현재 상세 40px avatar의 위·아래에서 각각 4px 떨어지고 둥근 끝을 사용하며, 기존 row border는 유지한다.
- bordered Source preview는 시각적 그룹 경계로 유지하고 전체를 Source Post Link로 만들지 않는다.
- Source가 API에서 제외된 불완전한 row를 client에서 합성하지 않는다.
- Quote preview의 두 번째 Source ID·Content·Profile presentation field를 읽거나 presentation component를 재귀 호출하지 않는다.
- Source Author는 canonical Profile Link, direct Source 생성 시각은 최소 44px canonical Post Link, direct Source 본문 행은 pointer·touch shortcut으로 분리하고 border의 빈 padding에는 동작을 두지 않는다.
- ordinary Post와 pure Repost Source의 공용 표준 목록 행은 생성 시각을 최소 44px canonical Post Link로 유지하고, 본문 행은 내부 외부 Link와 중첩되지 않는 pointer·touch shortcut으로 사용한다.
- Home/Profile/Bookmark와 상세 thread의 조상·하위 Reply `PostListItem`에서 Quote 자체 생성 시각은 바깥 Quote Post의 canonical Link를 유지하고 자체 본문 행의 pointer·touch shortcut도 바깥 Quote Post로 이동한다. 이미 자기 canonical route인 현재 상세 `PostLayout`에는 self navigation을 추가하지 않는다.
- Quote와 Source body의 외부 Link는 각각의 Post 이동과 함께 실행되지 않는 독립 목적지를 유지하고 nested interactive semantics를 만들지 않는다.
- 서버가 반환한 connection edge 순서와 결과만 렌더링하고 새 `loadNext` pagination UI를 추가하지 않는다.
- 순수 Repost 자체 detail이나 unavailable Source placeholder·redirect loop를 만들지 않는다.
- Quote 자체 detail과 Source preview navigation을 합치지 않는다.
- Repost action과 Notification UI를 이 slice에 포함하지 않는다.
- Content 없는 Repost 상세 route는 direct Source 경로로 `replace`하고 Repost 자체 surface·history entry·공유 참조를 노출하지 않는다. Source가 unavailable해 Repost 자체가 조회되지 않으면 기존 not-found 경계를 유지한다.
- Content 없는 Repost 목록은 Repost Author canonical Profile Link attribution을 한 번만 표시하고, ordinary Post와 direct Source에 `repostSource`를 선택하지 않는 같은 표준 행 fragment leaf를 사용한다. outer list item만 article·row border·padding을 소유하며 별도 Source full presentation·article·border·renderer를 만들지 않는다.

**Verification**

- Home/Profile/Bookmark와 Post 상세 fragment 연결, Repost/Quote Author 구분, Source·Profile navigation, 일반 Post 회귀와 Relay generated type을 app integration/E2E로 검증한다. Pure Repost는 attribution이 한 번만 있고 Repost Author Profile과 Source Author/Profile·Post pathname이 구분되며, direct Source가 ordinary Post와 같은 48px avatar·Author·Content·spacing·navigation 표준 행을 사용하고 중첩 article·이중 border가 없어야 한다. ordinary와 pure Repost Source 표준 행은 최소 44px timestamp Link, pointer·touch body shortcut, 외부 Link 격리와 nested interactive 부재를 검증한다. current·ancestor·descendant Quote의 Source는 정확히 한 번만 표시되어야 한다. Quote-of-Quote는 direct Source 한 단계에서 preview가 끝나고 direct Source 생성 시각·본문이 해당 Source의 canonical route로 이동하며 두 번째 Source Content와 CTA가 표시되지 않는지 확인한다. 목록과 상세 thread 조상·하위 Reply의 `PostListItem`에서 Quote와 Reply+Quote의 자체 본문은 바깥 Quote Post로 이동하고 Source Post로 잘못 이동하지 않아야 하며, 현재 상세 `PostLayout`은 direct Source 이동만 제공해야 한다. Source/Quote 생성 시각의 실제 Link, pointer·touch body shortcut, 빈 border padding, Author Profile과 외부 body Link 목적지를 각각 검증하고 `a a` 및 `[role="link"] [role="link"]`가 없어야 한다. Content 없는 Repost 상세 진입은 Source canonical URL로 replace되고 기존 thread 순서·pagination·오류 복구가 유지되어야 한다. production Storybook은 48px 목록형 avatar와 40px 현재 avatar 모두 connector 위·아래 간격이 4px이며 끝이 둥글고 기존 row border가 유지되는지 검증한다.

- [x] 9.1 PROD-453 presentation fragment를 production Post list item과 실제 API shape에 연결한다.
- [x] 9.2 Home/Profile/Bookmark 목록의 Source·Author navigation과 중첩 Link 회귀를 검증한다.
- [x] 9.3 Relay compile, app check·Storybook과 목록 integration 검증을 통과시킨다.
- [x] 9.4 `PostLayout`과 `PostListItem`이 공용 direct Source preview leaf로 자신의 Source를 정확히 한 번 표시하게 하고 `PostDetailThread`의 별도 Source carrier를 제거한다.
- [x] 9.5 Content 없는 Repost 상세 진입을 direct Source canonical route로 `replace`하고 자체 surface·history entry·공유 참조를 남기지 않는다.
- [x] 9.6 current·ancestor·descendant Quote의 한 단계 Source 표시, Source null, 순수 Repost canonical replace와 기존 목록·thread 회귀를 검증하고 Relay compile·app check·Storybook·OpenSpec strict validation을 통과시킨다.
- [x] 9.7 Source presentation과 표준 목록 행이 고정 canonical Link·body shortcut을 직접 소유하게 하고 caller-injected renderer·target·navigation callback API를 제거한다.
- [x] 9.8 Content 없는 Repost가 Repost Author Profile Link attribution을 한 번 표시한 뒤 direct Source를 일반 Post와 같은 비재귀 표준 목록 행 leaf로 렌더링하게 하고 별도 Source renderer·중첩 article·이중 border를 제거한다.
- [x] 9.9 production Storybook pathname·외부 Link 격리·표준 행 구조·Quote one-depth cutoff와 전체 app/OpenSpec 회귀 검증을 통과시킨다.

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

- [x] 11.1 Repost Tombstone 결과에 연결되는 idempotent Notification cleanup을 구현한다.
- [x] 11.2 kind-aware visible predicate가 stale Repost Notification을 모든 API surface에서 숨기게 한다.
- [x] 11.3 cleanup 성공·반복·실패와 stale visibility 검증을 추가하고 core/API check를 통과시킨다.

## 12. PROD-471 Repost 취소 뒤 Source cache 동기화

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/decisions/0010-post-interaction-contracts.md`
- `PROD-389`
- `PROD-471`

**Deliverable**

Repost 취소 성공 뒤 서버가 확정한 Source Post의 `repostCount`와 selected Profile별 `viewerRepost`를 같은 Relay actor Store에 정규화해 모든 중복 surface가 일치한다.

**Guardrails**

- 일반 `deletePost`와 concrete Post identity, PROD-411의 Tombstone lifecycle을 보존한다.
- client count 산술, 관련 없는 전체 refetch, 광범위한 cache invalidation과 임시 connection updater를 사용하지 않는다.
- 다른 selected Profile의 actor Store로 취소 상태를 전파하지 않는다.
- Repost child action과 공통 `PostActionBar` 조립을 다시 소유하지 않는다.

**Verification**

- 취소 결과의 Source 상태, 같은 actor Store의 중복 surface 일치, actor 간 격리와 API·Relay cache 동기화를 자동 테스트로 검증한다.

- [ ] 12.1 취소 성공 결과가 Source Post ID, 최신 `repostCount`와 selected Profile별 `viewerRepost`를 제공하게 한다.
- [ ] 12.2 취소 mutation 결과로 같은 actor Store의 normalized Source Post record를 갱신한다.
- [ ] 12.3 API payload와 client cache 동기화·actor 격리 회귀 테스트를 추가하고 관련 check를 통과시킨다.

## 13. PROD-389 Repost 통합 검증·정합성 확인·archive

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

- [ ] 13.1 모든 자식 이슈·PR·담당 검증 완료와 Remaining Decisions 정리를 확인한다.
- [ ] 13.2 전체 Repost 사용자·Notification lifecycle과 mixed Post/Notification 회귀 통합 검증을 실행한다.
- [ ] 13.3 canonical 문서와 OpenSpec delta를 최종 구현에 맞춰 동기화하고 strict validation을 통과시킨다.
- [ ] 13.4 Completion Gate 승인 뒤 change를 archive하고 archive 후 strict validation을 통과시킨다.
