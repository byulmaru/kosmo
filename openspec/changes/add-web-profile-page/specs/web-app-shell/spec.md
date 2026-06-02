## ADDED Requirements

### Requirement: Handle-based profile page route

웹 앱은 핸들을 포함한 URL로 프로필 페이지에 직접 접근할 수 있도록 `(tabs)` 그룹 안에 핸들 동적 라우트를 제공해야 한다(MUST). 이 라우트는 `@` 프리픽스를 사용해 정적 엔드포인트 경로와 충돌하지 않아야 한다(MUST).

#### Scenario: Access profile by handle URL

- **WHEN** 사용자가 `/@{handle}` 형식의 주소로 이동한다
- **THEN** 시스템은 `(tabs)` 셸(사이드바·하단탭) 안에서 해당 핸들의 프로필 페이지를 연다
- **AND** layout에서 `profileByHandle(handle:)` query로 프로필을 조회하고, 그 결과를 하위 화면에서 재사용한다

#### Scenario: Static endpoint not intercepted by handle route

- **WHEN** 사용자가 `/login`·`/graphql`·`/health` 등 정적 엔드포인트 경로로 이동한다
- **THEN** 핸들 라우트는 `@`로 시작하지 않는 경로를 매칭하지 않으므로 해당 엔드포인트가 정상 처리된다

### Requirement: Profile basic information display

프로필 페이지는 조회된 프로필의 기본 정보를 표시해야 한다(MUST). 표시 항목은 커버 영역, 아바타, 표시 이름, 핸들, bio, 팔로워/팔로잉 수이며, 색·반경은 시맨틱 디자인 토큰을 사용해 라이트/다크에 대응해야 한다(MUST).

#### Scenario: Display loaded profile

- **WHEN** 핸들로 조회한 활성 프로필이 있다
- **THEN** 시스템은 커버 밴드, 아바타, 표시 이름, `@handle`, bio(있을 때), 팔로워/팔로잉 수를 표시한다

#### Scenario: Avatar initial fallback

- **WHEN** 프로필에 아바타 이미지가 없다(스키마 미보유)
- **THEN** 시스템은 표시 이름(없으면 핸들)의 첫 글자를 대문자로 한 이니셜 아바타를 표시한다

#### Scenario: Compact follow counts

- **WHEN** 팔로워 또는 팔로잉 수를 표시한다
- **THEN** 시스템은 1000 이상의 값을 compact 표기(예: `1.2k`)로 보여준다

### Requirement: Profile page loading and error states

프로필 페이지는 로딩, 조회 오류, 없는 프로필 상태를 처리해야 한다(MUST). 오류·없는 프로필 상태에서도 상위 `(tabs)` 셸은 유지되어야 한다(MUST).

#### Scenario: Loading state

- **WHEN** 프로필 조회가 진행 중이다
- **THEN** 시스템은 헤더 형태의 스켈레톤과 스크린리더용 로딩 안내를 표시한다

#### Scenario: Query error

- **WHEN** 프로필 조회가 오류로 실패한다
- **THEN** 시스템은 오류 안내와 다시 시도 동작을 제공하고, 사이드바·하단탭은 유지한다

#### Scenario: Missing profile

- **WHEN** 핸들과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 인라인 빈 상태("프로필을 찾을 수 없어요")를 표시하고, 사이드바·하단탭은 유지한다

### Requirement: Profile page column alignment

프로필 페이지는 공유 `(tabs)` 셸의 main 레이아웃을 변경하지 않고, 프로필 라우트에서만 콘텐츠를 탑정렬한 컬럼으로 표시해야 한다(MUST). 모바일에서는 화면 끝까지 풀블리드로, 넓은 화면에서는 고정 폭 컬럼을 가운데 정렬하고 가벼운 구분선을 표시해야 한다(MUST).

#### Scenario: Mobile full-bleed column

- **WHEN** 모바일 폭에서 프로필 페이지를 본다
- **THEN** 커버는 화면 좌우 끝까지 닿고 콘텐츠는 상단부터 시작한다

#### Scenario: Desktop centered column with divider

- **WHEN** 넓은 화면에서 프로필 페이지를 본다
- **THEN** 콘텐츠는 고정 폭 컬럼으로 가운데 정렬되고 양옆에 가벼운 구분선이 표시된다
- **AND** 공유 셸과 다른 탭 페이지의 렌더링은 변경되지 않는다

### Requirement: Sidebar profile entry navigation

사이드바의 "프로필" 항목은 현재 세션에서 선택된 프로필의 프로필 페이지로 이동해야 한다(MUST). 선택된 프로필이 없으면 해당 항목을 비활성화해야 한다(MUST).

#### Scenario: Navigate to own profile

- **WHEN** 현재 세션에 선택된 프로필이 있고 사용자가 사이드바 "프로필" 항목을 누른다
- **THEN** 시스템은 선택된 프로필의 `/@{handle}` 페이지로 이동한다
- **AND** 사용자가 자신의 프로필 페이지를 보고 있을 때만 해당 항목을 활성 상태로 표시한다

#### Scenario: Disabled when no selected profile

- **WHEN** 현재 세션에 선택된 프로필이 없다
- **THEN** 시스템은 사이드바 "프로필" 항목을 비활성화하여(클릭 불가) 이동하지 않는다
