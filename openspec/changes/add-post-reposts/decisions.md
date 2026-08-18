## Context

이 기록은 PROD-389와 구현 자식 이슈가 공유하는 Repost 계약을 canonical Post·Notification·Post List 문서에서 파생하고, DB·core·GraphQL·목록·유니버설 UI·Notification 구현 slice가 같은 선택을 사용하도록 정리한다. 제품 행동은 canonical 문서와 최신 Linear 계약에서만 파생하며, 구현 수단은 그 범위 안에서 선택한다.

## Decision Records

### Post Kind 없이 관계 조합으로 구조를 판별한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-394`
- Status: Active
- Context / Problem: Reply와 Quote가 동시에 성립하고 Repost와 Quote가 같은 Source를 사용하므로 배타적인 Kind 값은 실제 구조를 표현하지 못한다.
- Decision Outcome: 일반 Post, Reply, Repost와 Quote는 Content, Reply Parent와 Repost Source의 존재 조합으로만 판별한다. Reply이면서 Quote를 허용하고 Repost/Quote는 하나의 Repost Source 관계를 공유한다.
- Alternatives Considered: Post Kind enum, 별도 Repost/Quote table, 별도 Quote Source. 모두 관계와 상태를 중복하고 조합 불일치 가능성을 만든다.
- Consequences: 모든 DB/core/API/UI/Notification slice는 nullable 관계 조합을 사용해야 하며 `content === null`만으로 Repost를 판별할 수 없다.
- Confirmation / Follow-up: 저장 가능한 관계 조합은 Drizzle schema·snapshot 선언으로 정렬하고, PROD-401 전용 Repost action과 향후 Quote 작성 action에서 각 caller의 허용·거부 정책을 검증한다. PROD-453은 presentation 상태를 검증한다.

### Repost Source는 direct immutable relation으로 보존한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-394`, `PROD-402`
- Status: Active
- Context / Problem: 중첩 Quote와 Tombstone 뒤에도 사용자가 실제로 선택한 Source 관계를 잃지 않아야 한다.
- Decision Outcome: Repost와 Quote는 입력 Source Post를 직접 참조하고 Source의 Source로 평탄화하지 않는다. Repost 또는 Source가 Tombstone이 되어도 저장 관계를 제거하거나 다른 Post로 바꾸지 않는다.
- Alternatives Considered: 최상위 Source로 평탄화, Source snapshot 저장, Tombstone cascade/nullification. 모두 direct 관계와 lifecycle 계약을 잃는다.
- Consequences: 조회 계층은 Content 없는 Repost와 Content 있는 Quote를 구분하고 unavailable Source 관계만
  숨기며, 저장 계층은 관계 보존과 조회 eligibility를 분리한다.
- Confirmation / Follow-up: direct 관계와 Tombstone 뒤 관계 보존은 Repost core service test에서 검증하고, 후속 action과 Post Node·목록 integration에서 생성·조회 정책을 검증한다.

### Active Repost 유일성은 partial unique index와 멱등 core 경계가 함께 보장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-394`, `PROD-401`, `PROD-411`
- Status: Active
- Context / Problem: 순차·동시 duplicate Repost를 하나로 수렴시키면서 Quote와 Tombstone Repost는 같은 Author/Source 조합으로 공존할 수 있어야 한다.
- Decision Outcome: `(profile_id, repost_source_id)`에 `state = ACTIVE`, `current_content_id IS NULL`,
  `repost_source_id IS NOT NULL` predicate를 적용한 partial unique index를 사용한다. 유효한 contentless Post는
  구조 검증상 Reply Parent를 가질 수 없고 Repost action은 `reply_parent_id = null`을 유지한다. core Repost
  action은 unique conflict 뒤 기존 Active Repost를 조회해 같은 성공 결과로 정규화한다. DB constraint
  trigger와 명시적 비관적 row lock은 추가하지 않는다.
- Alternatives Considered: application pre-check만 사용, constraint trigger, `SELECT FOR UPDATE`. pre-check만으로는 동시성을 막지 못하고 trigger/lock은 social interaction에 과도한 결합과 운영 위험을 만든다.
- Consequences: DB가 최종 동시성 경계가 되고 Tombstone 전이가 index membership을 해제한다. conflict 판정은 기존 DB helper와 constraint identity를 사용해야 한다.
- Confirmation / Follow-up: partial unique index 선언은 Drizzle schema·snapshot으로 정렬하고, PROD-401 순차·동시 멱등 테스트와 PROD-411 재Repost 테스트를 수행한다.

### 기존 Post Node에 Repost 관계와 viewer 상태를 확장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-401`, `PROD-402`, `PROD-403`, `PROD-411`, `PROD-414`, `PROD-471`
- Status: Active
- Context / Problem: Repost가 별도 durable object가 아니므로 GraphQL identity와 client normalized cache가 같은 Post Node를 사용해야 한다.
- Decision Outcome: 기존 `Post`에 nullable `repostSource`, non-null `repostCount`, nullable `viewerRepost`를 추가한다. 생성 mutation은 `repostPost(input: { sourceId })`와 `RepostPostPayload.repost`, 삭제는 일반 `deletePost(input: { id })`와 Tombstone Node 대신 `DeletePostPayload.postId`를 유지한다. PROD-471은 같은 canonical 관계 이름을 재사용하는 nullable `DeletePostPayload.repostSource`로 취소된 순수 Repost의 Source Post를 반환한다. `viewerRepost`는 현재 selected Profile의 Active Repost Post identity를 반환한다.
- Alternatives Considered: Repost concrete type, `viewerHasReposted` boolean, 확장 가능한 viewer state wrapper, `cancelRepost` 전용 mutation. concrete type은 canonical과 충돌하고 boolean은 취소할 identity를 잃는다. wrapper는 현재 단일 관계에 비해 과도하며 전용 cancel은 일반 Post 삭제 계약을 중복한다.
- Consequences: API와 Relay fragments는 concrete Post global ID를 유지한다. 생성 payload의 Repost Source와 삭제 payload의 nullable `repostSource`가 같은 Post identity를 사용하므로 Relay는 별도 updater 없이 서버 확정 count/viewer 상태를 정규화한다. 일반 Post 삭제와 Tombstone identity는 기존 `postId` 계약을 유지한다.
- Confirmation / Follow-up: GraphQL schema snapshot, Node/field/mutation integration을 확인하고, PROD-414는 생성 cache와 취소 실행을, PROD-471은 서버 결과 기반 취소 cache 동기화를 검증한다.

