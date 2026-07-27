## ADDED Requirements

### Requirement: Repost와 Quote 프레젠테이션

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0014-post-structure-relations.md`, `PROD-389`, `PROD-453`, `PROD-415` 유니버설 앱은 기존 단일 `Post` fragment를 사용해 일반 Post, Repost와 Quote를 관계 조합에 맞는 React Native UI로 표시해야 한다(MUST).

#### Scenario: Repost 표시

- **WHEN** `content = null`이고 `repostSource`가 non-null인 Post를 표시한다
- **THEN** 앱은 Repost Author와 Source Post를 시각적으로 구분해 표시한다
- **AND** Source의 Author와 Content를 Repost 자신의 Content처럼 복제하지 않는다

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

#### Scenario: 중첩 Source의 1단계 표시

- **WHEN** direct `repostSource`가 non-null `repostSource`를 가진다
- **THEN** 앱은 direct Source만 Author·Content·생성 시각을 포함한 full presentation으로 표시한다
- **AND** 두 번째 Source의 Author·Content·생성 시각을 표시하거나 presentation component를 재귀 호출하지 않는다
- **AND** 두 번째 Source를 위한 별도 placeholder 또는 CTA를 표시하지 않는다

### Requirement: Source Post 이동과 목록·상세 연결

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/policies/post-list.md`, `PROD-389`, `PROD-402`, `PROD-415`, `PROD-422`, `PROD-430`, `PROD-453` 유니버설 앱은 Home, Profile, Bookmark와 Post 상세에서 Repost·Quote Source를 표시하고 기존 canonical Post route로 이동할 수 있어야 한다(MUST).

#### Scenario: Source Post 이동

- **WHEN** 사용자가 Repost 또는 Quote의 direct Source 생성 시각을 keyboard, screen reader, pointer 또는 touch로 활성화하거나 Source 본문 행을 pointer 또는 touch로 활성화한다
- **THEN** 앱은 Source Author의 `relativeHandle`과 Source Post global ID를 사용하는 canonical Post route로 이동한다
- **AND** Repost 또는 Quote Author의 상세 route로 잘못 이동하지 않는다
- **AND** Source Author affordance는 Source Author의 canonical Profile route로 이동한다

#### Scenario: Source preview의 목적지별 이동 경계

- **WHEN** direct Source preview가 Author, 생성 시각, Content와 border padding을 표시한다
- **THEN** Source Author는 canonical Profile Link이고 Source 생성 시각은 최소 44px canonical Post Link다
- **AND** Source 본문 행은 별도 accessibility element 또는 keyboard focus target이 아닌 pointer·touch shortcut으로 Source Post에 이동한다
- **AND** body의 외부 Link는 Source 이동을 함께 실행하지 않고 자신의 URL로 이동한다
- **AND** bordered preview 전체와 빈 padding은 단일 Source Post Link 또는 이동 affordance가 아니다
- **AND** 앱은 Source Post, Profile 또는 외부 body Link를 서로 중첩하지 않는다

#### Scenario: Quote 자체 Post 이동 보존

- **WHEN** 사용자가 Quote 또는 Reply+Quote의 자체 생성 시각을 활성화하거나 자체 본문 행을 pointer 또는 touch로 활성화한다
- **THEN** 앱은 Quote Author의 `relativeHandle`과 Quote Post global ID를 사용하는 canonical Post route로 이동한다
- **AND** direct Source Post route로 잘못 이동하지 않는다
- **AND** Quote 자체 body의 외부 Link는 Quote Post 이동을 함께 실행하지 않고 자신의 URL로 이동한다

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

### Requirement: selected Profile별 Repost action

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-414` 유니버설 앱은 Post fragment에 colocate된 독립 Repost action component로 viewer-independent count와 selected Profile의 Active Repost 상태를 표시하고 생성·취소 mutation을 연결해야 한다(MUST).

#### Scenario: Repost하지 않은 상태

- **WHEN** 조회 Post의 `viewerRepost`가 `null`이다
- **THEN** action은 선택되지 않은 상태와 `repostCount`를 표시한다
- **AND** 활성화하면 Source Post에 대한 Repost 생성 mutation을 호출한다

#### Scenario: 이미 Repost한 상태

- **WHEN** 조회 Post의 `viewerRepost`가 Active Repost Node다
- **THEN** action은 선택된 상태와 같은 viewer-independent `repostCount`를 표시한다
- **AND** 활성화하면 그 Repost Post ID에 대한 삭제 mutation을 호출한다

#### Scenario: pending 중 반복 입력

- **WHEN** Repost 생성 또는 취소 mutation이 진행 중이다
- **THEN** action은 pending·disabled 접근성 상태를 표시하고 반복 mutation 호출을 막는다
- **AND** 낙관 상태가 다른 selected Profile의 Relay Store로 전파되지 않는다

#### Scenario: mutation 성공과 cache 동기화

- **WHEN** Repost 생성 또는 취소 mutation이 성공한다
- **THEN** 앱은 mutation payload의 Source Post ID, `repostCount`와 `viewerRepost` 결과로 normalized cache를 갱신한다
- **AND** 같은 actor Store에서 그 Post를 표시하는 목록과 상세의 action 상태가 일치한다

#### Scenario: mutation 실패

- **WHEN** Repost 생성 또는 취소 mutation이 GraphQL 또는 network 오류로 실패한다
- **THEN** 앱은 안전한 한국어 실패 상태를 표시하고 이전 count와 선택 상태로 복구한다
- **AND** 사용자가 다시 시도할 수 있게 한다

#### Scenario: 독립 component 경계

- **WHEN** Repost action component를 구현하고 검증한다
- **THEN** component는 실제 Post surface의 공통 Action Bar 조립을 소유하지 않는다
- **AND** 공통 Action Bar rollout은 PROD-432에 남긴다

### Requirement: Repost UI 상태 카탈로그와 검증

**Authority / Provenance:** `PROD-389`, `PROD-414`, `PROD-415`, `PROD-453` 유니버설 앱은 production fragment 계약을 유지하는 Relay mock과 Storybook 상태로 Repost·Quote presentation 및 action을 검증해야 한다(MUST).

#### Scenario: presentation 상태 카탈로그

- **WHEN** Storybook에서 Post presentation 상태를 검증한다
- **THEN** 일반 Post, Repost, Quote, Reply이면서 Quote, 긴 Author·Content, nullable Source 결과와 Source navigation 상태를 포함한다
- **AND** raw object를 fragment key로 cast해 Relay runtime 계약을 우회하지 않는다

#### Scenario: action 상태 카탈로그

- **WHEN** Storybook에서 Repost action을 검증한다
- **THEN** 선택·미선택, pending, 성공, 오류와 selected Profile 변경 상태를 포함한다
- **AND** interaction test는 접근성 상태, 중복 호출 방지와 navigation target을 확인한다
