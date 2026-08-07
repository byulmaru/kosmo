# profile-follow-request-management Specification

## Purpose

인증된 사용자가 현재 selected Profile이 받은 pending Follow Request를 `/follow-requests`에서 확인·pagination·승인·거절하고 Profile 전환 전후 actor 상태를 격리하는 계약을 문서화한다.

## Requirements

### Requirement: 선택한 Profile의 받은 팔로우 요청 화면

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/page-header.md`, `PROD-272`, `PROD-566` 시스템은 인증된 사용자가 현재 선택한 Profile이 받은 pending Follow Request만 관리하는 protected canonical route `/follow-requests`를 제공해야 한다(MUST). 화면은 기존 공통 `PageHeader`로 단일 `팔로워 요청` heading을 제공하고 loading, error, empty와 content 상태를 같은 header 아래에서 전환해야 한다(MUST).

#### Scenario: 선택한 Profile의 관리 화면 진입

- **WHEN** selected Profile이 있는 인증된 사용자가 `/follow-requests`를 연다
- **THEN** 시스템은 공통 `PageHeader`에 `팔로워 요청` heading을 표시한다
- **AND** 해당 Profile이 받은 pending Follow Request 목록만 조회한다

#### Scenario: 화면 상태 전환

- **WHEN** 초기 목록이 loading, error, empty 또는 content 상태로 전환된다
- **THEN** 시스템은 같은 `PageHeader`를 유지한다
- **AND** 현재 상태에 대응하는 indicator, 설명·재시도, empty 안내 또는 목록을 header 아래에 표시한다

### Requirement: 받은 요청 목록과 pagination

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566` 시스템은 현재 selected Profile이 소유한 `incomingProfileFollowRequests` connection을 opaque cursor와 deterministic total order로 표시해야 한다(MUST). 사용자가 목록 끝에 가까워지면 다음 페이지를 자동으로 요청해야 하며(MUST), 추가 로딩 실패가 이미 표시된 요청을 제거해서는 안 된다(MUST NOT).

#### Scenario: 다음 페이지 자동 로딩

- **WHEN** 더 불러올 요청이 있고 사용자가 목록 끝에 가까워진다
- **THEN** 시스템은 다음 cursor page를 자동으로 요청한다
- **AND** 추가 로딩 중에도 이미 표시된 요청을 유지한다

#### Scenario: 추가 로딩 실패 복구

- **WHEN** 다음 cursor page 요청이 실패한다
- **THEN** 시스템은 기존 목록을 유지한다
- **AND** 목록 하단에서 같은 다음 페이지 요청을 재시도할 수 있게 한다

### Requirement: 요청자 정보와 처리 동작

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566` 시스템은 확인 가능한 requester의 요청 행에 아바타, 표시 이름, `@relativeHandle`, requester Profile link와 별도의 `승인`·`거절` 동작을 제공해야 한다(MUST). 요청 시각을 표시해서는 안 된다(MUST NOT). requester Profile을 확인할 수 없는 요청도 숨겨서는 안 되며(MUST NOT), `확인할 수 없는 프로필` fallback과 `거절`만 제공해야 한다(MUST).

#### Scenario: 확인 가능한 requester 표시

- **WHEN** pending Follow Request의 requester Profile을 확인할 수 있다
- **THEN** 요청 행은 아바타, 표시 이름과 `@relativeHandle`을 하나의 Profile link 영역으로 제공한다
- **AND** Profile link와 분리된 `승인`·`거절` 동작을 제공한다
- **AND** 요청 시각을 표시하지 않는다

#### Scenario: unavailable requester 정리

- **WHEN** active selected Profile이 소유한 pending Follow Request의 requester Profile을 확인할 수 없다
- **THEN** 시스템은 요청을 목록에서 숨기지 않고 `확인할 수 없는 프로필` fallback 행으로 표시한다
- **AND** Profile link와 `승인` 동작은 제공하지 않는다
- **AND** 사용자가 pending request를 정리할 수 있는 `거절` 동작을 제공한다

### Requirement: 승인·거절 결과와 행별 복구

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566` 시스템은 한 요청의 처리가 진행되는 동안 그 행의 승인·거절 동작만 비활성화하고 다른 행은 계속 처리할 수 있게 해야 한다(MUST). 처리된 행은 서버 성공 응답 뒤에만 제거해야 하며(MUST), mutation payload의 삭제된 request global ID로 현재 selected Profile의 connection에서 정확한 요청을 제거해야 한다(MUST). 실패하면 행을 유지하고 인라인 오류와 같은 동작의 재시도를 제공해야 한다(MUST).

#### Scenario: 요청 승인 성공

- **WHEN** 사용자가 확인 가능한 requester의 요청을 승인하고 서버가 성공 응답을 반환한다
- **THEN** 시스템은 삭제된 request ID에 대응하는 행을 현재 connection에서 제거한다
- **AND** 성공 payload의 성립된 follow 관계를 Relay store에 반영한다

#### Scenario: 요청 거절 성공

- **WHEN** 사용자가 요청을 거절하고 서버가 성공 응답을 반환한다
- **THEN** 시스템은 삭제된 request ID에 대응하는 행을 현재 connection에서 제거한다
- **AND** 새 follow 관계를 생성하지 않는다

#### Scenario: 처리 실패와 재시도

- **WHEN** 승인 또는 거절 mutation이 실패한다
- **THEN** 시스템은 해당 요청 행을 목록에 유지한다
- **AND** 실패한 동작을 나타내는 인라인 오류와 같은 동작의 재시도를 제공한다
- **AND** 다른 요청 행의 동작은 계속 사용할 수 있다

### Requirement: selected Profile 상태 격리

**Authority / Provenance:** `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `docs/design/accessibility.md`, `PROD-272`, `PROD-566` 시스템은 selected Profile이 전환될 때 이전 Profile의 요청 목록, pagination, 행별 pending·error와 Relay cache state를 새 Profile 화면에 재사용해서는 안 된다(MUST NOT). 이전 actor에서 늦게 완료된 조회나 mutation이 새 selected Profile의 화면이나 connection을 변경해서도 안 된다(MUST NOT).

#### Scenario: Profile 전환

- **WHEN** 사용자가 `/follow-requests`를 보고 있는 동안 selected Profile을 전환한다
- **THEN** 시스템은 새 Profile actor 경계에서 받은 요청 목록을 다시 조회한다
- **AND** 이전 Profile의 목록, pagination, pending과 error 상태를 표시하지 않는다

#### Scenario: 이전 actor 응답 격리

- **WHEN** Profile 전환 뒤 이전 actor의 조회나 mutation 응답이 늦게 완료된다
- **THEN** 해당 응답은 새 selected Profile의 목록이나 connection을 변경하지 않는다