### Repost 취소 실행과 Source cache 동기화를 단계화한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-389`, `PROD-414`, `PROD-471`
- Status: Active
- Context / Problem: 현재 `DeletePostPayload`는 삭제된 Repost의 `postId`만 반환하므로 PROD-414가 Source Post의 최신 `repostCount`와 selected Profile별 `viewerRepost`를 서버 결과로 정규화할 수 없다.
- Decision Outcome: PROD-414는 조회된 Active Repost ID로 `deletePost`를 호출해 취소를 실제 수행하되 취소 성공 뒤 Source cache를 직접 변경하지 않는다. PROD-471은 nullable `DeletePostPayload.repostSource`에서 Source Post의 `id`, 서버 확정 `repostCount`와 selected Profile별 `viewerRepost`를 반환하고, Repost child mutation이 이를 선택해 같은 actor Store의 normalized Source record를 갱신한다.
- Alternatives Considered: PROD-414에서 count를 직접 감소, 광범위한 cache invalidation 또는 임시 refetch, PROD-414 안에서 API payload까지 확장. 직접 산술은 viewer-independent 서버 집계와 어긋날 수 있고, 광범위한 invalidation/refetch는 현재 client 경계를 넓히며, API 확장은 프론트엔드 이슈 범위를 넘으므로 사용하지 않는다.
- Consequences: client count 산술, 광범위한 invalidation, refetch나 connection updater 없이 같은 Source를 표시하는 현재 actor Store의 surface가 서버 결과로 일치한다. 다른 selected Profile의 actor Store에는 이 payload가 전파되지 않는다.
- Confirmation / Follow-up: PROD-414는 정확한 취소 identity와 cache 비변경을 검증하고, PROD-471은 서버 결과, 같은 actor Store 일치, actor 간 격리와 client Relay cache 테스트를 검증한다.

### Repost mutation adapter와 PostActionBar 공개 UI를 분리한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-414`, `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: PROD-433은 공용 action UI의 공개 경계를 `PostActionBar` 하나로 제한하고 PROD-432는 production full-bar 조립과 action 실패 toast를 소유한다. PROD-414가 독립 공개 Repost component나 persistent 오류 UI를 추가하면 이 경계를 중복한다.
- Decision Outcome: PROD-414는 Post fragment와 mutations를 colocate한 내부 `useRepostAction` adapter로 `PostActionBar.repost` config를 제공한다. #341로 main에 포함된 PROD-433의 공개 UI를 직접 재사용하고 Draft PR base를 `main`으로 유지하며, branch 코드를 복사하거나 Action Bar를 중복 구현하지 않는다. Storybook 전용 wrapper는 Repost config 하나만 조립한다. adapter는 mutation 실패 시 pending을 종료하고 서버 확정 domain/cache 상태를 유지한 채 error callback을 호출하며, production의 접근 가능한 한국어 오류 toast와 실제 full-bar 연결은 PROD-432에 남긴다. persistent error·retry UI와 success toast는 추가하지 않는다.
- Alternatives Considered: PR #341 merge까지 구현 대기, 독립 공개 Repost action leaf, 부모 branch 코드 복사 또는 중복 구현, PROD-414의 persistent 오류·재시도·성공 UI. merge 대기는 해결된 review thread와 green CI 뒤에도 구현을 직렬화하고, 나머지는 공개 UI 또는 통합 책임을 중복하고 cache 상태를 흐리므로 사용하지 않는다.
- Consequences: PROD-414는 main에 포함된 PROD-433의 공개 API를 직접 의존한다. adapter는 실제 production surface와 독립적으로 Storybook·Relay test에서 검증할 수 있지만 사용자가 보는 오류 toast는 PROD-432 연결 뒤 제공된다. #341 squash merge 뒤 자식 branch는 기존 부모·자식 tip을 백업하고 range-diff와 명시적 lease로 main 위에 이동한다.
- Confirmation / Follow-up: Storybook `play` interaction과 raw Relay unit test로 Repost config, pending 중복 차단, create cache, cancel identity/cache 비변경, error callback·다음 입력 재시도와 actor reset을 검증한다.

### Repost child action과 PostActionBar 공개 UI를 조립한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-414`, `PROD-432`, `PROD-433`
- Status: Superseded
- Context / Problem: PROD-433은 공용 action UI의 공개 경계를 `PostActionBar` 하나로 제한하고 PROD-432는 production full-bar 조립·대상 정책과 action 실패 toast를 소유한다. Repost 상태·label·delete identity와 mutation callback을 독립 scalar config로 분해하면 Relay 관계에서 반드시 함께 바뀌어야 하는 값을 유효하지 않은 조합으로 전달할 수 있다.
- Decision Outcome: PROD-414는 `PostActionBar_post` composite fragment가 private `RepostAction_post` child fragment를 spread하게 한다. private `RepostAction`은 child fragment, create/delete mutation, pending, actor 격리와 `viewerRepost` 기반 선택 상태·접근성 label·정확한 delete identity·mutation 종류를 함께 소유하고 공통 private control을 렌더한다. 현재 공개 경계에는 actual Post fragment ref와 error callback만 남긴다. 대상 적격성·현재 실행 주체 권한·guest 인증 위임에서 파생할 최종 disabled 행동은 유지하되, 이를 child에 연결할 concrete host input 또는 fragment shape는 actual production caller와 함께 PROD-432가 설계하고 통합 검증한다. #341로 main에 포함된 PROD-433의 공개 UI를 직접 재사용하고 Draft PR base를 `main`으로 유지하며, branch 코드를 복사하거나 Action Bar를 중복 구현하지 않는다. mutation 실패 시 서버 확정 domain/cache 상태를 유지하고, production의 접근 가능한 한국어 오류 toast와 실제 full-bar 연결은 PROD-432에 남긴다. persistent error·retry UI와 success toast는 추가하지 않는다.
- Alternatives Considered: `useRepostAction`이 `PostActionBar.repost` scalar config를 반환하는 방식, 독립 공개 Repost action leaf, 부모 branch 코드 복사 또는 중복 구현, PROD-414의 persistent 오류·재시도·성공 UI. scalar config는 함께 변해야 하는 Relay 상태와 mutation identity를 분해하고, 나머지는 공개 UI 또는 통합 책임을 중복하고 cache 상태를 흐리므로 사용하지 않는다.
- Consequences: PROD-414는 main에 포함된 PROD-433의 공개 UI와 private common control을 직접 의존한다. composite parent fragment는 실제 production query가 action child fragment를 transitively 포함하게 하고, Storybook도 parent→child fragment ref를 사용한다. 사용자가 보는 오류 toast와 대상 적격성·세션 권한은 PROD-432 연결 뒤 제공된다.
- Confirmation / Follow-up: Storybook `play` interaction과 raw Relay unit test로 actual parent→child fragment 전달, pending 중복 차단, create cache, cancel identity/cache 비변경, error callback·다음 입력 재시도와 actor reset을 검증한다.

