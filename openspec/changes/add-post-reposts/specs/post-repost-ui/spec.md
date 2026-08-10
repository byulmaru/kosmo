## ADDED Requirements

### Requirement: Repost와 Quote 프레젠테이션

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-453`, `PROD-415` 유니버설 앱은 기존 단일 `Post` fragment를 사용해 일반 Post, Repost와 Quote를 관계 조합에 맞는 React Native UI로 표시해야 한다(MUST).

#### Scenario: Repost 표시

- **WHEN** `content = null`이고 `repostSource`가 non-null인 Post를 표시한다
- **THEN** 앱은 Repost Author의 `{displayName}님이 재게시함` attribution을 canonical Profile Link로 정확히 한 번 표시한다
- **AND** 바로 아래의 direct Source는 일반 목록 Post와 동일한 표준 avatar·Author·Content·spacing·navigation 행으로 표시한다
- **AND** Source의 Author와 Content를 Repost 자신의 Content처럼 복제하지 않는다
- **AND** Source용 별도 full presentation·중첩 preview·중첩 article·이중 row border 또는 별도 Source renderer를 만들지 않는다

#### Scenario: Quote 표시

- **WHEN** `content`와 `repostSource`가 모두 non-null인 Post를 표시한다
- **THEN** 앱은 Quote Author의 Content와 Source Post preview를 구분해 표시한다
- **AND** Reply Parent도 있으면 Reply이면서 Quote인 구조를 유지한다

#### Scenario: 일반 Post 표시 회귀

- **WHEN** `repostSource = null`인 기존 Content Post를 표시한다
- **THEN** 앱은 기존 Author, Content와 생성 시각 표시를 유지한다
- **AND** `content = null`만으로 Repost라고 추론하지 않는다

#### Scenario: Repost와 Source Author 구분 상태

- **WHEN** Repost Author와 Source Author가 다른 Profile이고 표시 이름이나 handle이 길다
- **THEN** 앱은 두 Author의 역할과 이동 대상을 혼동하지 않게 표시한다
- **AND** 지원하는 화면 폭과 줄바꿈에서도 Post content와 action을 사용할 수 있다

#### Scenario: Quote의 중첩 Source 1단계 표시

- **WHEN** Quote 또는 Reply+Quote의 direct `repostSource`가 non-null `repostSource`를 가진다
- **THEN** 앱은 direct Source만 Author·Content·생성 시각을 포함한 preview로 표시한다
- **AND** 두 번째 Source의 Author·Content·생성 시각을 표시하거나 presentation component를 재귀 호출하지 않는다
- **AND** 두 번째 Source를 위한 별도 placeholder 또는 CTA를 표시하지 않는다

### Requirement: Source Post 이동과 목록·상세 연결

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-402`, `PROD-415`, `PROD-422`, `PROD-430`, `PROD-453` 유니버설 앱은 Home, Profile, Bookmark와 Post 상세에서 Repost·Quote Source를 표시하고 구조별 canonical Post route로 이동할 수 있어야 한다(MUST). 순수 Repost는 자체 detail을 제공하지 않고(MUST NOT) body·생성 시각과 직접 Repost ID 접근을 Source canonical detail로 연결해야 하며(MUST), Quote는 자체 canonical detail을 유지해야 한다(MUST).

#### Scenario: 순수 Repost의 Source Post 이동

- **WHEN** 사용자가 순수 Repost의 body 또는 생성 시각 affordance를 활성화한다
- **THEN** 앱은 Source Author의 `relativeHandle`과 Source Post global ID를 사용하는 canonical Post route로 이동한다
- **AND** Repost Author 또는 Repost 자체의 상세 route로 잘못 이동하지 않는다

#### Scenario: 순수 Repost ID 직접 접근

- **WHEN** 사용자가 순수 Repost Post ID의 상세 URL을 직접 연다
- **THEN** 앱은 Source Author의 `relativeHandle`과 Source Post global ID를 사용하는 canonical Post route로 replace redirect한다
- **AND** Repost 자체 detail이나 redirect loop를 표시하지 않는다

#### Scenario: Source preview의 목적지별 이동 경계

