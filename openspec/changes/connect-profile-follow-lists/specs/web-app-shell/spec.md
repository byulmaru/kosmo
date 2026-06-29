## MODIFIED Requirements

### Requirement: Followers and following list routes

웹 앱은 프로필의 팔로워·팔로잉 목록에 직접 접근할 수 있도록, 프로필 라우트 하위에 `/@{handle}/followers`와 `/@{handle}/following` 웹 라우트를 제공해야 한다(MUST). 두 라우트는 프로필 layout 아래에서 렌더되어 상단에 프로필 헤더(`ProfileHero`)를 유지해야 하며(MUST), 게시글 상세 라우트와 달리 `(tabs)` 셸까지 레이아웃을 리셋하지 않아야 한다(MUST NOT). 두 라우트는 직접 접근 시 깨지지 않고 팔로워·팔로잉 목록 영역을 표시해야 한다(MUST).

#### Scenario: Access followers list route

- **WHEN** 사용자가 `/@{handle}/followers`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로워 목록 영역을 표시한다
- **AND** 표시할 팔로워 edge가 없으면 기존 팔로워 빈 목록 상태를 표시한다

#### Scenario: Access following list route

- **WHEN** 사용자가 `/@{handle}/following`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로잉 목록 영역을 표시한다
- **AND** 표시할 팔로잉 edge가 없으면 기존 팔로잉 빈 목록 상태를 표시한다

#### Scenario: Lists keep the profile header

- **WHEN** 팔로워 또는 팔로잉 목록 라우트가 렌더된다
- **THEN** 레이아웃은 상위 핸들 라우트의 `ProfileHero`를 유지한다
- **AND** `(tabs)` 셸(사이드바·하단탭)도 유지된다

## ADDED Requirements

### Requirement: Profile connection list data rendering

팔로워·팔로잉 목록 라우트는 해당 프로필의 follow connection 첫 페이지를 조회해 프로필 항목 목록을 렌더해야 한다(MUST). `/@{handle}/followers`는 `Profile.followers(first: 20).edges[].node.follower`를 `ProfileListItem`으로 표시해야 하며(MUST), `/@{handle}/following`은 `Profile.following(first: 20).edges[].node.followee`를 `ProfileListItem`으로 표시해야 한다(MUST). 두 목록은 connection이 반환한 edge 순서를 그대로 렌더하고 클라이언트에서 별도 정렬하지 않아야 한다(MUST NOT). 각 항목은 기존 `ProfileListItem`/`FollowButton` 정책을 따라 프로필 정보와 가능한 follow action을 표시해야 한다(MUST). 이 요구사항은 첫 페이지 렌더링 계약만 정의하며, 첫 페이지 이후의 pagination 동작은 후속 change에서 별도 요구사항으로 정의한다.

#### Scenario: Render followers from connection

- **WHEN** 사용자가 `/@{handle}/followers`에 접근하고 `Profile.followers(first: 20)`가 edge를 반환한다
- **THEN** 시스템은 각 edge의 `node.follower` 프로필을 `ProfileListItem`으로 표시한다
- **AND** 팔로워 목록 영역은 상위 프로필 헤더 아래에 유지된다

#### Scenario: Render following from connection

- **WHEN** 사용자가 `/@{handle}/following`에 접근하고 `Profile.following(first: 20)`가 edge를 반환한다
- **THEN** 시스템은 각 edge의 `node.followee` 프로필을 `ProfileListItem`으로 표시한다
- **AND** 팔로잉 목록 영역은 상위 프로필 헤더 아래에 유지된다

#### Scenario: Preserve empty state after data connection

- **WHEN** 팔로워 또는 팔로잉 connection 첫 페이지가 edge를 반환하지 않는다
- **THEN** 시스템은 기존 목록 종류별 빈 상태를 표시한다

#### Scenario: Preserve connection order

- **WHEN** 팔로워 또는 팔로잉 connection 첫 페이지가 여러 edge를 반환한다
- **THEN** 시스템은 connection edge가 반환된 순서대로 목록 항목을 표시한다
- **AND** 클라이언트는 항목을 별도 기준으로 재정렬하지 않는다

#### Scenario: Preserve list item follow policy

- **WHEN** 비로그인 사용자, 선택 프로필이 없는 사용자, 또는 자기 프로필 항목이 팔로워·팔로잉 목록을 본다
- **THEN** 시스템은 새 follow action 정책을 만들지 않고 기존 `ProfileListItem`/`FollowButton` 정책에 따라 action을 표시하거나 숨긴다