### Repost 메뉴와 최초 production surface를 PROD-414에서 완성한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-414`, `PROD-415`, `PROD-431`, `PROD-432`, `PROD-471`
- Status: Active
- Context / Problem: private Repost child만 독립 Storybook에서 검증하면 실제 사용자는 목록·상세에서 action을 사용할 수 없고, 즉시 mutation trigger는 향후 Quote action을 같은 진입점에 추가할 수 없다. 순수 Repost surface가 바깥 Repost identity를 action target으로 사용하면 Content 없는 Repost를 다시 Repost하는 잘못된 요청도 만든다.
- Decision Outcome: PROD-414는 `PostListItem`과 `PostLayout`이 `PostActionBar`를 Post content grid의 마지막 sibling이자 본문·작성자·생성 시각·Source navigation link 밖에 렌더링하게 한다. 일반 Post와 Quote는 자신을, 순수 Repost는 화면에 표시한 direct Source Post를 Action Bar target으로 사용한다. Repost trigger는 선택 여부와 관계없이 menu를 열고, 미선택이면 `재게시하기`, 선택됐으면 `재게시 취소` 항목 하나를 표시한 뒤 항목 선택으로 mutation을 시작한다. Web은 trigger 근처 anchored menu, Android·iOS는 bottom action sheet를 사용한다. `인용하기`는 PROD-431 전까지 disabled나 placeholder로도 노출하지 않는다. PROD-414 surface는 생성·취소 실패를 정확한 action별 한국어 transient toast와 alert semantics로 알리고 이전 서버 확정 상태·cache를 유지한다. PROD-432는 나머지 action 조립, 최종 disabled 정책과 전체 통합 검증을 계속 소유한다.
- Alternatives Considered: 즉시 mutation 유지, 선택 상태에서만 즉시 취소, 순수 Repost 바깥 identity를 action target으로 사용, 최초 production 조립과 Repost toast를 PROD-432까지 연기. 각각 미래 Quote 진입점을 막거나 비대칭 interaction을 만들고, 잘못된 Source를 대상으로 하거나 PROD-414를 실제 사용자에게 전달할 수 없는 slice로 남기므로 채택하지 않았다.
- Consequences: PROD-414의 기존 fragment·mutation slice 뒤에 production surface, cross-platform menu와 Repost toast 작업이 추가된다. PROD-415는 canonical Source navigation과 direct Repost URL redirect를, PROD-431은 미래 `인용하기`, PROD-471은 취소 cache 동기화를 독립 소유한다.
- Confirmation / Follow-up: 목록·상세의 final sibling·link 비중첩, 순수 Repost Source target, menu label·dismiss·keyboard/back·접근성, 항목 선택 뒤 mutation, action별 toast와 실패 뒤 상태 유지·재시도를 검증한다.

### Repost menu와 toast는 최소 공용 platform 경계로 제공한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/post-action-bar.md`, `PROD-414`
- Status: Active
- Context / Problem: 목록 row마다 toast host를 두거나 Web·Native의 서로 다른 menu 위치 동작을 `RepostAction`에 직접 결합하면 transient UI 수명과 mutation 상태 소유권이 뒤섞인다. 현재 앱에는 요구 계약을 만족하는 공용 toast 또는 bottom action sheet가 없다.
- Decision Outcome: 새 외부 dependency 없이 앱 provider에 하나의 transient toast host를 두고, Repost surface는 action별 error callback을 host에 연결한다. toast는 safe area와 고정 탭 바 위의 화면 하단에 표시하고 약 3초 뒤 사라지며 latest-replace, no close/retry control, no success toast와 alert semantics를 사용한다. action menu는 공용 항목·open·dismiss·선택 결과 경계를 공유하되 Web anchored popup과 Android·iOS bottom action sheet를 platform 구현으로 분리할 수 있다. private `RepostAction`은 fragment·mutation·pending·actor 격리를 계속 소유한다.
- Alternatives Considered: 각 Post row의 toast, `PostActionBar` 내부 global toast, 모든 플랫폼의 중앙 `ModalSheet`, 새 menu/toast package. 각각 중복 host, UI와 action 상태 결합, 승인된 platform 동작 불일치 또는 불필요한 dependency를 만들므로 채택하지 않았다.
- Consequences: toast provider는 다른 action이 재사용할 수 있는 최소 API만 제공하지만 PROD-414는 Repost 문구와 surface 연결만 구현한다. menu primitive는 미래 항목을 받을 수 있으나 PROD-431 전에는 Quote action을 노출하지 않는다.
- Confirmation / Follow-up: toast latest-replace·자동 dismiss·alert semantics·safe area와 Web/native menu interaction을 unit·component·runtime 검증으로 확인한다.

### Source 접근 실패는 Repost와 Quote에 다르게 적용한다

