## MODIFIED Requirements

### Requirement: Sidebar profile switching

웹 애플리케이션은 인증된 사용자가 사이드바에서 접근 가능한 프로필 사이를 전환할 수 있게 해야 한다(MUST). 프로필 전환 성공 후 앱 셸의 활성 프로필 표시는 성공 응답의 갱신된 `Session.selectedProfile`을 반영해야 하며(MUST), 일반 프로필 선택은 `currentSession` 전체 refetch 완료에 의존하지 않아야 한다(MUST NOT).

#### Scenario: Render accessible profiles

- **WHEN** 인증된 계정에 접근 가능한 활성 프로필이 있다
- **THEN** 사이드바는 260px 높이의 상단 프로필 영역에 활성 프로필 정보를 표시한다
- **AND** 활성 프로필 정보는 현재 세션의 선택 프로필 조회 결과 또는 가장 최근 프로필 전환 성공 응답의 `Session.selectedProfile`을 기반으로 한다
- **AND** 현재 활성 프로필을 시각적으로 구분한다
- **AND** 최근 접근 가능한 프로필을 40px avatar control로 표시해 전환할 수 있게 한다

#### Scenario: Switch active profile

- **WHEN** 사용자가 사이드바에서 다른 접근 가능한 프로필을 선택한다
- **THEN** 시스템은 즉시 해당 프로필을 활성 프로필로 요청한다
- **AND** 요청 성공 후 사이드바는 성공 응답의 `Session.selectedProfile`을 새 활성 프로필로 반영한다
- **AND** 사이드바는 `currentSession` 전체 조회가 다시 완료될 때까지 이전 활성 프로필을 계속 표시하지 않는다
- **AND** 시스템은 `homeTimeline`처럼 active profile에 의존하는 root query field를 stale 처리하거나 동등한 방식으로 새 active profile 기준 결과를 보장한다

#### Scenario: Create and switch to a new profile

- **WHEN** 인증된 사용자가 사이드바에서 새 프로필 핸들을 입력하고 생성한다
- **THEN** 시스템은 새 프로필 생성을 요청한다
- **AND** 생성 성공 후 시스템은 새 프로필을 즉시 활성 프로필로 선택한다
- **AND** 사이드바는 성공 응답의 `Session.selectedProfile`을 새 활성 프로필로 반영한다
- **AND** 시스템은 접근 가능한 프로필 목록이 새 프로필을 포함하도록 `me.profiles` 또는 동등한 프로필 목록 데이터를 갱신한다

#### Scenario: Keep current profile selection

- **WHEN** 사용자가 이미 활성화된 프로필을 선택한다
- **THEN** 시스템은 현재 활성 프로필을 그대로 유지한다
