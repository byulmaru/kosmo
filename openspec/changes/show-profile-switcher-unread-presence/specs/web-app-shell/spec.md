## ADDED Requirements

### Requirement: 닫힌 ProfileSwitcher의 Other Unread 표시

ProfileSwitcher는 picker를 열기 전에 selected Profile을 제외한 접근 가능한 Profile의 visible Unread 존재를 표시해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
`docs/design/colors.md`, `docs/domain/objects/notification.md`, `DSN-40`, `PROD-786` — selected Profile이 아닌
Profile 중 서버 제공 `unreadNotificationCount`가 양수인 항목이 하나라도 있으면 닫힌 trigger는 Other Unread
indicator를 표시해야 한다(MUST). `full`·`drawer`는 20px chevron 옆에 8px `action/primary/base` dot을,
`compact`는 40px avatar 우상단에 `background/canvas` 1px halo가 있는 12px dot을 사용해야 한다(MUST).
picker가 열리면 닫힌 indicator를 중복 표시해서는 안 된다(MUST NOT).

#### Scenario: Show Other Unread on a closed full or drawer trigger

- **GIVEN** selected Profile의 `unreadNotificationCount`는 `0`이고 non-selected Profile의 count는 양수다
- **WHEN** `full` 또는 `drawer` ProfileSwitcher가 닫혀 있다
- **THEN** trigger는 `읽지 않은 알림 있음`을 포함한 accessible name을 가진다
- **AND** 20px chevron 우상단의 지정 위치에 8px action-primary dot을 표시한다
- **AND** dot은 별도 accessibility element로 노출되지 않는다

#### Scenario: Show Other Unread on a closed compact trigger

- **GIVEN** non-selected Profile의 `unreadNotificationCount`가 양수다
- **WHEN** `compact` ProfileSwitcher가 닫혀 있다
- **THEN** 40px selected Profile avatar 우상단에 canvas 1px halo가 있는 12px action-primary dot을 표시한다
- **AND** avatar와 trigger의 layout·pointer·touch target을 바꾸지 않는다

#### Scenario: Ignore selected-only Unread

- **GIVEN** selected Profile에만 Unread가 있고 모든 non-selected Profile의 count는 `0`이다
- **WHEN** ProfileSwitcher가 닫혀 있다
- **THEN** ProfileSwitcher trigger는 Other Unread indicator를 표시하지 않는다
- **AND** selected Profile의 기존 notification shell badge 계약은 그대로 유지된다

#### Scenario: Hide the closed indicator while open

- **GIVEN** non-selected Profile에 Unread가 있어 닫힌 indicator가 표시됐다
- **WHEN** 사용자가 ProfileSwitcher를 연다
- **THEN** 닫힌 trigger indicator는 사라진다
- **AND** trigger의 기존 expanded 상태와 picker focus·dismiss lifecycle을 유지한다

### Requirement: 열린 Profile picker의 숫자 Unread badge

열린 Profile picker는 Unread가 있는 non-selected Profile의 count를 trailing 숫자 badge로 표시해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
`docs/design/colors.md`, `docs/domain/objects/notification.md`, `DSN-40`, `PROD-786` — badge는 24 logical unit
원형 `action/primary/base` surface와 `action/primary/on-base` `ui/label/s` text를 사용해야 한다(MUST).
`1`~`9`는 실제 숫자를, `10` 이상은 `9+`를 표시해야 하며(MUST), count `0`인 행에는 표시하지 않아야 한다
(MUST NOT). selected 행은 count badge 대신 기존 check를 유지해야 한다(MUST).

#### Scenario: Show counts from one through nine

- **GIVEN** non-selected Profile의 `unreadNotificationCount`가 `N`이고 `1 <= N <= 9`다
- **WHEN** 사용자가 Profile picker를 연다
- **THEN** 해당 행 오른쪽의 24 logical unit badge에 `N`을 표시한다

#### Scenario: Cap a large count at nine plus

- **GIVEN** non-selected Profile의 `unreadNotificationCount`가 `10` 이상이다
- **WHEN** 사용자가 Profile picker를 연다
- **THEN** 해당 행의 24 logical unit badge에 `9+`를 표시한다
- **AND** 서버 count나 Relay record를 변경하지 않는다

#### Scenario: Keep the selected check instead of a count badge

- **GIVEN** selected Profile의 `unreadNotificationCount`가 양수다
- **WHEN** 사용자가 Profile picker를 연다
- **THEN** selected 행은 기존 check를 표시한다
- **AND** 같은 trailing slot에 숫자 badge를 함께 표시하지 않는다

#### Scenario: Hide zero Unread

- **GIVEN** non-selected Profile의 `unreadNotificationCount`가 `0`이다
- **WHEN** 사용자가 Profile picker를 연다
- **THEN** 해당 행에 Unread badge를 표시하지 않는다

### Requirement: ProfileSwitcher Unread 접근성과 lifecycle 보존

ProfileSwitcher의 Unread presentation은 기존 Profile option 의미와 Profile 전환 수렴을 유지해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/design/accessibility.md`,
`docs/domain/objects/notification.md`, `PROD-643`, `PROD-786` — closed indicator와 open badge는 접근성 트리와
focus 순서에서 숨겨야 하며(MUST), Profile option의 accessible name은 기존 표시 이름·handle과 count 없는
`읽지 않은 알림 있음` 상태만 전달해야 한다(MUST). 기존 Profile 생성·선택, navigation guard, actor reset,
selected Profile shell badge와 알림 목록 수렴을 변경해서는 안 된다(MUST NOT).

#### Scenario: Announce boolean Unread once

- **GIVEN** Profile의 `unreadNotificationCount`가 양수다
- **WHEN** screen reader가 해당 Profile option을 탐색한다
- **THEN** option은 이름·handle과 `읽지 않은 알림 있음`을 하나의 accessible name으로 전달한다
- **AND** 정확한 count와 badge 자체는 별도로 읽지 않는다

#### Scenario: Preserve selected state independently

- **WHEN** screen reader가 selected Profile option을 탐색한다
- **THEN** 기존 selected state와 선택 동작을 유지한다
- **AND** Unread 상태가 check의 의미를 대체하지 않는다

#### Scenario: Converge after Profile selection

- **GIVEN** non-selected Profile의 숫자 badge가 표시돼 있다
- **WHEN** 사용자가 해당 Profile을 선택하고 actor 전환이 성공한다
- **THEN** 기존 selected Profile shell badge와 알림 목록은 선택한 Profile의 서버 상태로 수렴한다
- **AND** picker badge를 shell badge count나 알림 목록 데이터로 사용하지 않는다