- Decision Date: 2026-07-23
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-402`, `PROD-430`
- Status: Active
- Context / Problem: Source를 조회할 수 없다는 이유로 Content 있는 Quote까지 숨기면 Quote Author가 작성한
  독립 Content와 Visibility가 Source lifecycle에 종속된다. 반면 Content 없는 Repost는 Source 없이 표시할
  내용이 없다.
- Decision Outcome: Content 없는 Repost는 direct Source가 viewer 기준 Post Visibility와 Post Eligibility를
  통과할 때만 Node와 목록 후보로 반환한다. Content 있는 Quote와 Reply+Quote는 자신의 조회 정책을 통과하면
  Source와 무관하게 반환하고, direct Source를 조회할 수 없으면 nullable `repostSource`만 `null`로 반환한다.
  Source의 Source까지 재귀 판정해 바깥 Quote를 숨기지 않는다.
- Alternatives Considered: Repost와 Quote 모두 전체 Source chain으로 제외, 두 구조 모두 Source와 독립
  노출. 전자는 Quote Content를 Source lifecycle에 종속시키고 후자는 내용 없는 Repost를 불완전하게
  노출하므로 사용하지 않는다.
- Consequences: 전역 Post/PostContent loader에는 Source 조건을 적용하지 않는다. Content 없는 Repost 후보
  query만 direct Source를 page limit 전에 검증하고 `repostSource` relation loader는 직접 Source를 독립
  조회한다.
- Confirmation / Follow-up: PROD-402는 unavailable Source의 Repost 제외와 Quote 유지·nullable Source를,
  PROD-430은 mixed Repost/Quote pagination을 검증한다.

### Repost count와 viewer relation query를 분리한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-403`
- Status: Active
- Context / Problem: count는 모든 viewer에게 같아야 하지만 현재 Profile의 Active Repost identity는 actor별로 달라야 한다.
- Decision Outcome: `repostCount`는 direct eligible Active Repost를 viewer와 무관하게 집계하고, `viewerRepost`는 현재 selected Profile ID로 별도 조회한다. Profile Block/Mute 같은 viewer별 control을 count membership에 사용하지 않는다.
- Alternatives Considered: 현재 viewer가 볼 수 있는 Repost만 count, boolean viewer 상태. 전자는 viewer-independent 계약을 깨고 후자는 취소 identity를 제공하지 못한다.
- Consequences: API는 두 값을 별도 batched query 또는 동등한 loader로 계산하고 selected Profile 전환은 새 Relay actor Store에서 재조회한다.
- Confirmation / Follow-up: 서로 다른 viewer의 동일 count, selected Profile 격리, Quote/Tombstone 제외와 N+1 회귀를 검증한다.

### Repost Notification은 기존 loose projection과 concrete type을 확장한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416`
- Status: Active
- Context / Problem: Follow 기반 Notification에 Repost를 추가하면서 source-specific table이나 generic fallback 없이 kind별 relation과 visibility를 검증해야 한다.
- Decision Outcome: 기존 `notification` row에 `kind = REPOST`, `source_id = Source Repost Post.id`, `data = {}`를 저장한다. GraphQL은 `RepostNotification implements Notification & Node`와 `profile`, `post` 필드를 제공한다. connection/count/Node/Read는 kind별 visible projection을 limit 전에 조립하고 raw kind/source/data를 노출하지 않는다.
- Alternatives Considered: Repost Notification table, Post foreign key, snapshot JSON, generic Notification object. 모두 기존 loose projection 계약 또는 source-derived relation과 cleanup 격리를 훼손한다.
- Consequences: Follow-only join과 client branch를 kind-aware 구조로 확장하고 concrete typename이 row kind와 visibility를 직접 검증해야 한다.
- Confirmation / Follow-up: mixed-kind pagination, Node route, hidden item, inbox navigation, Read와 badge/cache integration을 검증한다.

### Notification create와 cleanup은 source commit 뒤 같은 request에서 실패를 격리한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416`
- Status: Superseded
- Context / Problem: Notification이 Repost 결과를 rollback하면 안 되지만 fire-and-forget은 실패 시점과 테스트 경계를 잃는다.
- Decision Outcome: Repost 생성 또는 Tombstone transaction이 commit된 뒤 같은 request에서 idempotent Notification create/delete port를 await하고 오류를 catch한다. retry, outbox, queue와 backfill은 추가하지 않는다.
- Alternatives Considered: source transaction 안에서 저장·삭제, fire-and-forget, worker/outbox. transaction 결합은 source 성공을 바꾸고 fire-and-forget은 관측 불가능하며 worker/outbox는 승인 범위를 넘는다.
- Consequences: 성공 응답 latency에 짧은 Notification 시도가 포함되지만 source 결과는 보존된다. cleanup 실패 잔존 행은 visible predicate가 숨긴다.
- Confirmation / Follow-up: 저장·cleanup 실패 주입, 반복 처리와 프로세스 간격의 hidden-row API 테스트를 수행한다.

### Repost lifecycle은 transaction composition과 독립된 공용 action이 소유한다

- Decision Date: 2026-08-05
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-416`, `PROD-669`
- Status: Superseded
- Context / Problem: 기존 Repost action은 optional caller transaction의 존재를 Notification과 ActivityPub lifecycle의 provenance처럼 해석해 inbound Announce가 공용 action을 사용해도 post-commit effect를 빠뜨릴 수 있었다. `memory/review-style.md`의 Commit And Side Effects 원칙과 `packages/core/services/reaction.ts`의 명시적 origin·postCommit 구현은 이 저장소의 기존 구현 패턴으로 참고한다.
- Decision Outcome: `repostPost`와 `deletePost`는 `origin = LOCAL | ACTIVITYPUB`를 명시적으로 받고 transaction 유무와 무관하게 실제 상태 전이 결과를 기준으로 한 번 실행 가능한 `postCommit()`을 반환한다. caller-owned transaction은 mapping/domain mutation을 같은 transaction에 합친 뒤 outer commit 후 반환된 lifecycle을 실행한다. Notification create/cleanup은 실제 새 Repost 또는 실제 삭제된 pure Repost를 기준으로 하고, Fedify Announce/Undo와 Local Post Delete delivery는 `origin = LOCAL`인 경우에만 시도한다. duplicate/no-transition 결과의 lifecycle은 no-op이다.
- Supersedes: PROD-669의 tx-gated Repost lifecycle 구현 선택
- Alternatives Considered: transaction 유무에 따른 분기, inbound handler의 Notification 직접 호출, Repost 전용 in-transaction helper 분리. 모두 공용 action의 lifecycle ownership을 caller별로 복제하거나 transaction composition과 provenance를 결합한다.
- Consequences: GraphQL과 ActivityPub caller는 동일한 core action과 result shape를 사용하고, ActivityPub caller는 commit 경계만 소유한다. Notification/delivery failure는 committed domain transition을 실패시키지 않는다.
- Confirmation / Follow-up: Local/ActivityPub 및 top-level/caller-tx 조합, rollback-before-postCommit, repeated postCommit, duplicate/no-op, failure isolation과 ActivityPub outbound echo suppression을 core·Fedify·API 테스트로 검증한다.

### Repost 후속 효과는 accepted Temporal Workflow가 재시도한다

- Decision Date: 2026-08-16
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/notification.md`, `PROD-725`
- Status: Active
- Context / Problem: PROD-669의 caller-owned transaction과 `postCommit()`은 최신 PROD-725가 제거하기로 한 database handle·process-local effect 경계와 충돌한다.
- Decision Outcome: 기존 public `repostPost` action이 `origin = LOCAL | ACTIVITYPUB` 입력을 받고 자체 transaction을 소유한다. ActivityPub 입력에서는 Announce URI와 delivery metadata를 일반 `createPost`와 같은 Repost 저장 경계에서 기록한다. 최초 실제 Repost 생성 또는 Post/Repost 삭제 commit 뒤 event-specific Workflow start를 시도하고, accepted Workflow가 Notification과 Local-origin Announce·Undo queue handoff를 독립적으로 재시도한다.
- Alternatives Considered: 기존 `postCommit()` 유지, caller-owned transaction, 별도 ActivityPub materialization/Undo action, command receipt와 outbox는 PROD-725에서 제외됐다.
- Consequences: caller database handle과 `postCommit()`은 제거되며, commit→start gap은 허용된다. ActivityPub origin은 outbound echo 없이 Repost Notification cleanup/create 계약만 수행한다. PROD-495가 정한 ActivityPub identity·generation·no-lock 동작은 변경하지 않는다.
- Confirmation / Follow-up: `transition-repost-effects-to-temporal-workflow` change의 구현·strict validation·dev 통합 검증에서 확인한다.

