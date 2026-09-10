## MODIFIED Requirements

### Requirement: Followers and following list routes

공용 Expo 앱은 프로필의 팔로워·팔로잉 목록에 직접 접근할 수 있도록 `/@{handle}/followers`와 `/@{handle}/following` route를 Web·Android·iOS에 제공해야 한다(MUST). 두 route는 Profile 홈의 `ProfileHero`를 표시하지 않고(MUST NOT), 각각 `~님의 팔로워`·`~님의 팔로잉` `PageHeader`와 바로 아래의 `팔로워`·`팔로잉` `TabList`를 가진 독립 화면으로 표시해야 한다(MUST). Profile 홈 route는 기존 `ProfileHero`를 유지해야 한다(MUST).

#### Scenario: Access followers list route

- **WHEN** 사용자가 `/@{handle}/followers`에 직접 접근한다
- **THEN** 시스템은 `~님의 팔로워` PageHeader와 `팔로워`가 선택된 관계 TabList를 표시한다
- **AND** ProfileHero를 표시하지 않는다
- **AND** 표시할 follower edge가 없으면 기존 팔로워 빈 상태를 탭 아래에 표시한다

#### Scenario: Access following list route

- **WHEN** 사용자가 `/@{handle}/following`에 직접 접근한다
- **THEN** 시스템은 `~님의 팔로잉` PageHeader와 `팔로잉`이 선택된 관계 TabList를 표시한다
- **AND** ProfileHero를 표시하지 않는다
- **AND** 표시할 followee edge가 없으면 기존 팔로잉 빈 상태를 탭 아래에 표시한다

#### Scenario: Navigate between relationship lists

- **WHEN** 사용자가 관계 TabList의 다른 탭을 선택한다
- **THEN** 시스템은 같은 Profile의 해당 followers 또는 following route로 이동한다
- **AND** 이동한 route를 현재 탭으로 표시한다

#### Scenario: Return to the profile home

- **WHEN** 사용자가 관계 목록 PageHeader의 뒤로가기 action을 실행한다
- **THEN** 시스템은 history 유무와 관계없이 같은 Profile의 홈 route로 이동한다

#### Scenario: Keep only one Mobile Web header

- **WHEN** Mobile Web에서 followers 또는 following route를 표시한다
- **THEN** route PageHeader가 상단 chrome을 소유한다
- **AND** Universal Shell은 메뉴 전용 header를 중복 렌더링하지 않는다

#### Scenario: Preserve the Profile home hero

- **WHEN** 사용자가 같은 Profile의 홈 route에 접근한다
- **THEN** 시스템은 기존 ProfileHero와 게시물 영역을 표시한다
- **AND** 관계 목록 PageHeader나 TabList를 표시하지 않는다

### Requirement: Profile connection list area states

팔로워·팔로잉 목록 영역은 관계 TabList 아래에서 로딩, 오류, 빈 목록 상태를 표시할 수 있어야 한다(MUST). 두 목록은 같은 상태 표현(로딩 스켈레톤·인라인 오류·인라인 빈 상태)을 공유해 시각/상태 구조가 어긋나지 않아야 하고(MUST), 별도 목록 종류 heading을 중복 표시하지 않아야 한다(MUST NOT). 로딩 중에는 프로필 행 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시해야 하며, 스켈레톤 시각 요소는 보조 기술에 노출하지 않아야 한다(MUST). 목록 query가 실패하고 표시할 기존 데이터가 없을 때는 인라인 오류 상태와 재시도 동작을 제공해야 한다(MUST). 표시할 항목이 없을 때는 목록 종류에 맞는 빈 상태 제목과 보조 설명을 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST). 상태 표현은 기존 게시글 목록 상태(`Profile post list ...`)와 같은 토큰·접근성 패턴을 따라야 한다(MUST).

#### Scenario: Loading state

