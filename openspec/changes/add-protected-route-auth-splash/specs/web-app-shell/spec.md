## MODIFIED Requirements

### Requirement: Protected app routes require a valid session

`(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`·`/menu`)은 유효한 세션(로그인)을 전제로 한다(MUST). 유효한 세션이 없는 사용자가 이 라우트에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 쿠키 존재만으로 판정하지 않는다. 공개 프로필 라우트(`/@{handle}` 및 그 하위 게시글 상세)는 비로그인 조회를 유지해야 하며 이 가드에서 제외된다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 리다이렉트하지 않는다(MUST NOT).

콜드 로드로 보호 라우트에 진입해 `currentSession` 확인이 진행 중이고 재사용할 캐시된 세션이 없는 동안, 시스템은 홈 스켈레톤이나 `(tabs)` 셸을 노출하는 대신 보호 영역 전체를 덮는 풀스크린 스플래시를 표시해야 한다(MUST). 스플래시가 셸을 덮는 동안 그 아래 `(tabs)` 셸은 시각적으로 가려지는 데 그치지 않고 포커스 순서와 접근성 트리에서도 제외되어, 키보드·스크린리더 사용자가 덮인 셸 메뉴로 이동·활성화할 수 없어야 한다(MUST). 이미 캐시된 유효 세션으로 보호 라우트 사이를 이동하는 경우에는 스플래시를 표시하지 않아야 한다(MUST NOT). 세션이 `null`로 확정되어 루트(`/`)로 이동하는 동안에도 스플래시를 유지해 게스트가 보호 셸·스켈레톤을 보지 않게 해야 한다(MUST). 단, `currentSession` 조회가 오류로 실패한 동안에는 스플래시 대신 콘텐츠 렌더를 유지(fail-open)해 일시 오류 사용자를 막지 않아야 한다(MUST). 공개 프로필 라우트는 이 스플래시 동작의 영향을 받지 않는다(MUST NOT).

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

#### Scenario: Show splash during cold session verification

- **WHEN** 재사용할 캐시된 세션이 없는 사용자가 보호 라우트를 콜드 로드해 `currentSession` 확인이 진행 중이다
- **THEN** 시스템은 홈 스켈레톤이나 `(tabs)` 셸을 노출하지 않고 보호 영역 전체를 덮는 풀스크린 스플래시를 표시한다

#### Scenario: Covered shell is inert during splash

- **WHEN** 스플래시가 보호 영역을 덮고 있다
- **THEN** 그 아래 `(tabs)` 셸(사이드바·모바일 헤더·하단 탭바·우측 레일·드로어)은 포커스 순서와 접근성 트리에서 제외되어, 키보드·스크린리더 사용자가 셸 메뉴로 이동·활성화할 수 없다

#### Scenario: No splash when a cached session is reused

- **WHEN** 이미 유효 세션이 캐시된 사용자가 보호 라우트 사이를 이동한다
- **THEN** 시스템은 스플래시를 표시하지 않고 해당 화면을 바로 렌더한다

#### Scenario: Splash covers guest until redirect completes

- **WHEN** 캐시된 세션이 없는 사용자의 `currentSession`이 `null`로 확정된다
- **THEN** 시스템은 루트 온보딩(`/`)으로 이동을 마칠 때까지 스플래시를 유지해 보호 셸·홈 스켈레톤을 노출하지 않는다

#### Scenario: Verification error keeps content instead of splash

- **WHEN** `currentSession` 조회가 오류로 실패했다
- **THEN** 시스템은 리다이렉트하지 않고, 스플래시 대신 콘텐츠 렌더를 유지한다
