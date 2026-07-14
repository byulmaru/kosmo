## ADDED Requirements

### Requirement: Follow Notification source correlation

시스템은 새 `ProfileFollow` 관계를 첫 Notification source로 사용하고, source·Recipient·Related Profile의 상관관계를 보존하는 Follow Notification Item을 생성해야 한다(MUST).

#### Scenario: 새 Local Follow에서 알림 생성

- **WHEN** Local Follower Profile이 Local Followee Profile과 새 `ProfileFollow` 관계를 만들고 Notification eligibility 결과가 allow이다
- **THEN** 시스템은 Followee를 Recipient Profile, Follower를 Related Profile, 새 `ProfileFollow`를 source로 하는 `FOLLOW` Notification Item 하나를 생성한다
- **AND** 새 item의 `readAt`은 `null`이다

#### Scenario: source에서 Recipient와 Related Profile 파생

- **WHEN** 저장 경계가 하나의 established `ProfileFollow` source를 입력으로 받는다
- **THEN** 시스템은 source의 Followee를 Recipient, Follower를 Related Profile로 파생한다
- **AND** 호출자는 별도 Recipient 또는 Related Profile ID를 전달하지 않는다

#### Scenario: Remote Recipient source 거부

- **WHEN** 저장 경계에 Followee가 Remote Profile인 `ProfileFollow` source를 전달한다
- **THEN** 시스템은 Notification Item을 저장하지 않고 실패 결과를 반환한다
- **AND** source integration은 이 실패로 source action 결과를 변경하지 않는다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 `ProfileFollow.id` source를 Notification 저장 경계에 두 번 이상 전달한다
- **THEN** 시스템은 기존 Notification Item을 나타내는 성공 결과 또는 동등한 idempotent no-op을 반환한다
- **AND** 같은 source의 Notification Item은 하나만 존재한다

#### Scenario: source integration 경계 재진입

- **WHEN** 새 관계 생성 뒤 Notification integration 경계가 같은 `ProfileFollow.id` source로 재진입한다
- **THEN** integration은 idempotent 저장 경계를 호출해 성공한 no-op으로 끝난다
- **AND** 이 재진입은 이미 존재하던 관계에 대한 사용자 duplicate Follow와 구분된다

#### Scenario: 기존 관계에 대한 duplicate Follow

- **WHEN** 이미 존재하는 `ProfileFollow` 관계에 대해 사용자가 duplicate Follow를 요청한다
- **THEN** Follow action은 성공한 no-op으로 끝난다
- **AND** Follow action은 새 관계용 Notification integration을 다시 호출하지 않는다
- **AND** 시스템은 새 Notification Item을 생성하거나 과거의 누락된 item을 복구하지 않는다

#### Scenario: Unfollow 뒤 Re-follow

- **WHEN** 기존 관계를 Unfollow한 뒤 같은 Follower와 Followee가 다시 Follow하여 새 `ProfileFollow.id`를 만든다
- **THEN** 이전 source의 Notification Item은 남지 않는다
- **AND** eligibility가 allow이고 저장이 성공하면 시스템은 새 source에 대해 Follow Notification Item을 정확히 하나 생성한다

#### Scenario: 이미 materialize된 Remote Follower source

- **WHEN** 이미 materialize된 Remote Follower와 Local Followee 사이의 established `ProfileFollow`를 Notification 저장 경계에 전달한다
- **THEN** 시스템은 Follower origin에 따른 별도 분기 없이 Local Follower와 같은 source·Recipient mapping을 사용한다
- **AND** 이 검증은 ActivityPub ingress, actor materialization, Follow 또는 Undo transport를 수행하지 않는다

#### Scenario: 배포 전 관계

- **WHEN** Notification 기능 배포 전에 이미 존재하던 `ProfileFollow` 관계가 있다
- **THEN** 시스템은 historical Follow Notification을 backfill하지 않는다

### Requirement: Notification eligibility와 Follow 실패 격리

시스템은 모든 source integration에서 공통 Notification eligibility 경계를 먼저 평가해야 하며(MUST), Notification-side deny·오류·저장 실패가 `ProfileFollow` 결과를 rollback하거나 실패 응답으로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: 실제 정책이 연결되지 않은 기본 결과

- **WHEN** Profile Mute, Profile Block, Domain Block의 실제 판정 구현이 아직 eligibility 경계에 연결되지 않았다
- **THEN** eligibility 경계는 명시적인 기본 allow를 반환한다
- **AND** 시스템은 새 관계의 Notification Item 저장을 시도한다

#### Scenario: 명시적인 policy deny

