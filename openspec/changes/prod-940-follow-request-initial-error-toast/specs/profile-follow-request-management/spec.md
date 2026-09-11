## MODIFIED Requirements

### Requirement: 선택한 Profile의 받은 팔로우 요청 화면

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/page-header.md`, `docs/design/figma.md`, `PROD-272`, `PROD-566`, `PROD-940` 시스템은 인증된 사용자가 현재 선택한 Profile이 받은 pending Follow Request만 관리하는 protected canonical route `/follow-requests`를 제공해야 한다(MUST). 화면은 기존 공통 `PageHeader`로 단일 `팔로워 요청` heading을 제공하고 loading, initial error, empty와 content 상태를 같은 header 아래에서 전환해야 한다(MUST). 최초 목록 조회가 실패하면 loading skeleton을 유지하면서 `팔로워 요청을 불러오지 못했어요` 문구와 `다시 시도` action을 가진 persistent Danger Toast를 표시해야 하며(MUST), 중앙 오류 상태로 대체해서는 안 된다(MUST NOT).

#### Scenario: 선택한 Profile의 관리 화면 진입

- **WHEN** selected Profile이 있는 인증된 사용자가 `/follow-requests`를 연다
- **THEN** 시스템은 공통 `PageHeader`에 `팔로워 요청` heading을 표시한다
- **AND** 해당 Profile이 받은 pending Follow Request 목록만 조회한다

#### Scenario: 최초 목록 조회 실패

- **WHEN** `/follow-requests`의 최초 목록 조회가 실패한다
- **THEN** 시스템은 같은 `PageHeader`와 loading skeleton을 유지한다
- **AND** persistent Danger Toast로 오류 문구와 같은 조회를 실행하는 `다시 시도` action을 제공한다
- **AND** 오류와 재시도 가능 상태를 접근성 기술에 전달한다

#### Scenario: 최초 목록 조회 재시도

- **WHEN** 사용자가 initial error Toast의 `다시 시도`를 연속으로 입력한다
- **THEN** 시스템은 진행 중인 같은 query 재시도를 중복 실행하지 않는다
- **AND** 재시도가 다시 실패하면 같은 오류 Toast를 다시 제공한다
- **AND** 재시도가 성공하면 오류 Toast를 제거하고 empty 또는 content 상태를 표시한다

#### Scenario: 최초 목록 오류 화면 이탈

- **WHEN** 사용자가 initial error 상태에서 `/follow-requests` route를 떠난다
- **THEN** 시스템은 해당 route가 표시한 오류 Toast를 제거한다
- **AND** 다른 route의 Toast를 제거하지 않는다

### Requirement: selected Profile 상태 격리

**Authority / Provenance:** `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `docs/design/figma.md`, `PROD-272`, `PROD-566`, `PROD-940` 시스템은 selected Profile이 전환될 때 이전 Profile의 요청 목록, pagination, 행별 pending·error, 최초 조회 오류 Toast와 Relay cache state를 새 Profile 화면에 재사용해서는 안 된다(MUST NOT). 이전 actor에서 늦게 완료된 조회나 mutation이 새 selected Profile의 화면이나 connection을 변경해서도 안 된다(MUST NOT).

#### Scenario: Profile 전환

- **WHEN** 사용자가 `/follow-requests`를 보고 있는 동안 selected Profile을 전환한다
- **THEN** 시스템은 이전 Profile의 최초 조회 오류 Toast를 제거한다
- **AND** 새 Profile actor 경계에서 받은 요청 목록을 다시 조회한다
- **AND** 이전 Profile의 목록, pagination, pending과 error 상태를 표시하지 않는다

#### Scenario: 이전 actor 응답 격리

- **WHEN** Profile 전환 뒤 이전 actor의 조회나 mutation 응답이 늦게 완료된다
- **THEN** 해당 응답은 새 selected Profile의 목록이나 connection을 변경하지 않는다
