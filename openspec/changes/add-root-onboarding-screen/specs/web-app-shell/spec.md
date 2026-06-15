## MODIFIED Requirements

### Requirement: Root path redirects to home

루트 경로 `/`는 **로그인(유효 세션) 사용자**를 홈 진입점으로서 `/home`으로 리다이렉트해야 한다(MUST). 더 이상 모든 접근을 무조건 리다이렉트하지 않으며, 리다이렉트는 페이지 렌더 전 서버 사이드에서 처리한다. 세션 유효성은 `login/callback`과 동일하게 `Sessions`의 `ACTIVE` 상태로 판정한다.

#### Scenario: Redirect authenticated user to home

- **WHEN** 유효한 세션을 가진 사용자가 `/`에 접근한다
- **THEN** 시스템은 렌더 전에 `/home`으로 리다이렉트한다

#### Scenario: Invalid or missing session is treated as guest

- **WHEN** 세션 쿠키가 없거나 만료/비활성 세션을 가진 사용자가 `/`에 접근한다
- **THEN** 시스템은 비로그인으로 간주하고 `/home`으로 리다이렉트하지 않는다

## ADDED Requirements

### Requirement: Root path onboarding for guests

루트 경로 `/`는 비로그인 사용자에게 로그인 온보딩(Welcome) 화면을 렌더링해야 한다(MUST). 이 화면은 `(tabs)` 앱 셸(사이드바·하단 탭·우측 레일) 없이 독립으로 표시되며, 로그인 시작 동선을 제공한다.

#### Scenario: Show onboarding to logged-out user

- **WHEN** 비로그인 사용자가 `/`에 접근한다
- **THEN** 시스템은 앱 셸 없이 로그인 온보딩(Welcome) 화면을 렌더링한다

#### Scenario: Start login from onboarding

- **WHEN** 사용자가 온보딩 화면의 "시작하기"를 선택한다
- **THEN** 시스템은 로그인 시작 경로(`/login`)로 이동한다
