## ADDED Requirements

### Requirement: Canonical viewer follow cache

유니버설 애플리케이션은 `Profile.viewerState.follow`를 viewer-relative established follow 관계의 유일한 Relay 표현으로 사용해야 한다(MUST).

#### Scenario: Update follow state after follow

- **WHEN** `followProfile` mutation이 established `ProfileFollow`를 반환한다
- **THEN** 클라이언트는 mutation 응답의 `followeeProfile.viewerState.follow`를 통해 canonical viewer state를 갱신한다
- **AND** 같은 관계를 나타내는 다른 `Profile` linked field를 별도로 갱신하지 않는다

#### Scenario: Update follow state after unfollow

- **WHEN** `unfollowProfile` mutation이 established `ProfileFollow`를 제거한다
- **THEN** 클라이언트는 mutation 응답의 `followeeProfile.viewerState.follow`를 통해 canonical viewer state를 갱신한다
- **AND** 같은 관계를 나타내는 다른 `Profile` linked field를 별도로 갱신하지 않는다

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
- **AND** 새 environment는 `homeTimeline`과 `Profile.viewerState`가 새 active profile 기준 결과임을 보장한다

#### Scenario: Create and switch to a new profile

- **WHEN** 인증된 사용자가 앱 셸에서 새 프로필 핸들을 입력하고 생성한다
- **THEN** 시스템은 새 프로필 생성을 요청한다
- **AND** 생성 성공 후 시스템은 새 프로필을 즉시 활성 프로필로 선택한다
- **AND** 앱 셸은 Relay store의 `Session.selectedProfile` 갱신 결과를 새 활성 프로필로 반영한다
- **AND** 시스템은 접근 가능한 프로필 목록이 새 프로필을 포함하도록 `me.profiles` connection 또는 동등한 Relay record를 갱신한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다
