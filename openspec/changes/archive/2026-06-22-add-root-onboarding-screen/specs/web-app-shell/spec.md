## MODIFIED Requirements

### Requirement: Root path redirects to home

루트 경로 `/`는 **유효한 세션(로그인) 사용자**를 홈 진입점으로서 `/home`으로 보내야 한다(MUST). 더 이상 모든 접근을 무조건 리다이렉트하지 않는다. 세션 유효성은 클라이언트가 `currentSession` GraphQL 쿼리로 확인하며(만료·폐기된 세션은 `null`로 반환됨), 유효한 세션일 때만 클라이언트에서 `/home`으로 이동한다. `/`는 서버에서 요청별로 분기하지 않는 공개 페이지다(쿠키 존재만으로 서버 리다이렉트하지 않는다).

#### Scenario: Redirect signed-in user to home

- **WHEN** 유효한 세션을 가진 사용자가 `/`에 접근한다
- **THEN** 시스템은 `currentSession` 확인 후 `/home`으로 이동한다

#### Scenario: Invalid or missing session stays on onboarding

- **WHEN** 세션이 없거나 만료·폐기된 세션을 가진 사용자가 `/`에 접근한다
- **THEN** `currentSession`이 `null`이므로 `/home`으로 이동하지 않고 온보딩(Welcome) 화면에 머문다

## ADDED Requirements

### Requirement: Root path onboarding for guests

루트 경로 `/`는 비로그인 사용자에게 로그인 온보딩(Welcome) 화면을 렌더링해야 한다(MUST). 이 화면은 `(tabs)` 앱 셸(사이드바·하단 탭·우측 레일) 없이 독립으로 표시되며, 로그인 시작 동선을 제공한다.

#### Scenario: Show onboarding to logged-out user

- **WHEN** 비로그인 사용자가 `/`에 접근한다
- **THEN** 시스템은 앱 셸 없이 로그인 온보딩(Welcome) 화면을 렌더링한다

#### Scenario: Start login from onboarding

- **WHEN** 사용자가 온보딩 화면의 "시작하기"를 선택한다
- **THEN** 시스템은 로그인 시작 경로(`/login`)로 이동한다