- **WHEN** 목록 영역이 로딩 중 상태다
- **THEN** 시스템은 관계 TabList 아래에 프로필 행 형태의 스켈레톤을 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 목록 로딩 안내를 제공한다

#### Scenario: Error state with retry

- **WHEN** 목록 query가 실패했고 표시할 기존 데이터가 없다
- **THEN** 시스템은 관계 TabList 아래에 인라인 오류 상태를 표시한다
- **AND** 사용자는 다시 시도 동작으로 해당 목록 query를 다시 요청할 수 있다

#### Scenario: Empty state

- **WHEN** 표시할 팔로워 또는 팔로잉 항목이 없다
- **THEN** 시스템은 목록 종류에 맞는 빈 상태 제목과 보조 설명을 표시한다
- **AND** 별도 `팔로워` 또는 `팔로잉` 목록 heading을 중복 표시하지 않는다

#### Scenario: Shared structure across both lists

- **WHEN** 팔로워 목록과 팔로잉 목록을 비교한다
- **THEN** 두 목록은 같은 로딩·오류·빈 상태 구조를 사용한다
- **AND** 상태는 각 route의 관계 TabList 바로 아래에 놓인다

## ADDED Requirements

### Requirement: Profile connection list data rendering

팔로워·팔로잉 route는 해당 Profile의 기존 Relay follow connection을 `ProfileListItem` 목록으로 렌더해야 한다(MUST). `/@{handle}/followers`는 각 edge의 `node.follower`를, `/@{handle}/following`은 각 edge의 `node.followee`를 표시해야 한다(MUST). 두 목록은 connection edge 순서를 보존하고 클라이언트에서 재정렬하지 않아야 한다(MUST NOT). Web을 포함한 `ProfileListItem`의 Follow action은 기존 Medium `96×40`을 사용하면서 기본 행 높이 `64px`를 유지해야 한다(MUST). 이 시각 크기 변경은 follow/unfollow 동작과 Relay connection identity를 바꾸지 않아야 한다(MUST NOT).

#### Scenario: Render followers from connection

- **WHEN** followers connection이 edge를 반환한다
- **THEN** 시스템은 각 `node.follower`를 탭 바로 아래의 `ProfileListItem`으로 표시한다
- **AND** 별도 `팔로워` 목록 heading을 중복 표시하지 않는다

#### Scenario: Render following from connection

- **WHEN** following connection이 edge를 반환한다
- **THEN** 시스템은 각 `node.followee`를 탭 바로 아래의 `ProfileListItem`으로 표시한다
- **AND** 별도 `팔로잉` 목록 heading을 중복 표시하지 않는다

#### Scenario: Keep the Web follow action aligned with the list row

- **WHEN** Web 프로필 목록이 Follow action을 가진 `ProfileListItem`을 표시한다
- **THEN** Follow action은 기존 Medium `96×40` visual을 사용한다
- **AND** bio가 없는 기본 목록 행은 `64px` 높이를 유지한다

#### Scenario: Preserve connection order

- **WHEN** connection이 여러 edge를 반환한다
- **THEN** 시스템은 반환된 edge 순서대로 목록 항목을 표시한다
- **AND** 클라이언트는 항목을 별도 기준으로 재정렬하지 않는다

### Requirement: Profile relationship route scrolling

Native followers·following 화면은 route `PageHeader`, 관계 TabList와 leaf 목록을 하나의 외부 `PaginationScrollView` 안에 렌더해야 한다(MUST). Web은 기존 document/window scroll을 유지해야 하며(MUST), 두 플랫폼 모두 관계 화면을 위해 중첩 scroll container를 추가하지 않아야 한다(MUST NOT).

#### Scenario: Scroll a Native relationship list

- **WHEN** Android 또는 iOS에서 followers나 following route를 표시한다
- **THEN** PageHeader, TabList와 ProfileConnectionList는 하나의 외부 scroll 흐름에 놓인다
- **AND** leaf 목록은 별도 scroll owner를 만들지 않는다
