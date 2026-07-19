## ADDED Requirements

### Requirement: Follow Notification source correlation

시스템은 새 `ProfileFollow` 관계를 첫 Notification source로 사용하고 source·Recipient·Related Profile의 상관관계를 보존하는 Follow Notification을 생성해야 한다(MUST).

#### Scenario: 새 Local Follow에서 알림 생성

- **WHEN** Local Follower Profile이 Local Followee Profile과 새 `ProfileFollow` 관계를 만들고 Notification eligibility 결과가 allow이다
- **THEN** 시스템은 `kind = FOLLOW`, `source_id = ProfileFollow.id`, `recipient_profile_id = Followee.id`, `data = {}`인 Notification 하나를 생성한다
- **AND** Related Profile은 source의 Follower에서 파생한다
- **AND** 새 item의 `readAt`은 `null`이다

#### Scenario: source-only 저장 입력

- **WHEN** 저장 경계가 하나의 established `ProfileFollow` source를 입력으로 받는다
- **THEN** 시스템은 source의 Followee를 Recipient, Follower를 Related Profile로 파생한다
- **AND** 호출자는 별도 Recipient 또는 Related Profile ID를 전달하지 않는다

#### Scenario: Remote Recipient source 거부

- **WHEN** 저장 경계에 Followee가 Remote Profile인 `ProfileFollow` source를 전달한다
- **THEN** 시스템은 Notification을 저장하지 않고 실패 결과를 반환한다
- **AND** source integration은 이 실패로 source action 결과를 변경하지 않는다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 `ProfileFollow.id` source를 Notification 저장 경계에 두 번 이상 전달한다
- **THEN** 시스템은 기존 Notification을 나타내는 성공 결과 또는 동등한 idempotent no-op을 반환한다
- **AND** `(FOLLOW, source_id, recipient_profile_id)`의 Notification은 하나만 존재한다

#### Scenario: source integration 경계 재진입

- **WHEN** 새 관계 생성 뒤 Notification integration 경계가 같은 `ProfileFollow.id` source로 재진입한다
- **THEN** integration은 idempotent 저장 경계를 호출해 성공한 no-op으로 끝난다
- **AND** 이 재진입은 이미 존재하던 관계에 대한 사용자 duplicate Follow와 구분된다

#### Scenario: 기존 관계에 대한 duplicate Follow

- **WHEN** 이미 존재하는 `ProfileFollow` 관계에 대해 사용자가 duplicate Follow를 요청한다
- **THEN** Follow action은 성공한 no-op으로 끝난다
- **AND** Follow action은 새 관계용 Notification integration을 다시 호출하지 않는다
- **AND** 시스템은 새 Notification을 생성하거나 과거의 누락된 item을 복구하지 않는다

#### Scenario: Unfollow 뒤 Re-follow

- **WHEN** 기존 관계를 Unfollow한 뒤 같은 Follower와 Followee가 다시 Follow하여 새 `ProfileFollow.id`를 만든다
- **THEN** 정상 cleanup이 성공한 이전 source의 Notification은 남지 않는다
- **AND** eligibility가 allow이고 저장이 성공하면 시스템은 새 source에 대해 Follow Notification을 정확히 하나 생성한다

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
- **AND** 시스템은 새 관계의 Notification 저장을 시도한다

#### Scenario: 명시적인 policy deny

- **WHEN** eligibility 경계가 deny를 반환한다
- **THEN** 시스템은 Notification을 생성하지 않는다
- **AND** 새 `ProfileFollow` 관계와 Follow 성공 응답은 유지한다

#### Scenario: policy 평가 오류

- **WHEN** eligibility 평가가 오류로 끝난다
- **THEN** 시스템은 privacy-safe한 fail-closed 결과로 Notification을 생성하지 않는다
- **AND** 새 `ProfileFollow` 관계와 Follow 성공 응답은 유지한다

#### Scenario: Notification 저장 실패

- **WHEN** eligibility가 allow이지만 Notification 저장이 실패한다
- **THEN** 시스템은 새 `ProfileFollow` 관계와 Follow 성공 응답을 유지한다
- **AND** 이번 capability는 누락된 Notification을 retry, outbox, message queue, duplicate Follow 또는 reconciliation으로 자동 복구하지 않는다

#### Scenario: commit 이후 같은 request에서 처리