- **WHEN** direct Source preview가 Author, 생성 시각, Content와 border padding을 표시한다
- **THEN** Source Author는 canonical Profile Link이고 Source 생성 시각은 최소 44px canonical Post Link다
- **AND** Source 본문 행은 별도 accessibility element 또는 keyboard focus target이 아닌 pointer·touch shortcut으로 Source Post에 이동한다
- **AND** body의 외부 Link는 Source 이동을 함께 실행하지 않고 자신의 URL로 이동한다
- **AND** bordered preview 전체와 빈 padding은 단일 Source Post Link 또는 이동 affordance가 아니다
- **AND** 앱은 Source Post, Profile 또는 외부 body Link를 서로 중첩하지 않는다

#### Scenario: Quote 자체 Post와 Source preview 이동 분리

- **WHEN** Home, Profile, Bookmark 또는 상세 thread의 조상·하위 Reply `PostListItem`에서 사용자가 Quote 또는 Reply+Quote의 자체 생성 시각을 활성화하거나 자체 본문 행을 pointer 또는 touch로 활성화한다
- **THEN** 앱은 Quote Author의 `relativeHandle`과 Quote Post global ID를 사용하는 canonical Post route로 이동한다
- **AND** direct Source Post route로 잘못 이동하지 않는다
- **AND** Quote 자체 body의 외부 Link는 Quote Post 이동을 함께 실행하지 않고 자신의 URL로 이동한다
- **AND** 이미 자기 canonical route를 렌더링하는 현재 상세 `PostLayout`은 self Link나 동일 URL history entry를 추가하지 않고 direct Source 이동만 제공한다
- **AND** Quote 안의 Source preview를 활성화하면 Source canonical Post detail로 이동한다

#### Scenario: 목록 표준 행의 Post 이동 경계

- **WHEN** Home, Profile, Bookmark 또는 상세 thread의 조상·하위 Reply `PostListItem`이 일반 Post나 순수 Repost의 direct Source를 표준 목록 행으로 표시한다
- **THEN** 생성 시각은 keyboard, screen reader, pointer가 사용하는 최소 44px canonical Post Link다
- **AND** 본문 행은 별도 accessibility element 또는 keyboard focus target이 아닌 pointer·touch shortcut으로 같은 Post에 이동한다
- **AND** 본문 내부 외부 Link는 Post 이동을 함께 실행하지 않고 자신의 URL로 이동한다
- **AND** 앱은 canonical Post Link와 본문 내부 외부 Link를 서로 중첩하지 않는다

#### Scenario: Author Profile 이동

- **WHEN** 사용자가 Repost Author 또는 Source Author의 Profile affordance를 각각 활성화한다
- **THEN** 앱은 선택한 Author의 canonical Profile route로 이동한다

#### Scenario: Home, Profile과 Bookmark 목록 연결

- **WHEN** PROD-430의 Home/Profile connection 또는 Bookmark connection이 조회 가능한 Repost·Quote를 반환한다
- **THEN** Home, Profile과 Bookmark route는 공용 Post List item fragment를 통해 Repost·Quote presentation을 표시한다
- **AND** route query가 presentation용 scalar field를 중복 소유하지 않는다

#### Scenario: Post 상세 renderer별 Source 소유

- **WHEN** Post 상세 thread가 현재 Quote·Reply+Quote와 조상·하위 Reply를 표시한다
- **THEN** 현재 Post의 상세 renderer와 조상·하위 Reply의 목록 renderer는 각각 자신의 direct Source preview를 `PostBody` 아래 테두리 있는 sibling으로 정확히 한 번 표시한다
- **AND** thread 조립 경계는 Source를 별도 조회·운반·추가 렌더링하지 않는다
- **AND** 각 preview는 direct Source 한 단계에서 멈추고 두 번째 Source나 별도 CTA를 표시하지 않는다

#### Scenario: Content 없는 Repost 상세 canonical 이동

- **WHEN** 사용자가 Content와 Reply Parent 없이 Repost Source만 가진 Post의 상세 경로에 진입한다
- **THEN** 앱은 조회 가능한 direct Source의 canonical Post route로 현재 경로를 대체한다
- **AND** Content 없는 Repost 자체의 상세 surface, navigation history entry와 공유 참조를 남기지 않는다
- **AND** Source가 unavailable해 Content 없는 Repost 자체가 조회되지 않으면 숨겨진 Source 경로를 추론하지 않고 기존 not-found 경계를 유지한다

#### Scenario: unavailable Source 결과

