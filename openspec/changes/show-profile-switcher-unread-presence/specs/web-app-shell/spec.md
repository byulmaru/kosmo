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

- **GIVEN** Profile의 `unreadNotificationCount`가 `0`이거나 현재 성공 응답에서 해당 Profile을 사용할 수 없다
- **WHEN** 시스템이 Profile option을 렌더링한다
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

- **GIVEN** Profile의 `unreadNotificationCount`가 `0`이거나 성공한 Unread 상태가 없다
- **WHEN** screen reader가 해당 Profile option을 탐색한다
- **THEN** option은 기존 표시 이름과 handle만 포함하는 accessible name을 유지한다
- **AND** `읽지 않은 알림 있음`을 읽지 않는다

#### Scenario: Preserve selected state independently from unread

- **GIVEN** selected Profile에 Unread가 있다
- **WHEN** screen reader가 해당 Profile option을 탐색한다
- **THEN** option은 기존 selected 상태와 `읽지 않은 알림 있음` 상태를 함께 전달한다
- **AND** Unread 상태는 selected check의 의미나 선택 동작을 대체하지 않는다

### Requirement: Profile picker Unread의 비차단 조회와 Profile 격리

Profile picker는 Profile별 Unread 상태를 비차단으로 조회하고 Profile ID별로 격리해야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `docs/domain/objects/notification.md`, `PROD-643` —
Profile picker는 열릴 때 현재 Account가 접근할 수 있는 Profile별 서버 제공
`unreadNotificationCount`를 별도 non-suspending Relay network operation으로 갱신해야 한다(MUST). 이 조회를
기존 suspending shell·Profile picker fragment에 결합하거나(MUST NOT), picker 표시·Profile 선택 또는 전체 셸의
loading/error boundary를 막아서는 안 된다(MUST NOT). 최초 성공 전 loading·오류에는 dot을 숨겨야 하며(MUST),
갱신 실패에는 같은 Profile ID의 마지막 성공 존재 여부만 유지해야 한다(MUST). 성공 응답은 현재 응답에 포함된
Profile ID 기준으로 상태를 원자적으로 교체해 응답에서 사라진 Profile의 이전 값을 제거해야 한다(MUST).

#### Scenario: Keep the picker interactive before the first success

- **GIVEN** Profile별 Unread 조회가 최초 loading 중이거나 최초 요청이 실패했다
- **WHEN** 사용자가 Profile picker를 열고 Profile option을 탐색하거나 선택한다
- **THEN** 시스템은 Unread dot을 표시하지 않는다
- **AND** picker 표시와 기존 Profile 선택 동작은 차단되지 않는다
- **AND** 전체 셸의 loading 또는 error boundary로 전파하지 않는다

#### Scenario: Replace state from a successful response

- **GIVEN** 성공 응답이 Profile A의 양수 count와 Profile B의 `0` count를 반환한다
- **WHEN** 시스템이 Profile별 Unread 상태를 적용한다
- **THEN** 시스템은 Profile A에만 Unread dot을 표시한다
- **AND** 다른 Account나 응답에 포함되지 않은 Profile의 값을 재사용하지 않는다

#### Scenario: Preserve only the same Profile's last success on refresh failure

- **GIVEN** Profile A는 마지막 성공 응답에서 Unread가 있었고 Profile B는 Unread가 없었다
- **WHEN** 같은 Account와 actor environment generation의 후속 갱신이 실패한다
- **THEN** 시스템은 Profile A에만 마지막 성공 Unread 존재 여부를 유지한다
- **AND** 실패 결과를 다른 Profile ID에 복사하거나 정확한 count로 노출하지 않는다

#### Scenario: Remove a Profile omitted by a later success

- **GIVEN** 이전 성공 응답에는 Profile A와 Profile B가 있었고 둘 다 Unread가 있었다
- **WHEN** 다음 성공 응답에 Profile A만 포함된다
- **THEN** 시스템은 Profile A의 최신 상태를 적용한다
- **AND** Profile B의 이전 Unread 상태를 제거한다

### Requirement: Profile picker Unread 요청의 Account 및 actor generation 귀속

Profile별 Unread 요청과 결과는 현재 Account 및 actor environment generation에 귀속되어야 한다(MUST).

**Authority / Provenance:** `docs/design/breakpoints.md`, `PROD-643` — 각 Profile별 Unread 요청은 요청을
시작한 Account와 Relay actor environment generation에 귀속되어야 한다(MUST). picker close·reopen, Account 변경
또는 actor environment 교체는 이전 요청을 취소하고 request generation을 무효화해야 하며(MUST), 취소 뒤 늦게
도착한 완료 결과를 현재 Profile별 상태에 적용해서는 안 된다(MUST NOT). Profile 전환 성공 뒤 selected Profile의
기존 8px 셸 badge와 알림 목록은 기존 actor 전환 및 서버 재조회 계약으로 새 Profile 상태에 수렴해야 하며(MUST),
picker용 Profile별 존재 상태를 셸 badge count 대신 재사용해서는 안 된다(MUST NOT).

#### Scenario: Ignore a completion after close and reopen

- **GIVEN** 첫 번째 picker open에서 시작한 요청이 완료되기 전에 picker를 닫고 다시 열었다
- **WHEN** 첫 번째 요청의 완료가 두 번째 open 요청보다 늦게 도착한다
- **THEN** 시스템은 첫 번째 요청 결과를 현재 Profile별 상태에 적용하지 않는다
- **AND** 두 번째 open의 request generation 결과만 적용할 수 있다

#### Scenario: Ignore a previous actor completion

- **GIVEN** Profile A actor environment에서 시작한 요청이 진행 중이다
- **WHEN** 사용자가 Profile B를 선택해 actor environment가 교체된 뒤 이전 요청이 완료된다
- **THEN** 시스템은 Profile A actor의 늦은 결과를 현재 Profile picker 상태에 적용하지 않는다
- **AND** 새 Account·actor generation의 Profile 목록과 상태만 현재 picker에 사용할 수 있다

#### Scenario: Converge the existing selected Profile badge and notification list

- **GIVEN** non-selected Profile B의 picker option에 Unread dot이 표시되어 있다
- **WHEN** 사용자가 Profile B를 선택하고 actor 전환이 성공한다
- **THEN** 기존 selected Profile의 8px 셸 badge와 알림 목록은 Profile B의 서버 상태로 다시 조회되어 수렴한다
- **AND** picker의 숫자 없는 존재 상태를 정확한 셸 badge count나 알림 목록 데이터로 사용하지 않는다

#### Scenario: Isolate state across Accounts

- **GIVEN** Account A의 Profile별 Unread 성공 상태가 메모리에 있다
- **WHEN** 세션의 Account가 Account B로 바뀌거나 로그아웃 후 다른 Account로 로그인한다
- **THEN** 시스템은 Account A의 Profile별 Unread 상태를 Account B의 picker에 표시하지 않는다
- **AND** Account B의 첫 성공 전에는 Unread dot을 숨긴다