- **WHEN** 새 `ProfileFollow` transaction이 commit된다
- **THEN** source action은 같은 request에서 eligibility와 Notification 저장을 순서대로 await하고 오류를 catch한다
- **AND** Notification을 source transaction/savepoint에 포함하거나 fire-and-forget으로 실행하지 않는다

### Requirement: Follow source 생명주기 정리

시스템은 정상 `ProfileFollow` 삭제 action에서 같은 source의 Follow Notification을 idempotent하게 정리해야 한다(MUST).

#### Scenario: Unfollow로 source 삭제

- **WHEN** Unfollow가 `ProfileFollow` source transaction을 commit한다
- **THEN** source action은 같은 request에서 `(FOLLOW, source_id)` delete 경계를 await한다
- **AND** cleanup이 성공하면 대응하는 Notification은 목록, Unread count, Node와 Read에서 사라진다

#### Scenario: 반복 cleanup

- **WHEN** 이미 삭제된 `(FOLLOW, source_id)` item을 delete 경계에 다시 전달한다
- **THEN** 저장 경계는 성공한 idempotent no-op을 반환한다

#### Scenario: Notification cleanup 실패

- **WHEN** source 삭제 뒤 Notification delete가 실패하거나 process가 종료된다
- **THEN** `ProfileFollow` 삭제와 Unfollow 성공 응답은 유지된다
- **AND** 남은 row는 source를 찾을 수 없으므로 모든 Notification API 표면에서 숨겨진다

#### Scenario: action 밖에서 source row 삭제

- **WHEN** raw SQL 또는 Notification integration을 호출하지 않는 lifecycle이 `ProfileFollow` source를 삭제한다
- **THEN** loose `source_id`를 가진 Notification row가 남을 수 있다
- **AND** API는 그 row를 숨기며 database trigger나 source foreign key가 정리를 대신하지 않는다

### Requirement: Membership 기반 Profile Notification GraphQL 계약

API는 로그인 Account가 Account-Profile membership을 가진 Profile의 Notification connection과 Unread count를 Profile object에 제공해야 한다(MUST).

#### Scenario: Notification GraphQL shape

- **WHEN** GraphQL schema를 생성한다
- **THEN** `Notification implements Node` interface는 `id`, `createdAt`, nullable `readAt`을 제공한다
- **AND** `FollowNotification implements Notification & Node` concrete object는 non-null `profile`을 제공한다
- **AND** `notification.kind = FOLLOW`인 row는 `FollowNotification`으로 resolve된다
- **AND** 각 concrete Notification object는 자신의 concrete typename과 notification DB UUID를 opaque global ID로 반환한다
- **AND** `Profile.notifications`는 `NotificationConnection`을, `Profile.unreadNotificationCount`는 음수가 아닌 정수를 반환한다
- **AND** API는 public `NotificationType` enum, 공통 `type` field, raw `kind`, `source_id`, `data`나 과거 이름·handle snapshot을 노출하지 않는다
- **AND** 클라이언트는 `... on FollowNotification` inline fragment로 Follow 전용 field를 선택한다

#### Scenario: Concrete global ID Notification Node 조회

- **WHEN** 클라이언트가 visible FollowNotification global ID를 `node(id:)`에 제공한다
- **THEN** API는 global ID의 concrete typename으로 FollowNotification loader를 선택하고 DB UUID로 row를 batch load한다
- **AND** membership과 visible predicate를 적용한 뒤 `kind = FOLLOW` row를 `FollowNotification` concrete object로 반환한다
- **AND** 지원하지 않는 kind, membership이 없는 Recipient 또는 hidden row는 다른 concrete type이나 generic Notification으로 잘못 route하지 않고 `null`을 반환한다

#### Scenario: membership이 있는 Profile inbox 조회

- **WHEN** 로그인 Account가 target Profile에 Account-Profile membership을 가지고 `notifications`와 `unreadNotificationCount`를 조회한다
- **THEN** API는 membership role을 판정에 사용하지 않고 해당 Profile이 Recipient인 visible item과 count를 반환한다

#### Scenario: selected Profile과 다른 target 조회

- **WHEN** target Profile이 session의 selected Profile과 다르거나 session에 selected Profile이 없지만 요청 Account가 target membership을 가진다
- **THEN** API는 target Profile의 Notification field 조회를 허용한다

#### Scenario: 인증되지 않은 Profile field 조회

- **WHEN** 인증되지 않은 요청이 Profile-scoped Notification field에 접근한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

#### Scenario: membership이 없는 Profile field 조회