### Presentation, renderer 연결과 action child를 독립 client slice로 유지한다

- Decision Date: 2026-07-21
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-414`, `PROD-415`, `PROD-432`, `PROD-433`, `PROD-453`, `PROD-471`
- Status: Superseded
- Context / Problem: presentation은 API 없이 먼저 검증할 수 있지만 production 목록 연결과 mutation action은 각기 다른 선행 조건을 가진다.
- Decision Outcome: PROD-453은 production fragment shape를 따르는 typed fixture·Storybook·mock navigation으로 Repost/Quote presentation을 소유한다. 실제 관계 field를 읽는 Relay operation·fragment와 generated type은 PROD-415에 남긴다. PROD-415는 공용 `PostListItem`과 현재 상세의 `PostLayout`에 presentation을 연결하고 Content 없는 Repost 상세를 direct Source canonical route로 대체한다. PROD-414는 `PostActionBar` composite fragment, private Repost child fragment·mutation·pending, 생성 cache 동기화와 취소 실행을 소유한다. PROD-471은 취소 성공 뒤 Source cache 동기화를 소유하고, 실제 production Action Bar surface 조립·대상 정책과 오류 toast는 PROD-432에 남긴다.
- Alternatives Considered: 하나의 목록 컴포넌트에서 presentation·action·route를 모두 구현, raw scalar props, raw fragment key cast. 모두 이슈 의존성과 Relay colocation 경계를 흐린다.
- Consequences: presentation 결과는 목록 연결 전에도 독립 검증되며, actual Post fragment ref를 받는 Storybook 전용 `PostActionBar` wrapper로 실제 production surface 조립 전에 Repost child action을 완료할 수 있다.
- Confirmation / Follow-up: Storybook 상태/`play` interaction, raw Relay unit, Relay compile, Home/Profile/Bookmark와 Post 상세 integration, Content 없는 Repost canonical replace와 PROD-432 제외 범위를 확인한다.

### Repost와 Quote는 Source의 시각 계층을 다르게 사용한다

- Decision Date: 2026-07-24
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-415`, `PROD-453`
- Status: Superseded
- Context / Problem: presentation slice가 기존 Post의 Author·Content·생성 시각을 보존하면서 Repost Author와 direct Source, Quote Author와 Source preview를 구분해야 한다.
- Decision Outcome: 순수 Repost(content 없음 + direct Source 있음 + Reply Parent 없음)는 Repost Author의 canonical Profile Link attribution을 정확히 한 번 표시한 뒤 direct Source를 일반 Post와 같은 표준 목록 행 leaf로 표시한다. 이 경로에는 Source용 별도 full presentation·article·row border·renderer를 두지 않는다. 순수 Repost의 direct Source 자체가 Quote인 조합의 preview 정책은 2026-07-27 PROD-415 creator reply에 따라 이번 slice의 완료 조건에서 제외한다. Quote와 Reply+Quote는 Quote Author·자체 Content·생성 시각 뒤에 direct Source를 compact bordered preview로 표시하고, 일반 Content Post도 기존 생성 시각 표시를 유지한다. Quote Source preview의 Source Author와 Source Post affordance는 body link와 sibling으로 두고 자체 Action Bar를 두지 않는다. nullable Source Quote는 자체 Author·Content·생성 시각을 유지하고 preview/navigation만 생략한다. PROD-453은 story-only typed fixture adapter와 internal presentation model을 소유했고 fixture-only 단계에서 mock navigation을 검증했다. 실제 Post/Source Relay field·generated type·production navigation은 PROD-415가 통합한다.
- Alternatives Considered: Source를 바깥 Post의 Content처럼 평탄화하는 방식, Source body 전체를 하나의 Link로 감싸는 방식, 일반 Post와 Quote의 outer 생성 시각을 parent integration까지 생략하는 방식. 각각 관계 역할을 흐리거나 body의 외부 Link와 중첩되고 기존 Post 표시 회귀를 만든다.
- Consequences: `PostListItem`은 ordinary Post와 pure Repost Source에 같은 비재귀 표준 행 leaf를 사용하고 article·row border를 한 번만 소유한다. Quote presentation은 compact bordered preview 경계를 유지한다. Repost-of-Quote의 preview 유지 여부는 이 결정에서 고정하지 않는다.
- Confirmation / Follow-up: Storybook에서 pure Repost attribution 1회, Repost/Source Author 구분, ordinary와 Source의 동일 표준 행, 단일 article·border, Quote의 outer 생성 시각, Source Post target, nullable Source와 긴 내용·화면 폭을 production Relay wiring으로 검증한다.

### 중첩 Source는 direct Source 한 단계까지만 full presentation한다

