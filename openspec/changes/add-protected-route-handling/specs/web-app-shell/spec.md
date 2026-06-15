## ADDED Requirements

### Requirement: Protected app routes require a valid session

`(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)은 유효한 세션(로그인)을 전제로 한다(MUST). 유효한 세션이 없는 사용자가 이 라우트에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 쿠키 존재만으로 판정하지 않는다. 공개 프로필 라우트(`/@{handle}` 및 그 하위 게시글 상세)는 비로그인 조회를 유지해야 하며 이 가드에서 제외된다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 리다이렉트하지 않는다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/compose`·`/search`·`/notifications`·`/menu` 중 하나에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Invalid or expired session is treated as guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 보호 라우트에 접근한다
- **THEN** `currentSession`이 `null`이므로 시스템은 비로그인과 동일하게 루트 온보딩(`/`)으로 이동한다

#### Scenario: Public profile remains accessible without login

- **WHEN** 비로그인 사용자가 `/@{handle}` 또는 `/@{handle}/{postId}`에 접근한다
- **THEN** 시스템은 리다이렉트하지 않고 공개 프로필·게시글을 표시한다

#### Scenario: Signed-in user reaches protected route

- **WHEN** 유효한 세션을 가진 사용자가 보호 라우트에 접근한다
- **THEN** 시스템은 리다이렉트 없이 해당 화면을 표시한다

#### Scenario: Hold redirect while session is loading

- **WHEN** `currentSession` 확인이 진행 중이거나 조회가 오류로 실패했다
- **THEN** 시스템은 판단을 보류하고 리다이렉트하지 않는다

## MODIFIED Requirements

### Requirement: Home no-profile onboarding

홈(`(tabs)/home`, 라우트 `/home`)은 로그인한 사용자에게 선택 프로필(active profile)이 없을 때 타임라인 영역 자리 대신 프로필 온보딩 안내를 표시해야 한다(MUST). 온보딩 안내는 아이콘, 제목, 보조 설명, 다음 행동을 위한 CTA로 구성해야 한다(MUST).

#### Scenario: 로그인했지만 선택 프로필이 없는 사용자

- **WHEN** 인증 session이 있고 `currentSession.selectedProfile`이 없는 사용자가 `/home`을 연다
- **THEN** 시스템은 타임라인 영역 자리 대신 프로필 온보딩 안내(아이콘·제목·보조 설명·CTA)를 표시한다
- **AND** 시스템은 사용자가 보유한 프로필 유무에 따라 안내 문구와 CTA 라벨을 다르게 표시한다(프로필 없음: 만들기 유도, 프로필 있음: 선택 유도)

#### Scenario: 선택 프로필이 있는 사용자

- **WHEN** 인증 session이 있고 `currentSession.selectedProfile`이 있는 사용자가 `/home`을 연다
- **THEN** 시스템은 프로필 온보딩 안내를 표시하지 않고 홈 타임라인 영역을 표시한다

#### Scenario: 비로그인 사용자

- **WHEN** 인증 session이 없거나 만료·폐기된 세션을 가진 사용자가 `/home`에 접근한다
- **THEN** 보호 라우트 가드가 `currentSession`이 `null`임을 확인하고 사용자를 루트 온보딩(`/`)으로 이동시킨다
- **AND** 따라서 `/home` 콘텐츠와 프로필 온보딩 안내는 비로그인 사용자에게 렌더링되지 않는다