- **WHEN** 로그인 Account가 target Profile membership 없이 `notifications` 또는 `unreadNotificationCount`를 조회한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다
- **AND** 그 Profile의 Notification이나 count를 노출하지 않는다

#### Scenario: Notification Node 조회

- **WHEN** 요청이 `node(id:)`로 없는 Notification, membership이 없는 Recipient의 item 또는 hidden item을 조회한다
- **THEN** recipient-filtered Node loader는 모두 `null`을 반환한다

#### Scenario: inactive Recipient의 Notification Node

- **WHEN** Notification의 Recipient Profile이 비활성 등으로 GraphQL Profile object에 노출되지 않는다
- **THEN** Notification Node loader는 해당 item을 `null`로 반환한다
- **AND** `markNotificationRead`는 같은 item ID에 `NOT_FOUND`를 반환한다

### Requirement: Visible ID-ordered Notification pagination

API는 source가 저장 Recipient와 일치하고 Related Profile을 조회할 수 있는 Notification만 DB UUID ID 순서의 stable Relay connection에 포함해야 한다(MUST). 기존 UUIDv8과 신규 UUIDv7은 함께 조회되며 같은 millisecond에 생성된 item 사이의 생성 순서와 concurrent insert snapshot은 보장하지 않는다.

#### Scenario: 첫 페이지 정렬과 filtering

- **WHEN** 클라이언트가 권한이 있는 Profile의 Notification 첫 페이지를 요청한다
- **THEN** API는 Recipient Profile 자체의 API visibility, source 존재, source Followee와 저장 Recipient의 일치, Recipient Profile 기준 Related Profile visibility를 SQL에서 적용한 뒤 page limit을 적용한다
- **AND** visible item을 `Notification.id DESC` 순서로 반환한다
- **AND** opaque cursor는 마지막 visible item ID를 기준으로 다음 경계를 표현한다

#### Scenario: 다음 페이지 조회

- **WHEN** 클라이언트가 이전 페이지의 end cursor로 다음 페이지를 요청한다
- **THEN** API는 cursor보다 작은 visible ID만 반환한다
- **AND** hidden item 때문에 page가 불필요하게 짧아지거나 page 경계에서 visible item을 중복·누락하지 않는다

#### Scenario: 같은 millisecond의 임의 순서

- **WHEN** 둘 이상의 visible Notification ID가 같은 millisecond timestamp prefix를 가진다
- **THEN** API는 UUID random tail을 포함한 `id DESC` 총순서를 그대로 사용한다
- **AND** API는 그 item들의 실제 생성 순서가 ID 순서와 같다고 보장하지 않는다

#### Scenario: 같은 millisecond에 새 item 도착 뒤 pagination

- **WHEN** 첫 페이지 조회 뒤 같은 millisecond timestamp prefix를 가진 새 Notification이 생성되고 클라이언트가 기존 cursor를 사용한다
- **THEN** 새 item은 UUID random tail에 따라 기존 cursor의 앞 또는 뒤에 위치할 수 있다
- **AND** API는 새 item이 반드시 refresh의 첫 page에만 나타나거나 기존 cursor의 다음 page에서 제외된다고 보장하지 않는다

#### Scenario: Related Profile visibility viewer

- **WHEN** API가 FOLLOW item의 Related Profile visibility를 평가한다
- **THEN** viewer는 요청 Account나 selected Profile이 아니라 item의 Recipient Profile이다

### Requirement: Idempotent Notification Read와 visible Unread count

API는 권한이 있는 Recipient Profile의 visible Notification 하나를 Read로 전환하고 같은 Profile 범위의 visible Unread count를 일관되게 갱신해야 한다(MUST).

#### Scenario: 최초 Read

- **WHEN** membership이 있는 Account가 `markNotificationRead(input: { id })`로 `readAt = null`인 visible item을 읽는다
- **THEN** API는 `readAt`에 최초 Read 시각을 한 번 기록한다
- **AND** Recipient Profile의 visible `unreadNotificationCount`는 한 번 감소한다
- **AND** `MarkNotificationReadPayload`는 갱신된 `notification`과 `recipientProfile`을 반환한다

#### Scenario: 반복 Read

- **WHEN** 같은 Account가 이미 Read인 같은 visible item ID로 `markNotificationRead`를 다시 호출한다
- **THEN** API는 성공한 idempotent 결과를 반환한다
- **AND** 최초 `readAt`과 Unread count를 변경하지 않는다

#### Scenario: 동시 Read

