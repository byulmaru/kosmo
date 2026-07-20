## ADDED Requirements

### Requirement: Profile-scoped unread notification badge

유니버설 앱 셸은 selected Profile의 서버 제공 `Profile.unreadNotificationCount`를 모든 알림 내비게이션 진입점에 표시해야 한다(MUST). 지원 진입점은 Android/iOS와 `compact` 미만 Web의 하단 탭 바, 모바일 drawer 사이드바, `compact` 이상 `full` 미만 Web의 아이콘 레일, `full` 이상 Web의 풀 사이드바다(MUST). badge는 기존 알림 아이콘에 겹쳐 표시하고 셸의 라벨, 행 배치, 클릭 영역과 내비게이션 구조를 바꾸지 않아야 한다(MUST).

#### Scenario: Hide a zero count

- **GIVEN** selected Profile의 `unreadNotificationCount`가 `0`이다
- **WHEN** 시스템이 지원하는 알림 셸 진입점을 렌더링한다
- **THEN** 시스템은 시각적 badge를 표시하지 않는다
- **AND** 진입점의 accessible name은 `알림`이다

#### Scenario: Show an exact count from one through ninety-nine

- **GIVEN** selected Profile의 `unreadNotificationCount`가 `1` 이상 `99` 이하다
- **WHEN** 시스템이 지원하는 알림 셸 진입점을 렌더링한다
- **THEN** 시스템은 알림 아이콘 우상단의 badge에 정확한 숫자를 표시한다
- **AND** 기존 라벨과 내비게이션 layout은 그대로 유지된다
- **AND** 진입점의 accessible name은 실제 서버 count를 사용한 `알림, 읽지 않은 알림 N개`다

#### Scenario: Cap a large count

- **GIVEN** selected Profile의 `unreadNotificationCount`가 `127`이다
- **WHEN** 시스템이 지원하는 알림 셸 진입점을 렌더링한다
- **THEN** 시스템은 알림 아이콘 우상단의 badge에 `99+`를 표시한다
- **AND** 진입점의 accessible name은 capped 표시값이 아닌 실제 서버 count를 사용한 `알림, 읽지 않은 알림 127개`다
- **AND** 시각적 badge는 별도 focus 대상이나 중복 accessibility element로 노출되지 않는다

#### Scenario: Render every supported shell surface

- **GIVEN** selected Profile의 `unreadNotificationCount`가 양수다
- **WHEN** 시스템이 하단 탭 바, 모바일 drawer, Web 아이콘 레일 또는 Web 풀 사이드바를 렌더링한다
- **THEN** 각 surface의 알림 아이콘은 같은 formatted count의 badge를 표시한다
- **AND** compact surface는 기존 icon-only 구조를, label이 있는 surface는 기존 label을 유지한다

#### Scenario: Expose one accessible navigation entry

- **GIVEN** selected Profile의 `unreadNotificationCount`가 양수 `N`이다
- **WHEN** screen reader가 알림 내비게이션 진입점을 탐색한다
- **THEN** 진입점은 실제 서버 count를 사용한 `알림, 읽지 않은 알림 N개`라는 하나의 accessible name으로 노출된다
- **AND** 시각적 badge는 별도 focus 대상이나 중복 accessibility element로 노출되지 않는다

### Requirement: Unread badge profile isolation and freshness

유니버설 앱 셸은 다른 Profile의 마지막 count를 selected Profile의 badge로 재사용하지 않아야 한다(MUST). selected Profile별 최초 성공 전에는 badge를 숨기고, 같은 Profile의 재조회가 실패하면 마지막 성공 count와 셸 진입점을 유지해야 한다(MUST). count 조회 오류는 전체 셸 query의 loading/error boundary로 전파되지 않는 non-suspending badge 상태 경계가 처리해야 하며(MUST), 그 상태 경계는 actor environment가 교체되어도 같은 selected Profile ID의 마지막 성공값을 보존해야 한다(MUST). 클라이언트는 목록 길이, hidden item 또는 임의의 로컬 증감으로 count를 다시 계산하지 않고 Relay의 normalized `Profile.unreadNotificationCount`와 이후 서버 재조회 결과에 수렴해야 한다(MUST).

#### Scenario: Hide the badge before the first successful count

- **GIVEN** selected Profile의 count 조회가 아직 성공하지 않았다
- **WHEN** 셸이 loading 상태 또는 최초 조회 오류 상태를 표시한다
- **THEN** 알림 진입점은 badge를 표시하지 않는다
- **AND** 진입점 자체는 `알림`이라는 accessible name을 유지한다

#### Scenario: Wait for the next existing refresh after an initial count-only failure

- **GIVEN** selected Profile의 최초 count 조회만 실패했고 셸의 다른 데이터와 진입점은 정상 렌더링됐다
- **WHEN** 시스템이 count 오류를 non-suspending badge 상태 경계에서 처리한다
- **THEN** 알림 진입점은 badge를 숨긴 채 유지된다
- **AND** badge 전용 오류 메시지나 retry control을 추가하지 않는다
- **AND** 다음 Profile 전환, 셸 재진입 또는 기존 셸 오류의 명시적 retry가 발생할 때 count를 다시 조회한다

#### Scenario: Do not leak the previous Profile count

- **GIVEN** Profile A의 마지막 성공 count가 `12`다
- **WHEN** 사용자가 Profile B로 전환한다
- **THEN** 시스템은 Profile B의 첫 성공 count가 도착할 때까지 badge를 숨긴다
- **AND** Profile A의 `12`를 Profile B의 진입점에 표시하지 않는다

#### Scenario: Keep the same Profile's last successful count after failure

- **GIVEN** 현재 selected Profile의 마지막 성공 count가 `7`이다
- **WHEN** 같은 Profile을 위한 후속 재조회가 실패한다
- **THEN** 시스템은 마지막 성공 count `7`을 계속 표시한다
- **AND** 실패를 `0`으로 해석하거나 badge를 제거하지 않는다
- **AND** count 오류 때문에 셸 진입점을 전체 오류 화면으로 교체하지 않는다

#### Scenario: Converge through the existing actor refresh lifecycle

- **GIVEN** selected Profile의 서버 count가 마지막 성공 count와 달라졌다
- **WHEN** Profile 전환, 셸 초기 로드·재진입 또는 기존 셸 오류 UI의 명시적 retry가 actor revision과 `store-and-network` 재조회를 실행한다
- **THEN** 성공한 서버 응답이 해당 Profile의 badge count를 갱신한다
- **AND** badge 상태 경계는 같은 Profile의 environment 교체 중 마지막 성공값을 지우지 않고 count 조회 오류를 전체 셸 오류로 전파하지 않는다
- **AND** count-only 오류를 위한 별도 retry control은 제공하지 않는다
- **AND** foreground 또는 network reconnect만을 위한 별도 자동 재조회 계약은 요구하지 않는다

#### Scenario: Reflect a normalized Profile cache update

- **GIVEN** 현재 selected Profile의 `unreadNotificationCount` Relay record가 새 값으로 갱신된다
- **WHEN** 같은 Profile을 표시하는 셸 진입점이 렌더링되어 있다
- **THEN** 모든 진입점은 같은 새 count를 표시한다
- **AND** badge consumer는 Notification 목록 길이 또는 hidden item 보정으로 별도 값을 만들지 않는다