- **WHEN** API가 unavailable Source를 가진 Content 없는 Repost를 connection에서 제외한다
- **THEN** 앱은 불완전한 Repost placeholder row를 합성하지 않는다
- **AND** API가 Source 없는 Quote를 반환하면 Quote Author와 자체 Content를 표시하고 Source preview와 이동
  affordance만 생략한다
- **AND** 앱은 unavailable Source에 별도 placeholder detail이나 redirect loop를 만들지 않고 기존 unavailable/not-found 결과를 사용한다

### Requirement: selected Profile별 Repost child action

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `docs/design/post-action-bar.md`, `PROD-389`, `PROD-414`, `PROD-431`, `PROD-432`, `PROD-433`, `PROD-471` 유니버설 앱은 공용 `PostActionBar`의 composite Post fragment가 private Repost action child fragment를 조립하게 해야 하며(MUST), child action은 viewer-independent count, selected Profile의 Active Repost 상태, 생성·취소 mutation과 interaction 상태를 같은 Relay 소유 경계에서 파생해야 한다(MUST). Repost trigger는 mutation을 즉시 실행하지 않고(MUST NOT) 항상 action menu를 열어야 한다(MUST).

#### Scenario: Repost하지 않은 상태

- **WHEN** 조회 Post의 `viewerRepost`가 `null`이다
- **THEN** action은 선택되지 않은 상태와 `repostCount`를 표시한다
- **AND** trigger를 활성화하면 `재게시하기` 항목을 가진 menu를 연다
- **AND** 사용자가 그 항목을 선택한 뒤 Source Post에 대한 Repost 생성 mutation을 호출한다

#### Scenario: 이미 Repost한 상태

- **WHEN** 조회 Post의 `viewerRepost`가 Active Repost Node다
- **THEN** action은 선택된 상태와 같은 viewer-independent `repostCount`를 표시한다
- **AND** trigger를 활성화하면 `재게시 취소` 항목을 가진 menu를 연다
- **AND** 사용자가 그 항목을 선택한 뒤 그 Repost Post ID에 대한 삭제 mutation을 호출한다

#### Scenario: 순수 Repost의 Action Bar target

- **WHEN** Content와 Reply Parent가 없고 direct Repost Source가 있는 순수 Repost 아래에 Action Bar를 표시한다
- **THEN** Repost child는 바깥 Repost가 아니라 화면에 표시한 direct Source fragment에서 `repostCount`와 `viewerRepost`를 읽는다
- **AND** menu 항목 선택 뒤 direct Source를 생성 target 또는 취소 상태의 기준으로 사용한다

#### Scenario: platform별 Repost action menu

- **WHEN** 사용자가 Web에서 Repost trigger를 활성화한다
- **THEN** 앱은 trigger 근처에 anchored menu를 열고 바깥 pointer·focus 또는 Escape로 닫으며 Escape 뒤 trigger로 focus를 돌려보낸다
- **AND** 방향키, Home과 End로 menu item focus를 이동할 수 있다
- **WHEN** 사용자가 Android 또는 iOS에서 Repost trigger를 활성화한다
- **THEN** 앱은 safe area를 고려한 bottom action sheet를 열고 backdrop·platform back action·dismiss gesture로 닫을 수 있게 한다
- **AND** PROD-431이 완료되기 전에는 `인용하기`를 disabled나 placeholder 항목으로도 표시하지 않는다

#### Scenario: pending 중 반복 입력

- **WHEN** Repost 생성 또는 취소 mutation이 진행 중이다
- **THEN** action은 pending·disabled 접근성 상태를 표시하고 반복 mutation 호출을 막는다
- **AND** 낙관 상태가 다른 selected Profile의 Relay Store로 전파되지 않는다

#### Scenario: Repost 생성 성공과 cache 동기화

- **WHEN** Repost 생성 mutation이 성공한다
- **THEN** 앱은 mutation payload의 Source Post ID, `repostCount`와 `viewerRepost` 결과로 normalized cache를 갱신한다
- **AND** 같은 actor Store에서 그 Post를 표시하는 목록과 상세의 action 상태가 일치한다

#### Scenario: PROD-414 Repost 취소 성공

- **WHEN** Repost 취소 mutation이 성공한다
- **THEN** 앱은 취소 요청을 완료하되 현재 `DeletePostPayload.postId`만으로 Source Post의 `repostCount`와 `viewerRepost` cache를 변경하지 않는다
- **AND** client count 산술, 광범위한 invalidation, 임시 refetch·local deselect 또는 같은 Tombstone ID를 숨기는 별도 client 상태를 추가하지 않는다