- **WHEN** 같은 Unread item에 둘 이상의 Read 요청이 동시에 도착한다
- **THEN** 시스템은 하나의 Unread-to-Read 전이만 반영한다
- **AND** 모든 성공 응답은 보존된 최초 `readAt`과 일관된 visible Unread count를 관찰한다

#### Scenario: membership이 없는 item Read

- **WHEN** 로그인 Account가 Recipient Profile membership이 없는 item ID를 읽으려 한다
- **THEN** API는 존재하지 않는 ID와 구별되지 않는 `NOT_FOUND` GraphQL 오류를 반환한다
- **AND** item과 count는 변경되지 않는다

#### Scenario: 인증되지 않은 Read

- **WHEN** 인증되지 않은 요청이 `markNotificationRead`를 호출한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

#### Scenario: visible count 계산

- **WHEN** API가 `unreadNotificationCount`를 계산한다
- **THEN** Recipient Profile 자체가 API에 visible하고 source가 존재하며 source Followee가 저장 Recipient와 일치하고 Related Profile visible predicate와 `read_at IS NULL`을 만족하는 Recipient item만 센다
- **AND** connection에서 숨긴 item을 count에 포함하지 않는다

### Requirement: Unavailable Notification 숨김

시스템은 Recipient Profile 자체가 API에 노출되지 않거나 source가 없거나 source Recipient가 저장 Recipient와 일치하지 않거나 Recipient Profile 기준으로 Related Profile을 조회할 수 없는 Notification을 모든 API 표면에서 존재하지 않는 것으로 취급해야 한다(MUST).

#### Scenario: unavailable item connection과 count

- **WHEN** Recipient Profile 자체가 API에 노출되지 않거나 기존 Follow Notification의 source가 없거나 source Followee가 저장 Recipient와 다르거나 Follower Profile을 Recipient가 조회할 수 없다
- **THEN** API는 item을 connection에서 제외하고 Unread여도 `unreadNotificationCount`에 포함하지 않는다
- **AND** filtering은 page limit 전에 SQL에서 적용된다

#### Scenario: unavailable item Node와 Read

- **WHEN** 요청이 unavailable item ID를 Node 또는 `markNotificationRead`에 전달한다
- **THEN** Node는 `null`을 반환하고 Read는 `NOT_FOUND`를 반환한다
- **AND** 저장된 `readAt`은 변경되지 않는다

#### Scenario: cleanup 전 저장 상태

- **WHEN** unavailable item의 비동기 cleanup이 아직 실행되지 않았다
- **THEN** database row와 기존 Read 상태는 남을 수 있다
- **AND** cleanup 전에 visibility가 회복되면 item은 기존 Read 상태로 다시 visible해질 수 있다

#### Scenario: generic fallback 금지

- **WHEN** item이 unavailable이다
- **THEN** API와 client는 `profile: null` Follow item, 이름·handle snapshot 또는 type-only generic item을 반환·표시하지 않는다
- **AND** client는 서버가 반환한 page나 count를 unavailable 기준으로 다시 필터링하지 않는다

#### Scenario: 후속 비동기 삭제 경계

- **WHEN** source가 없거나 Recipient와 일치하지 않거나 Related Profile이 Recipient 기준으로 unavailable인 item의 장기 물리 정리를 설계한다
- **THEN** 원인별 event, queue 또는 scan, worker, retry와 허용 지연은 별도 `PROD-328` OpenSpec이 소유한다
- **AND** Recipient Profile 자체의 일시 비활성화·정지가 물리 삭제 원인인지도 `PROD-328`이 결정한다
- **AND** 이번 capability의 구현 task와 archive gate에는 포함하지 않는다

### Requirement: Selected Profile Follow Notification 목록 UI

클라이언트는 selected Profile의 visible Follow Notification을 모바일과 Web에서 같은 단일 목록으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST).

#### Scenario: 단일 Follow item 표시와 Profile link

- **WHEN** selected Profile의 connection이 Related Profile 한 명을 가진 visible Follow Notification을 반환한다
- **THEN** 목록은 Figma Like 알림 행의 왼쪽 kind icon과 오른쪽 콘텐츠 column 위계로 initials Avatar 하나, `OOO님이 팔로우했습니다` 문구와 상대 시각을 표시한다
- **AND** Avatar와 본문은 `Profile.relativeHandle`의 Profile route를 가리키는 link다
- **AND** inline 맞팔로우, 빈 action 영역, snippet, image avatar와 복수 사용자 aggregation을 만들지 않는다