- Decision Date: 2026-07-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-415`
- Status: Active
- Context / Problem: direct Source 자체가 Quote이면 저장된 다음 Source 관계를 보존하면서도 목록에서 full Source preview가 무제한으로 재귀하는 것을 막아야 한다.
- Decision Outcome: direct Source의 Author·Content·생성 시각은 첫 번째 full presentation으로 표시한다. Source Author는 canonical Profile route로 이동하고 direct Source의 생성 시각과 본문 영역은 direct Source의 canonical Post route로 이동한다. 두 번째 Source의 Author·Content·생성 시각과 별도 placeholder·CTA는 표시하지 않고 presentation component를 재귀 호출하지 않는다.
- Alternatives Considered: 두 번째 Source route를 별도 `인용한 게시글 보기` placeholder로 제공하는 방식, 다음 Source를 최상위 Source로 평탄화하는 방식, 모든 Source를 full presentation으로 재귀 표시하는 방식. 별도 placeholder는 이미 표시된 direct Source 이동과 중복되는 CTA를 만들고, 평탄화는 저장된 direct relation을 잃으며, 재귀 표시는 목록 깊이와 fragment shape를 무제한으로 확장한다.
- Consequences: production fragment는 direct Source presentation field까지만 읽는 유한한 shape를 사용하며 두 번째 Source를 위한 client field나 이동 UI를 만들지 않는다.
- Confirmation / Follow-up: Home/Profile/Bookmark와 Post 상세 Relay 경로, Storybook에서 Quote-of-Quote cutoff, direct Source 생성 시각·본문의 정확한 canonical route 이동, 두 번째 Source Content와 CTA 미노출, 외부 body Link와의 비중첩을 검증한다. 순수 Repost의 direct Source가 Quote인 조합은 후속에서 별도 결정한다.

### 각 Post renderer가 direct Source를 소유하고 순수 Repost 상세은 Source로 대체한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `PROD-415`, `PROD-422`
- Status: Active
- Context / Problem: `PostDetailThread`가 바깥 Post renderer 뒤에 Source `PostListItem`을 추가하면 Source를 이미 소유한 목록 renderer와 중복되고, 현재 상세 Post만 별도 Source 구성이 필요해 renderer별 동작이 갈라진다. Content 없는 Repost는 표시할 자체 Content가 없어 독립 상세 surface와 공유 참조가 Source 이동을 중복한다.
- Decision Outcome: Home·Profile·Bookmark 및 상세 thread의 조상·하위 Reply는 `PostListItem`이, 현재 상세 Post는 `PostLayout`이 자신의 nullable direct Source를 소유한다. Quote·Reply+Quote의 preview는 `PostBody` 아래 테두리 있는 sibling으로 정확히 한 번 표시하고 direct Source 한 단계에서 멈춘다. Content 없는 Repost의 `PostListItem`은 Repost Author Profile Link attribution 뒤 direct Source를 ordinary Post와 같은 비재귀 표준 목록 행 leaf로 표시하며 outer article과 padding을 한 번만 소유한다. 순수 Repost의 direct Source 자체가 Quote인 조합은 이번 slice에서 별도 preview 계약을 추가하지 않는다. `PostDetailThread`는 Source를 선택·운반·추가 렌더링하지 않는다. thread connector segment는 목록형 48px avatar와 현재 상세 40px avatar의 위·아래에서 각각 4px 떨어지고 둥근 끝을 사용한다. Thread row boundary presentation은 이 Repost Source 결정의 소유 범위가 아니며 적용되는 canonical `docs/design/post-thread.md`를 따른다. Content 없는 Repost 상세 진입은 조회 가능한 direct Source의 canonical Post route로 `replace`하며 Repost 자체 surface·history entry·공유 참조를 남기지 않는다.
- Alternatives Considered: Thread가 Source `PostListItem` sibling을 조립하는 방식, `PostSourcePresentationView` 전체를 중첩하는 방식, contentless Repost 자체 상세을 유지하는 방식, Source route로 `push`하는 방식. Thread 조립은 renderer-owned Source와 중복되고 전체 중첩은 바깥 Author·Content와 Link를 복제하며, 별도 상세과 `push`는 자체 Content가 없는 중간 URL과 history entry를 만든다.
- Consequences: Quote 목록·상세은 같은 direct Source preview 동작을 유지하고 pure Repost 목록은 ordinary 표준 행을 재사용한다. Post 상세 query는 renderer fragment만 spread하고 Source carrier를 제거하며, 순수 Repost redirect 동안 thread를 렌더하지 않는다. Source가 unavailable하면 기존 API eligibility로 Repost 자체가 조회되지 않으므로 숨겨진 경로를 추론하지 않는다.
- Confirmation / Follow-up: 현재·조상·하위 Reply Quote의 Source가 정확히 한 번만 표시되고 다음 Source depth와 CTA가 없는지, pure Repost가 attribution 뒤 동일 표준 행·단일 article을 갖는지, Source null Quote가 자체 Content를 유지하는지, Content 없는 Repost 경로가 Source canonical route로 replace되는지, 기존 thread 순서·pagination·오류 복구가 유지되는지 검증한다. production Storybook은 48px 목록형 avatar와 40px 현재 avatar 모두 connector 위·아래 간격이 4px이며 끝이 둥근지도 검증한다.

### Post Source presentation이 canonical navigation을 직접 소유한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-415`, `PROD-453`, PR #357 review thread, 2026-07-27 사용자 확인
- Status: Active
- Context / Problem: PROD-453의 fixture-only 단계에서는 Storybook mock target을 검증하기 위해 replaceable link renderer와 navigation callback을 사용했지만 production integration 뒤에는 `PostListItem`과 `PostLayout`이 같은 canonical 목적지 mapping을 중복 조립한다. production의 두 번째 navigation 구현은 없으며 caller가 renderer나 callback을 대체하면 필수 navigation을 제거할 수 있다.
- Decision Outcome: `PostSourcePresentationView`와 `PostSourcePreview`는 presentation data의 `relativeHandle`과 Post ID로 Author Profile·Post detail·Source Profile·Source Post href를 직접 만들고 고정 Expo Router Link를 렌더링한다. Post·Source body shortcut은 같은 파일의 non-accessible Pressable이 내부 `router.push()`로 이동한다. `PostPresentationLinkRenderer`, target enum, `renderLink`, `onPostPress`, `onSourcePostPress` public API는 제거한다. `PostListItem`의 비재귀 표준 목록 행 leaf도 own Post fragment에서 canonical navigation을 직접 만들며 ordinary Post와 pure Repost Source에 같은 wiring을 사용한다. 표준 행의 생성 시각은 keyboard·screen reader·pointer가 사용하는 최소 44px canonical Post Link이고, 본문 행은 내부 외부 Link와 중첩되지 않는 pointer·touch shortcut이다. Storybook은 공용 Router decorator에서 실제 pathname 변화를 검증한다.
- Alternatives Considered: generic renderer seam을 유지하고 production wrapper만 공용화하는 방식은 두 번째 runtime 구현 없이 Storybook을 위해 replaceable seam과 wrapper를 함께 유지한다. caller별 renderer를 유지하는 방식은 mapping 중복과 필수 navigation 우회 가능성을 남긴다. body 전체를 접근 가능한 Link로 만드는 방식은 body 내부 외부 Link와 nested interactive semantics를 만든다.
- Consequences: presentation과 표준 행 leaf는 Expo Router에 직접 의존하지만 production과 Storybook이 같은 navigation wiring을 실행한다. caller는 Relay data와 layout만 소유하며 navigation을 생략하거나 다른 target으로 바꿀 수 없다. 목적지별 sibling 구조, bordered padding 비활성, current-detail self-navigation 부재는 유지한다.
- Confirmation / Follow-up: Storybook에서 Repost/Quote/Source Author와 Post의 실제 pathname, ordinary·pure Repost Source 표준 행의 44px timestamp Link와 pointer·touch body shortcut, Quote·Source body의 분리, 외부 Link 뒤 pathname 불변, 빈 preview padding 비활성, nested interactive 부재와 현재 상세 Source navigation을 검증한다.