- **WHEN** eligibility 경계가 deny를 반환한다
- **THEN** 시스템은 Notification Item을 생성하지 않는다
- **AND** 새 `ProfileFollow` 관계와 Follow 성공 응답은 유지한다

#### Scenario: policy 평가 오류

- **WHEN** eligibility 평가가 오류로 끝난다
- **THEN** 시스템은 privacy-safe한 fail-closed 결과로 Notification Item을 생성하지 않는다
- **AND** 새 `ProfileFollow` 관계와 Follow 성공 응답은 유지한다

#### Scenario: Notification 저장 실패

- **WHEN** eligibility가 allow이지만 Notification Item 저장이 실패한다
- **THEN** 시스템은 새 `ProfileFollow` 관계와 Follow 성공 응답을 유지한다
- **AND** 이번 capability는 누락된 Notification을 retry, outbox, duplicate Follow 또는 reconciliation으로 자동 복구하지 않는다

### Requirement: Follow source 생명주기 정리

시스템은 `ProfileFollow` source가 제거되면 이를 직접 원인으로 가진 Follow Notification Item도 제거해야 한다(MUST).

#### Scenario: Unfollow로 source 삭제

- **WHEN** Unfollow가 `ProfileFollow` source를 삭제한다
- **THEN** 저장 계층은 대응하는 Follow Notification source mapping과 Notification Item을 함께 삭제한다
- **AND** 삭제된 item은 목록과 Unread count에서 사라진다

#### Scenario: source row를 제거하는 다른 domain lifecycle

- **WHEN** Profile 또는 policy lifecycle이 `ProfileFollow` source row를 실제로 삭제한다
- **THEN** 대응하는 Follow Notification Item도 source와 함께 제거된다

#### Scenario: source는 남고 Related Profile만 unavailable

- **WHEN** Profile Domain Block, Instance Domain Block, Profile 비활성화·정지 또는 다른 조회 정책 변화로 Related Profile을 더 이상 조회할 수 없지만 `ProfileFollow` source는 남아 있다
- **THEN** 시스템은 기존 Notification Item과 Read 상태를 유지한다

### Requirement: Profile-scoped Notification GraphQL 계약

API는 현재 선택된 Profile에 귀속된 Notification Item connection과 Unread count를 Profile object에 제공해야 한다(MUST).

#### Scenario: Notification GraphQL shape

- **WHEN** GraphQL schema를 생성한다
- **THEN** `NotificationItem`은 Relay `Node`를 구현하고 `id`, `type`, `createdAt`, nullable `readAt`, nullable `relatedProfile`을 제공한다
- **AND** `NotificationType`은 이번 capability에서 `FOLLOW`만 제공한다
- **AND** `Profile.notifications`는 `NotificationItemConnection`을, `Profile.unreadNotificationCount`는 음수가 아닌 정수를 반환한다
- **AND** API는 raw source ID나 과거 이름·handle snapshot을 Notification Item 필드로 노출하지 않는다

#### Scenario: 선택된 Profile inbox 조회

- **WHEN** 현재 session에 선택된 Profile이 있고 클라이언트가 그 Profile의 `notifications`와 `unreadNotificationCount`를 조회한다
- **THEN** API는 해당 Profile이 Recipient인 item과 count만 반환한다

#### Scenario: 선택된 Profile이 없는 조회

- **WHEN** 로그인 session에 선택된 Profile이 없는 요청이 Profile-scoped Notification 필드에 접근한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

#### Scenario: 다른 Recipient Profile 조회

- **WHEN** 요청이 다른 Account의 Profile 또는 같은 Account에서 현재 선택되지 않은 Profile의 inbox를 조회한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다
- **AND** 그 Profile의 Notification Item이나 count를 노출하지 않는다

#### Scenario: 다른 Recipient의 Notification Node 조회

- **WHEN** 요청이 `node(id:)`로 현재 선택된 Profile이 Recipient가 아닌 Notification Item ID를 조회한다
- **THEN** recipient-filtered Node loader는 해당 object를 반환하지 않는다

### Requirement: Stable newest-first Notification pagination

API는 Kosmo UUID v8 Notification Item ID의 시간 순서를 사용해 Recipient inbox를 stable newest-first Relay connection으로 제공해야 한다(MUST).

#### Scenario: 첫 페이지 정렬

- **WHEN** 클라이언트가 선택된 Profile의 Notification 첫 페이지를 요청한다
- **THEN** API는 `NotificationItem.id DESC` 순서로 item을 반환한다
- **AND** opaque cursor는 마지막 item ID를 기준으로 다음 경계를 표현한다

#### Scenario: 다음 페이지 조회

- **WHEN** 클라이언트가 이전 페이지의 end cursor로 다음 페이지를 요청한다
- **THEN** API는 cursor보다 오래된 ID만 반환한다
- **AND** 페이지 경계에서 item을 중복하거나 건너뛰지 않는다