#### Scenario: 알림 화면 header와 단일 목록

- **WHEN** 사용자가 `/notifications` 화면을 연다
- **THEN** 화면은 `알림` 제목과 최소 44px의 `알림 설정 (준비 중)` disabled control을 표시한다
- **AND** 설정 route가 추가되기 전에는 control이 navigation이나 임시 안내 action을 실행하지 않는다
- **AND** `모두`·`멘션` 탭, 단독 `모두` section heading과 날짜별 heading을 표시하지 않는다

#### Scenario: Read와 Unread 표시

- **WHEN** Follow item의 `readAt`이 `null`이다
- **THEN** item은 `surface` 배경과 접근성 Unread 상태를 제공한다
- **AND** `readAt`이 존재하면 `card` 배경을 사용하고 Unread 상태를 제공하지 않는다

#### Scenario: Profile 이동과 Read side effect 분리

- **WHEN** 사용자가 Follow item의 Avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 Related Profile navigation을 즉시 시작한다
- **AND** Read mutation의 pending, 실패 또는 재시도는 navigation을 지연, 취소 또는 되돌리지 않는다
- **AND** client Read mutation과 Unread count cache 갱신은 `PROD-372`가 소유한다

#### Scenario: Initial loading, error와 empty

- **WHEN** selected Profile 목록의 첫 query가 진행 중이거나 실패하거나 visible edge 없이 성공한다
- **THEN** 화면은 각 상태에 맞는 loading, 안전한 한국어 error와 retry, empty UI를 구분해 표시한다
- **AND** backend error 원문이나 unavailable generic fallback을 표시하지 않는다

#### Scenario: Native refresh와 다음 page

- **WHEN** 사용자가 native pull-to-refresh를 실행한다
- **THEN** 클라이언트는 selected Profile query를 다시 가져온다
- **AND** Web은 별도 in-app refresh control을 표시하지 않고 browser의 표준 document reload를 사용한다
- **AND** 다음 page는 20개 단위 Relay connection으로 요청하고 요청 중 중복 호출을 막는다
- **AND** 다음 page가 실패하면 기존 item을 유지하고 같은 위치에서 재시도할 수 있다
- **AND** route state가 edge를 수동 병합하거나 client-side filtering하지 않는다

#### Scenario: selected Profile 전환

- **WHEN** 사용자가 Recipient Profile A에서 B로 selected Profile을 전환한다
- **THEN** actor별 Relay Environment와 Store가 바뀌고 목록은 Profile B를 target으로 다시 조회한다
- **AND** Profile A의 edge, loading, error 또는 pagination 상태를 Profile B 목록에 재사용하지 않는다

### Requirement: Local Follow vertical verification

시스템은 실제 Local Follow action부터 Notification, API, 목록 UI, badge, Read와 정상 source cleanup까지의 Profile 격리를 Web E2E로 검증해야 한다(MUST).

#### Scenario: Recipient Profile A와 B 격리

- **WHEN** Local Follower가 Recipient Account의 Profile A를 실제 Follow action으로 팔로우하고 Recipient가 Profile B와 A를 차례로 선택한다
- **THEN** Profile B의 UI에는 A의 Notification이나 Unread count가 노출되지 않는다
- **AND** Profile A에서는 Follower를 가리키는 Unread item과 count가 보인다
- **AND** API authorization은 Account가 가진 membership을 사용하되 UI query와 Relay cache는 selected Profile A/B를 섞지 않는다
- **AND** `PROD-277`·`PROD-324`가 구현 전에 추가한 목록·Read·navigation·badge 요구사항을 같은 item으로 검증한다

#### Scenario: Follow item Read와 이동

- **WHEN** Recipient가 visible Follow item을 활성화한다
- **THEN** Related Profile 이동은 즉시 시작되고 Read pending·실패·재시도에 의해 지연, 취소 또는 되돌려지지 않는다
- **AND** PROD-372의 Read 동작이 성공하면 item은 최초 Read로 전환되고 PROD-324의 badge는 한 번 감소한다
- **AND** 같은 item을 다시 읽어도 최초 `readAt`과 count가 유지된다

#### Scenario: Unfollow cleanup

- **WHEN** Follower가 정상 Unfollow action으로 source를 삭제하고 Notification cleanup이 성공한다
- **THEN** 같은 source item은 Recipient의 목록, count, Node와 Read에서 더 이상 보이지 않는다
