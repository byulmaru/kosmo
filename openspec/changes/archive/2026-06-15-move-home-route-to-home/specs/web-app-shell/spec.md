## ADDED Requirements

### Requirement: Home route location

홈 콘텐츠는 `(tabs)` 탭 셸 아래 `/home` 경로에서 제공되어야 한다(MUST). 루트 경로 `/`는 더 이상 홈 콘텐츠를 렌더링하지 않는다.

#### Scenario: Render home at /home

- **WHEN** 사용자가 `/home`을 연다
- **THEN** 시스템은 `(tabs)` 탭 셸(사이드바·하단 탭·우측 레일) 안에 홈 콘텐츠를 렌더링한다

### Requirement: Root path redirects to home

루트 경로 `/`는 홈 진입점으로서 `/home`으로 리다이렉트해야 한다(MUST). 이는 임시 리다이렉트이며 이후 온보딩 도입 시 교체된다.

#### Scenario: Redirect root to home

- **WHEN** 사용자가 `/`에 접근한다
- **THEN** 시스템은 `/home`으로 리다이렉트한다

### Requirement: Primary navigation targets home route

공통 내비게이션(데스크톱 사이드바, 모바일 하단 탭 바)의 홈 항목은 `/home`을 가리켜야 하며(MUST), 현재 경로가 `/home`일 때 홈 항목을 active로 표시해야 한다(MUST).

#### Scenario: Home navigation links to /home

- **WHEN** 사용자가 사이드바 또는 하단 탭 바의 홈 항목을 본다
- **THEN** 홈 항목의 링크 대상은 `/home`이다

#### Scenario: Home item active on home route

- **WHEN** 현재 경로가 `/home`이다
- **THEN** 사이드바·하단 탭 바의 홈 항목이 active로 강조된다
