## ADDED Requirements

### Requirement: Profile edit route in the responsive shell

**Authority / Provenance:** `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `PROD-490`, `PROD-491`, `PROD-492` — Web Profile edit route는 기존 responsive shell의 중앙 최대 600px column에 표시해야 하며(MUST), 별도 desktop-only route tree나 modal을 primary surface로 사용해서는 안 된다(MUST NOT).

#### Scenario: Render Profile edit at full desktop width

- **WHEN** Web viewport가 `full` 이상이고 권한 있는 사용자가 Profile edit route에 진입한다
- **THEN** shell은 full sidebar와 right rail 사이 중앙 최대 600px surface에 Profile edit를 표시한다
- **AND** route header/save action이 sticky하더라도 document scroll 소유권을 유지한다

#### Scenario: Render Profile edit at compact desktop width

- **WHEN** Web viewport가 `compact` 이상 `full` 미만이고 권한 있는 사용자가 Profile edit route에 진입한다
- **THEN** shell은 icon rail 다음 중앙 최대 600px surface에 Profile edit를 표시한다
- **AND** right rail이나 Profile edit 전용 breakpoint를 추가하지 않는다
