## ADDED Requirements

### Requirement: Universal app shell rendering

앱 shell은 Expo Router route group에서 Android, iOS, Web 공용으로 렌더되어야 한다(MUST). 기존 웹 route와 사용자 동작을 유지하면서 native safe area와 web breakpoint를 적용해야 한다(MUST).

#### Scenario: Render a native tab screen

- **WHEN** Android 또는 iOS에서 `/home`, `/compose`, `/search`, `/notifications`, `/menu` 중 하나를 연다
- **THEN** 시스템은 native safe area 안에 route content와 하단 navigation을 표시한다
- **AND** 같은 route의 Web 화면과 같은 GraphQL data 및 주요 동작을 제공한다

#### Scenario: Render a web tab screen

- **WHEN** Web에서 tab route를 연다
- **THEN** 시스템은 viewport breakpoint에 따라 mobile bottom navigation, compact rail 또는 full three-column shell을 표시한다
- **AND** canonical URL은 기존 경로를 유지한다

### Requirement: Relay fragment component ownership

GraphQL entity data를 표시하는 shell과 화면 component는 Relay fragment colocation을 사용해야 한다(MUST).

#### Scenario: Render entity component

- **WHEN** profile, post, session 또는 follow entity를 사용하는 component가 렌더된다
- **THEN** component는 필요한 field를 자기 fragment에 선언한다
- **AND** 부모 query 또는 fragment는 해당 child fragment를 spread한다
- **AND** 부모는 child의 field 목록을 scalar prop으로 복제하지 않는다

### Requirement: Universal profile switch synchronization

프로필 생성·선택 UI는 모든 플랫폼에서 같은 mutation과 session cache 계약을 사용해야 한다(MUST).

#### Scenario: Create first profile

- **WHEN** 프로필이 없는 로그인 사용자가 Android, iOS 또는 Web에서 프로필을 생성한다
- **THEN** `createProfile` mutation 결과의 account profile 목록과 생성 profile이 Relay store에 반영된다
- **AND** 사용자는 생성된 profile을 선택할 수 있다

#### Scenario: Switch active profile

- **WHEN** 사용자가 다른 profile을 선택한다
- **THEN** `selectProfile` mutation 결과의 `Session.selectedProfile`이 즉시 UI에 반영된다
- **AND** actor profile에 의존하는 route query는 새 actor context로 다시 실행된다

### Requirement: Universal accessibility semantics

공용 component는 Web과 native accessibility tree에서 동등한 역할, 이름, 상태를 제공해야 한다(MUST).

#### Scenario: Use keyboard or screen reader on web

- **WHEN** Web 사용자가 keyboard 또는 screen reader로 navigation, form, tab, dialog, list를 탐색한다
- **THEN** interactive element는 올바른 role, accessible name, selected/expanded/disabled state를 제공한다

#### Scenario: Use native accessibility service

- **WHEN** Android TalkBack 또는 iOS VoiceOver가 같은 화면을 탐색한다
- **THEN** 공용 React Native element는 동등한 accessibility label, role, state를 제공한다

## MODIFIED Requirements

### Requirement: Sidebar profile switching

유니버설 애플리케이션은 인증된 사용자가 앱 셸에서 접근 가능한 프로필 사이를 전환할 수 있게 해야 한다(MUST). 프로필 전환 성공 후 앱 셸의 활성 프로필 표시는 Relay store의 `Session.selectedProfile` 갱신을 반영해야 하며(MUST), 앱 셸 아래 route는 자기 화면에서 필요한 active profile field를 자기 GraphQL operation으로 선언해야 한다(MUST).

#### Scenario: Render accessible profiles

- **WHEN** 인증된 계정에 접근 가능한 활성 프로필이 있다
- **THEN** 데스크톱 사이드바 또는 모바일 profile switch surface는 활성 프로필 정보를 표시한다
- **AND** full 데스크톱 사이드바는 260px 높이의 상단 프로필 영역을 유지하고 compact rail은 40px avatar trigger를 사용한다
- **AND** 활성 프로필 정보는 `currentSession.selectedProfile` 조회 결과를 기반으로 하며, 프로필 전환 성공 후 Relay store 갱신과 actor environment 재생성 결과를 반영한다
- **AND** 현재 활성 프로필을 시각적으로 구분한다
- **AND** 접근 가능한 다른 프로필을 control로 표시해 전환할 수 있게 한다

#### Scenario: Switch active profile

- **WHEN** 사용자가 앱 셸에서 다른 접근 가능한 프로필을 선택한다
- **THEN** 시스템은 즉시 해당 프로필을 활성 프로필로 요청한다
- **AND** 요청 성공 후 앱 셸은 Relay store의 `Session.selectedProfile` 갱신 결과를 새 활성 프로필로 반영한다
- **AND** 클라이언트는 새 selected profile ID를 actor key로 사용해 Relay environment를 재생성한다
- **AND** 이미 열린 home, compose와 viewer-dependent profile/follow 화면은 새 actor environment에서 route query를 다시 실행한다
- **AND** 새 environment는 `homeTimeline`, `Profile.viewerState`, `Profile.viewerFollow`가 새 active profile 기준 결과임을 보장한다

#### Scenario: Create and switch to a new profile

- **WHEN** 인증된 사용자가 앱 셸에서 새 프로필 핸들을 입력하고 생성한다
- **THEN** 시스템은 새 프로필 생성을 요청한다
- **AND** 생성 성공 후 시스템은 새 프로필을 즉시 활성 프로필로 선택한다
- **AND** 앱 셸은 Relay store의 `Session.selectedProfile` 갱신 결과를 새 활성 프로필로 반영한다
- **AND** 시스템은 접근 가능한 프로필 목록이 새 프로필을 포함하도록 `me.profiles` connection 또는 동등한 Relay record를 갱신한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다
