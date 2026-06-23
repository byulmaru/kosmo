## ADDED Requirements

### Requirement: Followers and following list routes

웹 앱은 프로필의 팔로워·팔로잉 목록에 직접 접근할 수 있도록, 프로필 라우트 하위에 `/@{handle}/followers`와 `/@{handle}/following` 웹 라우트를 제공해야 한다(MUST). 두 라우트는 프로필 layout 아래에서 렌더되어 상단에 프로필 헤더(`ProfileHero`)를 유지해야 하며(MUST), 게시글 상세 라우트와 달리 `(tabs)` 셸까지 레이아웃을 리셋하지 않아야 한다(MUST NOT). 실제 목록 데이터 연결은 후속 범위(PROD-184/185)이며, 데이터 연결 전에도 라우트는 직접 접근 시 깨지지 않고 빈 목록 상태를 표시해야 한다(MUST).

#### Scenario: Access followers list route

- **WHEN** 사용자가 `/@{handle}/followers`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로워 목록 영역을 표시한다
- **AND** 데이터 연결 전에는 빈 목록 상태를 표시한다

#### Scenario: Access following list route

- **WHEN** 사용자가 `/@{handle}/following`에 직접 접근한다
- **THEN** 시스템은 프로필 헤더 아래에 팔로잉 목록 영역을 표시한다
- **AND** 데이터 연결 전에는 빈 목록 상태를 표시한다

#### Scenario: Lists keep the profile header

- **WHEN** 팔로워 또는 팔로잉 목록 라우트가 렌더된다
- **THEN** 레이아웃은 상위 핸들 라우트의 `ProfileHero`를 유지한다
- **AND** `(tabs)` 셸(사이드바·하단탭)도 유지된다

### Requirement: Profile connection list area states

팔로워·팔로잉 목록 영역은 목록 종류 제목과 함께 로딩, 오류, 빈 목록 상태를 표시할 수 있어야 한다(MUST). 두 목록은 같은 상태 표현(제목·로딩 스켈레톤·인라인 오류·인라인 빈 상태)을 공유해 시각/상태 구조가 어긋나지 않아야 한다(MUST). 로딩 중에는 프로필 행 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시해야 하며, 스켈레톤 시각 요소는 보조 기술에 노출하지 않아야 한다(MUST). 목록 query가 실패하고 표시할 기존 데이터가 없을 때는 인라인 오류 상태와 재시도 동작을 제공해야 한다(MUST). 표시할 항목이 없을 때는 제목과 보조 설명으로 구성된 인라인 빈 상태를 표시해야 한다(MUST). 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST). 상태 표현은 기존 게시글 목록 상태(`Profile post list ...`)와 같은 토큰·접근성 패턴을 따른다.

#### Scenario: Loading state

- **WHEN** 목록 영역이 로딩 중 상태다
- **THEN** 시스템은 프로필 행 형태의 스켈레톤을 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 목록 로딩 안내를 제공한다

#### Scenario: Error state with retry

- **WHEN** 목록 query가 실패했고 표시할 기존 데이터가 없다
- **THEN** 시스템은 인라인 오류 상태를 표시한다
- **AND** 사용자는 다시 시도 동작으로 목록을 다시 요청할 수 있다

#### Scenario: Empty state

- **WHEN** 표시할 팔로워 또는 팔로잉 항목이 없다
- **THEN** 시스템은 목록 종류에 맞는 제목과 보조 설명을 중앙 정렬로 표시한다

#### Scenario: Shared structure across both lists

- **WHEN** 팔로워 목록과 팔로잉 목록을 비교한다
- **THEN** 두 목록은 같은 제목·로딩·오류·빈 상태 구조를 사용한다