### Post와 Source preview의 이동 영역을 목적지별로 분리한다

- Decision Date: 2026-07-26
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-415`, 2026-07-26 사용자 확인
- Status: Active
- Context / Problem: Quote 자체 Post, bordered direct Source preview와 body의 외부 Link는 서로 다른 목적지를 가진다. preview 전체나 body 전체를 하나의 Link로 만들면 Source Author의 Profile Link 또는 body의 외부 Link가 중첩되며, pointer 전용 body 이동을 실제 Link처럼 접근성 tree에 노출하면 같은 중첩 interactive 구조를 다시 만든다.
- Decision Outcome: bordered Source preview는 시각적 그룹 경계이며 하나의 Link가 아니다. Source Avatar·Author는 canonical Profile Link, Source 생성 시각은 keyboard·screen reader·pointer가 사용하는 최소 44px canonical Post Link다. Source 본문 행은 pointer·touch에서 같은 Source Post로 이동하는 넓은 shortcut이지만 별도 accessibility element나 keyboard focus target으로 만들지 않는다. 본문 안 외부 Link는 event propagation을 차단하고 자신의 외부 URL로 이동하며, border의 빈 padding에는 이동 동작을 두지 않는다. Home·Profile·Bookmark와 상세 thread의 조상·하위 Reply를 렌더링하는 `PostListItem`에서는 Quote 자체 생성 시각이 Quote Post의 canonical Link를 유지하고 Quote 자체 본문 행도 같은 원칙의 pointer·touch shortcut으로 Quote Post로 이동한다. 이미 자기 canonical route인 현재 상세 `PostLayout`에는 self Link나 동일 URL history entry를 추가하지 않고 direct Source 이동만 제공한다. 이 구분은 style이나 layout을 바꾸지 않는다.
- Alternatives Considered: bordered preview 전체를 Source Post Link로 만드는 방식은 Source Author Profile과 외부 body Link를 중첩시킨다. body 전체를 독립된 접근 가능한 Link로 만드는 방식도 외부 body Link와 nested interactive semantics를 만들며, link가 없는 text run만 각각 Link로 분할하는 방식은 하나의 본문에 중복 focus target을 늘린다. Source Author와 외부 Link를 제거하고 preview 전체를 단일 Link로 만드는 방식은 승인된 목적지를 잃는다.
- Consequences: keyboard·screen reader 사용자는 Source 생성 시각의 `원문 게시글 보기` Link로 Source Post에 접근하고, pointer·touch 사용자는 생성 시각 또는 본문 행을 사용할 수 있다. Source Author Profile과 body 외부 Link는 독립 목적지를 유지한다. `PostListItem` 회귀 검증은 Quote 자체 본문 shortcut이 바깥 Quote Post로 이동하고 Source Post로 잘못 이동하지 않는지 확인해야 한다. 현재 상세은 self navigation을 만들지 않는다.
- Confirmation / Follow-up: Storybook에서 `PostListItem`의 Quote 자체 본문, 공용 preview의 Source 생성 시각·본문·Author와 외부 body Link의 목적지를 각각 검증하고 `a a` 및 `[role="link"] [role="link"]`가 없음을 확인한다. 현재 상세 `PostLayout`은 direct Source navigation만 검증한다. 시각 변화가 없으므로 별도 visual re-review는 요구하지 않는다.

### Repost와 Quote의 canonical navigation target을 분리한다

- Decision Date: 2026-07-27
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-389`, `PROD-414`, `PROD-415`, `PROD-453`
- Status: Active
- Context / Problem: 순수 Repost에 자체 detail을 만들거나 바깥 Repost route로 이동하면 화면에 표시한 Source와 canonical navigation target이 달라진다. 반면 Content가 있는 Quote는 독립 Post이므로 자체 detail을 잃어서는 안 된다.
- Decision Outcome: 순수 Repost의 body·생성 시각 affordance는 Source Author의 `relativeHandle`과 Source Post ID를 사용하는 canonical route로 이동하고, 순수 Repost ID의 상세 URL을 직접 열어도 Source canonical route로 replace redirect한다. 순수 Repost 아래 Action Bar도 direct Source를 대상으로 한다. Quote는 자체 canonical detail을 유지하고 Source preview만 Source detail로 이동한다. unavailable Source는 기존 unavailable/not-found 결과를 사용하며 불완전한 placeholder나 redirect loop를 만들지 않는다.
- Alternatives Considered: Repost 자체 detail, 모든 Repost·Quote를 Source detail로 이동, unavailable Source placeholder. 각각 presentation과 target을 분리하거나 Quote identity를 잃고, 조회 정책을 client가 우회하므로 채택하지 않았다.
- Consequences: PROD-415의 production wrapper와 detail route query는 Source canonical target과 replace redirect를 연결해야 한다. PROD-414는 순수 Repost surface에서 Source fragment를 Action Bar에 공급하고 PROD-453 presentation은 route를 직접 소유하지 않는다.
- Confirmation / Follow-up: Home/Profile navigation, direct Repost URL replace, Quote 자체 detail과 Source preview 분리, unavailable 결과와 redirect loop 부재를 검증한다.

### Presentation, navigation과 Repost action을 전달 가능한 client slice로 유지한다

