## ADDED Requirements

### Requirement: Profile Block action confirmation and state lifecycle

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `DSN-53`; 책임 이슈는 `PROD-823`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Profile surface의 Block action은 Mute와 구분되는 공용 ConfirmationContent를 사용하고 Danger tone의 확인 제목·결과 설명·확정 action을 제공해야 한다(MUST). pending 동안 같은 action의 중복 입력과 dismiss를 차단하고 busy 상태를 전달해야 하며(MUST), 성공 상태는 서버 확정 결과를 사용하고 실패 시 기존 서버 상태와 제품의 공용 오류 피드백을 유지해야 한다(MUST).

#### Scenario: Block 확인을 취소하면 상태를 바꾸지 않는다

- **WHEN** 사용자가 Profile surface에서 Block action을 실행하고 공용 확인 UI에서 `취소` 또는 dismiss를 선택한다
- **THEN** 시스템은 Block mutation을 실행하지 않는다
- **AND** Profile, 관계 상태, 목록과 Toast는 기존 상태를 유지한다

#### Scenario: Block pending 중 중복 입력과 dismiss를 차단한다

- **WHEN** 사용자가 Block을 확정해 mutation이 pending 상태다
- **THEN** 시스템은 같은 Block action의 추가 입력과 확인 UI dismiss를 차단한다
- **AND** 보조 기술에 busy 또는 진행 중 상태를 전달한다

#### Scenario: Block 성공·실패 피드백을 서버 상태에 맞춘다

- **WHEN** Block mutation이 성공하거나 실패한다
- **THEN** 성공 시 시스템은 차단된 Profile의 서버 확정 상태와 관리 action을 표시한다
- **AND** 실패 시 시스템은 Profile의 기존 서버 확정 상태를 유지하고 공용 오류 피드백과 재시도 경로를 제공한다

### Requirement: Separate Profile Block management destination

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `DSN-53`; 책임 이슈는 `PROD-823`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Settings root는 `뮤트 및 차단` 진입점에서 `뮤트한 프로필`과 `차단한 프로필`을 별도 destination으로 이 순서에 제공해야 하며(MUST), Block destination은 자기 heading, loading, error·retry, empty, pagination과 해제 action을 소유해야 한다(MUST). Block과 Mute를 하나의 혼합 목록이나 이 흐름만을 위한 새 Settings shell로 합쳐서는 안 된다(MUST NOT).

#### Scenario: 차단한 프로필 목록의 독립 상태를 표시한다

- **WHEN** 사용자가 Settings의 `차단한 프로필` destination을 연다
- **THEN** 시스템은 차단 관계의 Target 목록과 destination heading을 표시한다
- **AND** 최초 loading, 오류·retry, empty와 pagination 상태를 해당 목록 안에서 표시한다
- **AND** `뮤트한 프로필`의 목록 상태나 action을 같은 목록 상태로 재사용하지 않는다

#### Scenario: Block 목록에서 Target을 해제한다

- **WHEN** Owner가 `차단한 프로필` 목록의 한 Target에 대해 `차단 해제` action을 확정한다
- **THEN** 시스템은 해당 Profile Block 해제 mutation을 실행한다
- **AND** 성공한 Target은 현재 Block 목록에서 제거되고 다른 목록 항목의 상태는 바꾸지 않는다

### Requirement: Relay actor and cache isolation for Block

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/settings.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `DSN-53`; 책임 이슈는 `PROD-823`, `PROD-813`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Block UI는 selected Profile별 Relay actor/store 경계를 유지해야 하며(MUST), `PROD-861` 결과를 prerequisite evidence로 참고하되 이후 승인된 presentation을 소비하고 보호된 Profile·Post·Media·Notification 데이터를 UI 상태로 복구해서는 안 된다(MUST NOT). Block·Unblock 성공 결과는 현재 화면, Block 목록과 이미 표시 중인 unavailable 표면의 cache에 서버 정책과 일치하도록 수렴시켜야 하며(MUST), selected Profile 또는 Session 전환 시 이전 Owner의 Block 상태·connection·cursor·optimistic 결과를 새 actor에 재사용해서는 안 된다(MUST NOT).

#### Scenario: Block 성공 뒤 표시 중인 결과가 정책에 수렴한다

- **WHEN** selected Profile이 Target을 차단하는 mutation이 성공한다
- **THEN** 시스템은 현재 Profile 화면과 Block 목록을 서버 확정 Block 상태로 갱신한다
- **AND** 접근할 수 없게 된 Target의 Profile·Post·Notification을 현재 Relay store와 화면에서 제거하거나 숨긴다
- **AND** mutation 실패 시 이전 cache를 차단된 것으로 확정하지 않는다

#### Scenario: selected Profile을 전환해도 Block 상태를 섞지 않는다

- **WHEN** selected Profile A의 Block 목록을 본 뒤 selected Profile B로 전환한다
- **THEN** 시스템은 A의 connection, edge, cursor와 Block 상태를 B의 결과로 재사용하지 않는다
- **AND** B의 Block 목록은 B가 Owner인 관계만 새로 조회한다

#### Scenario: Unblock 뒤 제거된 관계를 UI가 복구하지 않는다

- **WHEN** Owner가 Block 목록에서 Target의 차단을 해제한다
- **THEN** 시스템은 최신 Block 상태를 다시 조회해 목록과 Profile surface를 갱신한다
- **AND** 차단 생성 때 제거된 Follow 관계를 Relay optimistic update로 복구하지 않는다
- **AND** 이후 새 요청에서만 서버가 허용한 상대 Profile·Post·상호작용이 다시 나타날 수 있다

### Requirement: Profile Block interaction accessibility

**Authority / Provenance:** 정본은 `docs/design/profile-mute-block.md`, `docs/design/accessibility.md`, `DSN-53`; 책임 이슈는 `PROD-823`; 선행 presentation 구현 증거는 `PROD-861` (정본 아님). Block confirmation과 management list는 실제 동작에 맞는 role·accessible name·current·disabled·busy 상태와 안전한 초기 focus, modal 의미, Web `Escape`·Native back 및 focus 복원을 제공해야 한다(MUST). 공용 Button, ActionMenu, ModalSheet, Toast와 SettingsItem을 재사용해야 하며(MUST), 이 흐름만을 위한 새 Toast·범용 safety component·별도 UI package를 추가해서는 안 된다(MUST NOT).

#### Scenario: 확인 UI와 해제 action이 접근 가능한 이름과 상태를 제공한다

- **WHEN** keyboard 또는 보조 기술 사용자가 Block confirmation을 열거나 Block 목록의 해제 action으로 이동한다
- **THEN** 시스템은 확인 제목·설명·`취소`·확정 action과 각 action의 정확한 accessible name을 제공한다
- **AND** pending action은 disabled·busy 상태로 전달되고 확인 UI가 닫힌 뒤 유효한 이전 focus를 복원한다

#### Scenario: 지원 viewport와 긴 identity에서 layout을 유지한다

- **WHEN** Block confirmation과 목록을 Web 1024·1440, Mobile 390의 Light/Dark 상태에서 긴 handle·표시 이름과 함께 렌더링한다
- **THEN** 기존 Settings/Profile presentation의 reflow와 focus 순서를 유지한다
- **AND** Web 시각 target과 Native 입력 target이 canonical 접근성 계약을 만족하면서 인접 action과 겹치지 않는다
