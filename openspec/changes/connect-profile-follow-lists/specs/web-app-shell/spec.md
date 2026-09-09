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

### Requirement: Profile connection list data rendering

팔로워·팔로잉 route는 해당 Profile의 기존 Relay follow connection을 `ProfileListItem` 목록으로 렌더해야 한다(MUST). `/@{handle}/followers`는 각 edge의 `node.follower`를, `/@{handle}/following`은 각 edge의 `node.followee`를 표시해야 한다(MUST). 두 목록은 connection edge 순서를 보존하고 클라이언트에서 재정렬하지 않아야 한다(MUST NOT). presentation 변경은 기존 loading·error·empty·pagination·retry와 `ProfileListItem`/`FollowButton` 정책을 바꾸지 않아야 한다(MUST NOT).

#### Scenario: Render followers from connection

- **WHEN** followers connection이 edge를 반환한다
- **THEN** 시스템은 각 `node.follower`를 탭 바로 아래의 `ProfileListItem`으로 표시한다
- **AND** 별도 `팔로워` 목록 heading을 중복 표시하지 않는다

#### Scenario: Render following from connection

- **WHEN** following connection이 edge를 반환한다
- **THEN** 시스템은 각 `node.followee`를 탭 바로 아래의 `ProfileListItem`으로 표시한다
- **AND** 별도 `팔로잉` 목록 heading을 중복 표시하지 않는다

#### Scenario: Preserve list lifecycle

- **WHEN** connection이 loading, initial error, empty, content, 추가 조회 중 또는 추가 조회 오류 상태가 된다
- **THEN** 시스템은 기존 상태 문구, 기존 edge, 수동 `더 불러오기`와 같은 위치의 재시도를 유지한다
- **AND** follow action과 Relay connection identity를 새로 정의하지 않는다

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