- Decision Date: 2026-07-27
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/design/post-action-bar.md`, `PROD-389`, `PROD-414`, `PROD-415`, `PROD-432`, `PROD-433`, `PROD-453`, `PROD-471`
- Status: Active
- Context / Problem: presentation, production navigation, Repost action과 전체 Action Bar 통합은 서로 다른 선행 조건을 가지지만 실제 사용 가능한 Repost action을 최종 통합 이슈까지 미루면 PROD-414의 전달 결과가 독립적으로 완성되지 않는다.
- Decision Outcome: PROD-453은 typed fixture·Storybook·mock navigation presentation을 소유하고 PROD-415는 실제 Relay field, Home/Profile 연결과 canonical Source navigation을 소유한다. PROD-414는 private Repost child의 fragment·mutation·pending·cache 경계와 함께 최초 production Action Bar 배치, Repost menu와 실패 toast를 소유한다. PROD-471은 취소 성공 뒤 Source cache 동기화를 소유한다. PROD-432는 나머지 action 조립, 최종 대상·세션 policy, More와 공유 Action Bar의 전체 통합 검증·archive를 소유한다.
- Alternatives Considered: presentation·navigation·action·최종 통합을 하나의 이슈에 모으거나, 모든 production surface 연결을 PROD-432까지 연기. 전자는 독립 선행 조건과 리뷰 경계를 잃고 후자는 PROD-414의 실제 사용자 결과를 미완성으로 남기므로 채택하지 않았다.
- Consequences: 같은 `PostListItem`·`PostLayout`을 수정하는 이슈는 최신 head와 fragment ownership을 대조해야 한다. PROD-414 production surface를 시작할 때 PR #357이 열려 있으면 검증한 exact `prod-415` head 위에 PROD-414 고유 변경만 stack하고 PR base를 `prod-415`로 두며, 이미 merge됐으면 해당 merge가 포함된 최신 `main` 위에서 이어간다. 완료 여부는 각 issue task와 두 공유 OpenSpec의 정합성을 함께 확인한다.
- Confirmation / Follow-up: PROD-414·415 scoped test와 PROD-432 최종 integration에서 각 slice의 포함·제외 범위를 교차 확인한다.

### 부모 change가 전체 계약과 archive를 소유한다

- Decision Date: 2026-07-21
- Decision Class: Derived Contract
- Authority / Provenance: `PROD-389`, `PROD-394`, `PROD-401`, `PROD-402`, `PROD-403`, `PROD-411`, `PROD-412`, `PROD-414`, `PROD-430`, `PROD-415`, `PROD-416`, `PROD-453`, `PROD-471`
- Status: Active
- Context / Problem: 저장, API, UI와 Notification이 여러 PR로 분리되지만 하나의 Repost 제품 결과와 통합 검증을 공유한다.
- Decision Outcome: 하나의 `add-post-reposts` change에서 각 구현 이슈별 task와 검증 책임을 유지한다. 자식 PR 완료만으로 change를 archive하지 않고 PROD-389가 모든 child 결과, vertical flow, canonical 정합성과 archive 후 strict validation을 소유한다.
- Alternatives Considered: child별 OpenSpec, 중간 slice archive, Project 전체 backlog change. 모두 공유 계약을 복제하거나 완료 상태를 잘못 표현한다.
- Consequences: PROD-394가 완료돼도 나머지 task는 미완료로 유지되고 change는 active 상태를 유지한다.
- Confirmation / Follow-up: 부모 Completion Gate에서 child/PR, requirement scenario, integration과 archive diff를 함께 검증한다.

### Repost Source 오류는 조회 가능성과 Repost 가능성을 구분한다

- Decision Date: 2026-07-22
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-401`
- Status: Active
- Context / Problem: Source가 없거나 조회 불가능한 경우에는 존재와 비공개 상태를 숨겨야 하지만, 호출자가 이미 조회할 수 있는 Content 없는 Repost, Mentioned Profiles와 타인 Followers Only Source는 존재를 숨겨도 입력을 수정할 근거가 부족하다.
- Decision Outcome: 누락·Tombstone·viewer 기준 조회 불가 Source는 `NOT_FOUND`로 처리한다. 호출자가 조회할 수 있지만 구조 또는 Repost visibility 정책상 허용되지 않는 Source는 `VALIDATION`과 `sourceId` field로 처리한다. `usingProfile`의 Account/Profile membership 또는 selected Profile 가용성 검증 실패는 `PERMISSION_DENIED`로 처리한다.
- Alternatives Considered: 모든 허용되지 않는 Source를 `NOT_FOUND`로 통일하는 방식은 비공개 정보 보호는 단순하지만 이미 조회 권한이 있는 입력에도 수정 가능한 field 오류를 제공하지 못한다. 세부 원인별 error type을 늘리는 방식은 현재 GraphQL error 계약에 비해 과도하다.
- Consequences: core action은 viewer 기준 Source 조회 가능성을 먼저 확인한 뒤 Repost 전용 구조·visibility 정책을 검증해야 하며, GraphQL은 기존 domain error mapping을 그대로 사용한다.
- Confirmation / Follow-up: 누락·Tombstone·비공개 Source의 `NOT_FOUND`, 조회 가능한 허용 불가 Source의 `VALIDATION(sourceId)`, 진입점 권한 실패의 `PERMISSION_DENIED`를 core/API integration test로 검증한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-07-24 `Repost와 Quote는 Source의 시각 계층을 다르게 사용한다` 결정 중 Storybook mock link renderer를 production integration에도 유지하고 caller wrapper가 canonical Link를 공급한다는 구현 경계는 2026-07-27 `Post Source presentation이 canonical navigation을 직접 소유한다` 결정으로 대체한다. typed fixture와 Repost·Quote 시각 계층 소유권은 유지한다.
- 2026-07-24 `Repost mutation adapter와 PostActionBar 공개 UI를 분리한다`는 2026-07-26 `Repost child action과 PostActionBar 공개 UI를 조립한다`로 대체했다.
- 2026-07-26 `Repost child action과 PostActionBar 공개 UI를 조립한다`는 2026-07-27 `Repost 메뉴와 최초 production surface를 PROD-414에서 완성한다`로 대체했다.
- 2026-07-21 `Presentation, 목록 연결과 action child를 독립 client slice로 유지한다`는 2026-07-27 `Presentation, navigation과 Repost action을 전달 가능한 client slice로 유지한다`로 대체했다.
- 2026-07-24 `Repost와 Quote는 Source의 시각 계층을 다르게 사용한다`는 2026-07-27 `Repost와 Quote의 canonical navigation target을 분리한다`로 대체했다.
