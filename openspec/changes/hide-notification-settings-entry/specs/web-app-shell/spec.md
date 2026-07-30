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

#### Scenario: generic menu placeholder 제거

- **WHEN** PROD-541의 유니버설 route 구성이 등록된다
- **THEN** 시스템은 generic `메뉴` 소개·설명·login-test UI만 렌더링하던 `/menu` placeholder route를 등록하지 않는다
- **AND** `/menu` 직접 접근에 새 redirect나 전용 404 화면을 추가하지 않는다
- **AND** 팔로우 요청의 pending 저장 모델과 GraphQL 목록·승인·거절·취소 계약을 변경하지 않는다

## MODIFIED Requirements

### Requirement: Universal shell feedback navigation

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/colors.md`, `docs/design/typography.md`, `memory/frontend-react-native.md`, `PROD-479`, `PROD-487`, `PROD-541` — The Android/iOS/Web shell MUST provide a "피드백 보내기" link in the existing settings-and-support position of the full sidebar, compact icon rail, and mobile drawer. The link MUST navigate to the protected canonical `/feedback` route.

#### Scenario: Navigate from full sidebar

- **WHEN** 로그인한 사용자가 full sidebar의 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** 링크는 실제 destination을 나타내는 link semantics와 접근 가능한 이름을 제공한다

#### Scenario: Navigate from compact rail

- **WHEN** 로그인한 사용자가 compact icon rail의 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** icon-only link의 accessible name은 "피드백 보내기"이다

#### Scenario: Navigate from mobile drawer

- **WHEN** mobile drawer가 열려 있고 로그인한 사용자가 "피드백 보내기" 링크를 활성화한다
- **THEN** 시스템은 `/feedback` 피드백 화면으로 이동한다
- **AND** 열려 있던 drawer를 닫는다

#### Scenario: Mark feedback navigation current

- **WHEN** Android/iOS/Web shell의 현재 route가 `/feedback`이다
- **THEN** 시스템은 "피드백 보내기" 링크를 active로 표시한다
- **AND** active 상태는 page-current semantics로 노출된다

#### Scenario: Share feedback navigation across platforms

- **WHEN** Android, iOS 또는 Web 앱이 shell navigation을 렌더링한다
- **THEN** 시스템은 공통 "피드백 보내기" link를 `/feedback` route에 노출한다
- **AND** 각 플랫폼의 기존 drawer close와 navigation semantics를 유지한다

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