#### Scenario: 새 item 도착 뒤 pagination

- **WHEN** 첫 페이지 조회 뒤 더 최신 Notification Item이 생성되고 클라이언트가 기존 cursor로 다음 페이지를 요청한다
- **THEN** API는 기존 cursor의 오래된 방향 경계를 유지한다
- **AND** 새 item은 새로고침 또는 route 재조회에서 첫 페이지에 나타난다

### Requirement: Idempotent Notification Read와 Unread count

API는 선택된 Recipient Profile의 Notification Item 하나를 Read로 전환하고 같은 Profile 범위의 Unread count를 일관되게 갱신해야 한다(MUST).

#### Scenario: 최초 Read

- **WHEN** Recipient가 `markNotificationRead(input: { id })`로 `readAt = null`인 item을 읽는다
- **THEN** API는 `readAt`에 최초 Read 시각을 한 번 기록한다
- **AND** Recipient Profile의 `unreadNotificationCount`는 한 번 감소한다
- **AND** `MarkNotificationReadPayload`는 갱신된 `notificationItem`과 `recipientProfile`을 반환한다

#### Scenario: 반복 Read

- **WHEN** Recipient가 이미 Read인 같은 item ID로 `markNotificationRead(input: { id })`를 다시 호출한다
- **THEN** API는 성공한 idempotent 결과를 반환한다
- **AND** 최초 `readAt`과 Unread count를 변경하지 않는다

#### Scenario: 동시 Read

- **WHEN** 같은 Unread item에 둘 이상의 Read 요청이 동시에 도착한다
- **THEN** 시스템은 하나의 Unread-to-Read 전이만 반영한다
- **AND** 모든 성공 응답은 보존된 최초 `readAt`과 일관된 Unread count를 관찰한다

#### Scenario: 다른 Profile item Read

- **WHEN** 요청이 다른 Account 또는 같은 Account의 다른 선택되지 않은 Profile이 Recipient인 item ID를 읽으려 한다
- **THEN** API는 존재하지 않는 ID와 구별되지 않는 `NOT_FOUND` GraphQL 오류를 반환한다
- **AND** item과 count는 변경되지 않는다

#### Scenario: 선택된 Profile이 없는 Read

- **WHEN** session에 선택된 Profile이 없는 요청이 `markNotificationRead`를 호출한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

### Requirement: Related Profile unavailable fallback

시스템은 source가 남아 있는 기존 Notification Item의 Related Profile을 조회할 수 없더라도 item·Read·Unread count를 유지해야 한다(MUST).

#### Scenario: unavailable Related Profile API 응답

- **WHEN** 기존 Follow Notification의 source는 남아 있지만 Follower Profile을 현재 Recipient가 조회할 수 없다
- **THEN** API는 item을 connection에 유지하고 `relatedProfile: null`을 반환한다
- **AND** 이름·handle snapshot을 대신 반환하지 않는다

#### Scenario: unavailable item Read와 count

- **WHEN** `relatedProfile`이 `null`인 item이 Unread이다
- **THEN** item은 `unreadNotificationCount`에 포함된다
- **AND** Recipient는 같은 `markNotificationRead` 계약으로 item을 Read 처리할 수 있다

#### Scenario: unavailable Follow item 표시와 활성화

- **WHEN** Follow item의 `relatedProfile`이 `null`이다
- **THEN** 클라이언트는 저장 snapshot 없이 `FOLLOW` type 기반 generic fallback을 표시하고 Profile 이동을 비활성화한다
- **AND** item이 Unread이면 사용자는 item을 Read 처리할 수 있다
- **AND** unavailable item 하나가 목록 전체의 error가 되거나 숨겨져서는 안 된다

### Requirement: Local Follow vertical verification

시스템은 실제 Local Follow action부터 Notification Item, API, 목록 UI와 badge까지의 Profile 격리를 Web E2E로 검증해야 한다(MUST).

#### Scenario: Recipient Profile A와 B 격리

- **WHEN** Local Follower가 Recipient Account의 Profile A를 실제 Follow action으로 팔로우하고 Recipient가 Profile B와 A를 차례로 선택한다
- **THEN** Profile B의 API와 UI에는 A의 Notification Item이나 Unread count가 노출되지 않는다
- **AND** Profile A에서는 Follower를 가리키는 Unread item과 count가 보인다
- **AND** `PROD-277`·`PROD-324`가 구현 전에 추가한 목록·Read·navigation·badge 요구사항을 같은 item으로 검증한다
- **AND** Profile B로 다시 전환해도 A의 item이나 count가 섞이지 않는다
