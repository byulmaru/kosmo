## ADDED Requirements

### Requirement: 준비되지 않은 sidebar 진입점 비노출

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-541`, `PROD-487`, `PROD-566` — 유니버설 애플리케이션은 준비되지 않은 sidebar navigation 진입점을 노출하지 않고 현재 제공하는 feedback과 실제 동작하는 진입점을 유지해야 한다(MUST).

#### Scenario: responsive sidebar에서 프로필 설정 비노출

- **WHEN** 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile drawer를 연다
- **THEN** 시스템은 `프로필 설정` link나 같은 의미의 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: responsive sidebar에서 팔로워 요청 비노출

- **WHEN** 받은 팔로우 요청 관리 화면이 아직 제공되지 않은 상태에서 인증된 사용자가 full Web sidebar, compact Web rail 또는 mobile drawer를 연다
- **THEN** 시스템은 `팔로워 요청` link나 같은 의미의 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: 실제 동작하는 navigation 유지

- **WHEN** sidebar navigation이 준비되지 않은 진입점 없이 렌더링된다
- **THEN** PROD-487과 PR #390의 `피드백 보내기` link와 `/feedback` destination을 유지한다
- **AND** 기존 `프로필`·`북마크` link, 로그아웃 control과 responsive navigation 동작을 유지한다

#### Scenario: 피드백과 준비되지 않은 설정 구분

- **WHEN** full sidebar, compact icon rail 또는 mobile drawer가 `피드백 보내기` link를 렌더링한다
- **THEN** 시스템은 Lucide `Mail` glyph를 사용한다
- **AND** label, accessible name, `/feedback` destination, active 상태와 drawer close 동작은 유지한다

#### Scenario: mobile drawer의 중복 글쓰기 진입점 비노출

- **WHEN** mobile Web, Android 또는 iOS에서 인증된 사용자가 drawer를 연다
- **THEN** 시스템은 drawer 안에 `글쓰기` link나 button을 표시하지 않는다
- **AND** mobile 하단 5탭의 `/compose` 글쓰기 link는 유지한다
- **AND** compact Web icon rail의 글쓰기 link는 우측 composer가 없는 breakpoint의 진입점으로 유지한다

#### Scenario: 로그아웃 아이콘의 시각적 weight 일치

- **WHEN** full sidebar, compact icon rail 또는 mobile drawer가 로그아웃 control을 렌더링한다
- **THEN** Lucide `LogOut` glyph는 주변 navigation glyph와 같은 2px stroke weight를 사용한다
- **AND** 로그아웃 label, accessible name, target geometry와 동작을 변경하지 않는다
- **AND** compact icon rail의 로그아웃 target과 glyph는 다른 compact footer target과 같은 수평 중심선을 사용한다

#### Scenario: ProfileSwitcher nickname 중심 정렬

- **WHEN** full Web sidebar 또는 mobile drawer가 ProfileSwitcher trigger를 렌더링한다
- **THEN** nickname은 별도 하향 transform 없이 trigger의 수직 중심에 정렬된다
- **AND** nickname·chevron은 trigger의 같은 중심선을 유지하며 compact rail profile button geometry를 변경하지 않는다

#### Scenario: generic menu placeholder 제거

- **WHEN** PROD-541의 유니버설 route 구성이 등록된다
- **THEN** 시스템은 generic `메뉴` 소개·설명·login-test UI만 렌더링하던 `/menu` placeholder route를 등록하지 않는다
- **AND** `/menu` 직접 접근에 새 redirect나 전용 404 화면을 추가하지 않는다
- **AND** 팔로우 요청의 pending 저장 모델과 GraphQL 목록·승인·거절·취소 계약을 변경하지 않는다

### Requirement: shell 개인정보 처리방침 진입점

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `PROD-469`, `PROD-541` — 인증 후 full Web 셸은 공개 `/privacy` route로 이동하는 개인정보 처리방침 진입점을 우측 레일 최하단에 제공해야 한다(MUST). compact Web과 mobile Web·Android/iOS drawer는 해당 진입점을 표시해서는 안 되며(MUST NOT), generic `/menu` route를 이 진입점의 container로 사용해서도 안 된다(MUST NOT).

#### Scenario: full Web 우측 레일에서 처리방침 진입

- **WHEN** 인증된 사용자가 1280px 이상의 full Web 셸을 연다
- **THEN** 우측 레일 최하단에 기존 위치보다 viewport 하단에 가까운 muted `개인정보 처리방침` 텍스트 link를 표시한다
- **AND** 선택한 Profile이 없어 composer가 렌더링되지 않아도 link를 유지한다

#### Scenario: compact Web 아이콘 레일에서 처리방침 비노출

- **WHEN** 인증된 사용자가 768px 이상 1280px 미만의 compact Web 셸을 연다
- **THEN** 아이콘 레일에 개인정보 처리방침 link나 같은 의미의 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: mobile drawer에서 처리방침 비노출

- **WHEN** mobile Web, Android 또는 iOS에서 인증된 사용자가 drawer를 연다
- **THEN** drawer에 개인정보 처리방침 link나 같은 의미의 진입 control을 시각적으로 표시하지 않는다
- **AND** 해당 control을 접근성 트리에 link, button이나 다른 interactive element로 노출하지 않는다

#### Scenario: 공개 route와 landing 진입 유지

- **WHEN** 비로그인 방문자가 landing 또는 `/privacy`에 접근한다
- **THEN** landing의 개인정보 처리방침 link와 로그인 없는 공개 처리방침 열람을 유지한다
- **AND** 가입·로그인 온보딩 안의 추가 진입점은 현재 범위에서 구현하지 않는다

## MODIFIED Requirements

### Requirement: Protected app routes require a valid session

**Authority / Provenance:** `PROD-148`, `PROD-161`, `PROD-541` — `(tabs)` 앱 셸 아래의 내부 화면(`/home`·`/compose`·`/search`·`/notifications`)은 유효한 세션(로그인)을 전제로 한다(MUST). 유효한 세션이 없는 사용자가 이 라우트에 접근하면 루트 온보딩(`/`)으로 이동해야 한다(MUST). 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 쿠키 존재만으로 판정하지 않는다. 공개 프로필 라우트(`/${relativeHandle}` 및 그 하위 게시글 상세)는 비로그인 조회를 유지해야 하며 이 가드에서 제외된다(MUST). 세션 확인이 진행 중이거나 조회가 실패한 동안에는 리다이렉트하지 않는다(MUST NOT).

#### Scenario: Redirect guest from protected route to onboarding

- **WHEN** 유효한 세션이 없는 사용자가 `/home`·`/compose`·`/search`·`/notifications` 중 하나에 접근한다
- **THEN** 시스템은 `currentSession`이 `null`임을 확인하고 루트 온보딩(`/`)으로 이동한다

#### Scenario: Invalid or expired session is treated as guest

- **WHEN** 만료·폐기된 세션 쿠키를 가진 사용자가 보호 라우트에 접근한다
- **THEN** `currentSession`이 `null`이므로 시스템은 비로그인과 동일하게 루트 온보딩(`/`)으로 이동한다

#### Scenario: Public profile remains accessible without login

- **WHEN** 비로그인 사용자가 `/${relativeHandle}` 또는 `/${relativeHandle}/{postId}`에 접근한다
- **THEN** 시스템은 리다이렉트하지 않고 공개 프로필·게시글을 표시한다

#### Scenario: Signed-in user reaches protected route

- **WHEN** 유효한 세션을 가진 사용자가 보호 라우트에 접근한다
- **THEN** 시스템은 리다이렉트 없이 해당 화면을 표시한다

#### Scenario: Hold redirect while session is loading

- **WHEN** `currentSession` 확인이 진행 중이거나 조회가 오류로 실패했다
- **THEN** 시스템은 판단을 보류하고 리다이렉트하지 않는다

### Requirement: Universal app shell rendering

**Authority / Provenance:** `docs/design/breakpoints.md`, archived `migrate-frontend-to-expo-relay`, PR #217, `PROD-541` — 앱 shell은 Expo Router route group에서 Android, iOS, Web 공용으로 렌더되어야 한다(MUST). 기존 웹 route와 사용자 동작을 유지하면서 native safe area와 web breakpoint를 적용해야 한다(MUST).

#### Scenario: Render a native tab screen

- **WHEN** Android 또는 iOS에서 `/home`, `/compose`, `/search`, `/notifications` 중 하나를 연다
- **THEN** 시스템은 native safe area 안에 route content와 하단 navigation을 표시한다
- **AND** 같은 route의 Web 화면과 같은 GraphQL data 및 주요 동작을 제공한다

#### Scenario: Render a web tab screen

- **WHEN** Web에서 tab route를 연다
- **THEN** 시스템은 viewport breakpoint에 따라 mobile bottom navigation, compact rail 또는 full three-column shell을 표시한다
- **AND** canonical URL은 기존 경로를 유지한다
