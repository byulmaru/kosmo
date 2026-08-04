## ADDED Requirements

### Requirement: Profile picker의 Profile별 Unread 존재 표시

Profile picker는 접근 가능한 각 Profile의 visible Unread 존재 여부를 표시해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
`docs/design/colors.md`, `docs/domain/objects/notification.md`, `PROD-643` — Profile picker는 Account가
접근할 수 있는 각 Profile에 visible Unread 알림이 있는지를 selected Profile을 포함한 같은 Profile option에
표시해야 한다(MUST). 서버 제공 `Profile.unreadNotificationCount`가 양수인 option은 아바타 우상단에 숫자 없는
`12` logical unit(Web CSS px·iOS pt·Android dp) `accent` dot을 표시해야 한다(MUST). dot은 Profile option의
행 폭, label, pointer·touch target과 기존 selected check의 배치를 바꾸지 않아야 하며(MUST), 다른 Profile의
알림 내용이나 정확한 count를 노출하거나 Profile을 자동 전환하거나 알림을 읽음 처리해서는 안 된다(MUST NOT).

#### Scenario: Show unread presence for selected and non-selected Profiles

- **GIVEN** Account가 접근할 수 있는 selected Profile과 non-selected Profile의 `unreadNotificationCount`가 모두 양수다
- **WHEN** 사용자가 Web·Android·iOS 중 하나에서 Profile picker를 연다
- **THEN** 시스템은 두 Profile option의 아바타 우상단에 각각 숫자 없는 `12` logical unit `accent` dot을 표시한다
- **AND** selected Profile의 기존 check는 그대로 유지된다

#### Scenario: Hide a zero or unavailable Profile state

- **GIVEN** Profile option의 `unreadNotificationCount`가 `0`이거나 해당 option을 표시할 수 없다
- **WHEN** 시스템이 Profile picker를 렌더링한다
- **THEN** 시스템은 해당 Profile의 아바타에 Unread dot을 표시하지 않는다

#### Scenario: Keep a large count numberless

- **GIVEN** Profile의 `unreadNotificationCount`가 `127`이다
- **WHEN** 시스템이 Profile option을 렌더링한다
- **THEN** 시스템은 다른 양수 count와 같은 숫자 없는 `12` logical unit dot을 표시한다
- **AND** 시각적 UI와 accessible name 어디에도 `127`을 노출하지 않는다

#### Scenario: Preserve the Profile option layout and action

- **WHEN** Unread dot이 있는 Profile option을 렌더링하거나 사용자가 해당 option을 선택한다
- **THEN** dot은 아바타 위에 겹쳐 표시되고 option의 label, hit target과 selected check를 밀지 않는다
- **AND** 기존 Profile 선택 mutation과 actor 전환 동작을 그대로 실행한다

#### Scenario: Converge the selected Profile notification surfaces

- **GIVEN** non-selected Profile의 picker option에 Unread dot이 표시되어 있다
- **WHEN** 사용자가 해당 Profile을 선택하고 actor 전환이 성공한다
- **THEN** 기존 selected Profile 셸 badge와 알림 목록은 선택한 Profile의 서버 상태로 수렴한다
- **AND** picker의 숫자 없는 존재 표시를 정확한 badge count나 알림 목록 데이터로 사용하지 않는다

### Requirement: Profile picker Unread 접근성

Profile picker의 Unread 표시는 기존 Profile option 안에서 중복 없이 접근 가능해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `PROD-643` —
Profile Unread dot은 접근성 트리와 focus 순서에서 숨겨야 하며(MUST), 별도 접근성 element나 control로 노출해서는
안 된다(MUST NOT). Profile option의 accessible name은 기존 표시 이름과 handle을 유지하고, 해당 Profile에
Unread가 있을 때만 count 없는 `읽지 않은 알림 있음` 상태를 추가해야 한다(MUST). 기존 selected state와 option
동작은 각 platform의 현재 접근성 계약을 유지해야 한다(MUST).

#### Scenario: Announce boolean unread presence once

- **GIVEN** Profile의 `unreadNotificationCount`가 양수다
- **WHEN** screen reader가 해당 Profile option을 탐색한다
- **THEN** option은 기존 표시 이름과 handle에 `읽지 않은 알림 있음`을 더한 하나의 accessible name으로 노출된다
- **AND** dot은 별도 focus 대상이나 중복 accessibility element로 노출되지 않는다
- **AND** 정확한 Unread count는 읽지 않는다

#### Scenario: Preserve the existing name without unread

- **GIVEN** Profile의 `unreadNotificationCount`가 `0`이거나 해당 option을 표시할 수 없다
- **WHEN** screen reader가 Profile picker를 탐색한다
- **THEN** 표시된 option은 기존 표시 이름과 handle만 포함하는 accessible name을 유지한다
- **AND** `읽지 않은 알림 있음`을 읽지 않는다

#### Scenario: Preserve selected state independently from unread

- **GIVEN** selected Profile에 Unread가 있다
- **WHEN** screen reader가 해당 Profile option을 탐색한다
- **THEN** option은 기존 selected 상태와 `읽지 않은 알림 있음` 상태를 함께 전달한다
- **AND** Unread 상태는 selected check의 의미나 선택 동작을 대체하지 않는다