#### Scenario: PROD-471 Repost 취소 cache 동기화

- **WHEN** PROD-471의 서버 결과 기반 취소 계약이 완료된 뒤 Repost 취소 mutation이 성공한다
- **THEN** `DeletePostPayload.repostSource`는 nullable Source Post의 ID, 서버 확정 `repostCount`와 selected Profile별 `viewerRepost`를 반환한다
- **AND** 앱은 이 `repostSource` 결과로 normalized Source Post cache를 갱신한다
- **AND** 관련 없는 전체 refetch 없이 같은 actor Store의 중복 action 상태를 일치시키고 다른 actor Store에는 전파하지 않는다

#### Scenario: mutation 실패

- **WHEN** Repost 생성 또는 취소 mutation이 GraphQL 또는 network 오류로 실패한다
- **THEN** child action은 pending을 종료하고 이전 서버 확정 count·선택 상태와 normalized cache를 유지한다
- **AND** 생성 실패는 `재게시하지 못했습니다. 잠시 후 다시 시도해 주세요.`, 취소 실패는 `재게시를 취소하지 못했습니다. 잠시 후 다시 시도해 주세요.`라는 transient toast로 알린다
- **AND** toast는 safe area와 고정 탭 바 위의 화면 하단에서 약 3초 뒤 사라지고 새 toast가 기존 toast를 교체하며 alert semantics를 제공한다
- **AND** persistent error 상태, close·retry control 또는 성공 toast를 두지 않고 menu를 다시 열어 같은 action을 재시도할 수 있게 한다

#### Scenario: child action과 PostActionBar 경계

- **WHEN** Repost child action을 구현하고 검증한다
- **THEN** `PostActionBar_post`는 `RepostAction_post`를 child fragment로 spread하고 실제 fragment ref를 private `RepostAction`까지 전달한다
- **AND** private `RepostAction`은 `viewerRepost`에서 선택 상태, 접근성 label, 정확한 Active Repost delete identity와 create/delete mutation 종류를 함께 파생해 공통 private control을 렌더한다
- **AND** PROD-414의 `PostListItem`·`PostLayout` surface는 actual target Post fragment ref와 action별 Repost error callback을 공급하고 Action Bar를 content grid의 마지막 sibling이자 모든 navigation link 밖에 렌더링한다
- **AND** 최종 disabled 행동을 child에 연결할 concrete host input 또는 fragment shape, 나머지 action의 production 조립과 전체 통합 검증은 actual caller와 함께 PROD-432가 설계한다
- **AND** 독립 공개 action leaf 또는 선택 상태·label·delete identity·mutation callback의 독립 scalar config를 만들지 않는다

### Requirement: Repost UI 상태 카탈로그와 검증

**Authority / Provenance:** `docs/design/post-action-bar.md`, `PROD-389`, `PROD-414`, `PROD-415`, `PROD-433`, `PROD-453` 유니버설 앱은 production fragment 계약을 유지하는 Relay mock과 Storybook 상태로 Repost·Quote presentation, canonical navigation 및 Repost child action·menu·toast를 검증해야 한다(MUST).

#### Scenario: presentation 상태 카탈로그

- **WHEN** Storybook에서 Post presentation 상태를 검증한다
- **THEN** 일반 Post, Repost, Quote, Reply이면서 Quote, 긴 Author·Content, nullable Source 결과와 Source navigation 상태를 포함한다
- **AND** raw object를 fragment key로 cast해 Relay runtime 계약을 우회하지 않는다

#### Scenario: action 상태 카탈로그

- **WHEN** Storybook에서 Repost action을 검증한다
- **THEN** Storybook의 실제 Relay operation이 Post fragment ref를 `PostActionBar_post`에서 `RepostAction_post`까지 전달하고 선택·미선택, pending, 성공, 오류와 selected Profile 변경 상태를 포함한다
- **AND** `play` interaction은 menu open·dismiss·항목 선택, pending 중복 호출 방지, 생성 성공, 정확한 취소 ID, `repostSource` 기반 cache 갱신과 actor Store 격리, action별 toast·오류 뒤 재시도, actor reset과 접근성 상태를 확인한다
- **AND** 목록·상세 integration은 Action Bar final sibling·link 비중첩과 순수 Repost Source target을 확인한다
