## ADDED Requirements

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

- **WHEN** 인증 session이 없는 사용자가 `/home`을 연다
- **THEN** 시스템은 프로필 온보딩 안내를 표시하지 않고 기존 홈 화면을 유지한다
- **AND** 비로그인 전용 온보딩 화면은 이 요구사항의 범위가 아니다

### Requirement: Home onboarding routes to existing profile create/select flow

홈 프로필 온보딩의 CTA는 새 생성/선택 흐름을 만들지 않고 기존 사이드바 프로필 스위처(생성·선택)를 열어야 한다(MUST). 데스크톱과 모바일 셸 차이를 처리해야 한다(MUST).

#### Scenario: 데스크톱에서 온보딩 CTA 사용

- **WHEN** 데스크톱 폭에서 사용자가 홈 온보딩 CTA를 누른다
- **THEN** 시스템은 좌측 사이드바의 프로필 스위처를 연다
- **AND** 사용자는 기존 사이드바 흐름으로 프로필을 만들거나 선택한다

#### Scenario: 모바일에서 온보딩 CTA 사용

- **WHEN** 모바일 폭에서 사용자가 홈 온보딩 CTA를 누른다
- **THEN** 시스템은 사이드바 드로어를 먼저 연 뒤 프로필 스위처를 연다

#### Scenario: 온보딩에서 프로필 생성·선택 완료

- **WHEN** 사용자가 온보딩에서 유도된 사이드바 흐름으로 프로필을 만들거나 선택한다
- **THEN** 세션의 선택 프로필이 갱신된다
- **AND** 홈은 더 이상 온보딩을 표시하지 않고 타임라인 영역을 표시한다
