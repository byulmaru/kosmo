## MODIFIED Requirements

### Requirement: Primary navigation targets home route

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-610` — 공통 navigation의 홈 항목과 모바일·compact·full Web 홈 헤더의 브랜드 마크는 모두 `/home`을 여는 홈 진입 control이어야 한다(MUST). 현재 경로가 `/home`이면 navigation의 홈 항목은 active 상태를 표시해야 한다(MUST). 다른 route에서 홈 진입 control을 실행하면 기존 forward navigation으로 `/home`을 열어야 하고(MUST), 이미 `/home`이면 document scroll을 매번 최상단으로 이동하면서 현재 Home Relay 데이터를 서버에서 한 번 다시 요청해야 한다(MUST). 홈 재선택으로 시작한 새로고침이 진행 중일 때 추가 실행은 document scroll을 최상단으로 이동해야 하지만(MUST) 추가 네트워크 요청을 시작해서는 안 된다(MUST NOT). 요청이 성공하거나 실패해 종료된 뒤의 다음 실행은 새 네트워크 요청을 정확히 한 번 시작해야 하며(MUST), 이전 요청이 실패했어도 현재 timeline 데이터를 유지해야 한다(MUST). 브랜드 마크는 기존 시각 geometry를 유지하면서 pointer·keyboard·screen reader에서 같은 navigation 결과를 제공해야 한다(MUST). 이 정책은 다른 현재 route 재선택, Android/iOS Native navigation 또는 Home 외 Relay 데이터 정책을 변경해서는 안 된다(MUST NOT).

#### Scenario: Home navigation links to /home

- **WHEN** 사용자가 sidebar, mobile drawer, 하단 탭 바 또는 홈 헤더의 브랜드 마크를 본다
- **THEN** 해당 홈 진입 control의 대상은 `/home`이다

#### Scenario: Home item active on home route

- **WHEN** 현재 경로가 `/home`이다
- **THEN** sidebar·mobile drawer·하단 탭 바의 홈 항목이 active로 강조된다

#### Scenario: Navigate to home from another route

- **WHEN** 현재 경로가 `/home`이 아니고 사용자가 홈 진입 control을 실행한다
- **THEN** 시스템은 기존 guarded forward navigation으로 `/home`을 연다
- **AND** 현재 홈 재선택용 Relay 새로고침을 별도로 시작하지 않는다

#### Scenario: Reselect the current home route

- **WHEN** 현재 경로가 `/home`이고 진행 중인 홈 재선택 새로고침이 없는 상태에서 사용자가 홈 진입 control을 다시 실행한다
- **THEN** 시스템은 document scroll을 최상단으로 이동한다
- **AND** 현재 Home Relay 데이터를 서버에서 다시 요청하는 네트워크 요청을 정확히 한 번 시작한다

#### Scenario: Reselect home while refresh is in flight

- **WHEN** 홈 재선택 새로고침이 진행 중이고 사용자가 홈 진입 control을 다시 실행한다
- **THEN** 시스템은 document scroll을 다시 최상단으로 이동한다
- **AND** 추가 Home Relay 네트워크 요청을 시작하지 않는다

#### Scenario: Reselect home after refresh settles

- **WHEN** 이전 홈 재선택 새로고침이 성공 또는 실패로 종료된 뒤 사용자가 홈 진입 control을 다시 실행한다
- **THEN** 시스템은 새로운 Home Relay 네트워크 요청을 정확히 한 번 시작한다
- **AND** 이전 요청이 실패했어도 현재 timeline 데이터를 유지한다

#### Scenario: Activate the brand mark accessibly

- **WHEN** 사용자가 pointer, keyboard 또는 screen reader로 홈 헤더의 브랜드 마크를 실행한다
- **THEN** 시스템은 입력 방식과 관계없이 같은 홈 이동 또는 현재 홈 재선택 결과를 제공한다
- **AND** 브랜드 마크의 기존 시각 geometry를 변경하지 않는다

#### Scenario: Reselect another current route

- **WHEN** 사용자가 홈이 아닌 현재 route의 navigation 항목을 다시 실행하거나 Android/iOS Native에서 홈을 다시 실행한다
- **THEN** 시스템은 이 요구사항에 따른 document 최상단 이동이나 Home Relay 새로고침을 추가하지 않는다
