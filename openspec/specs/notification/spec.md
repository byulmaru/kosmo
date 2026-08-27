# notification Specification

## Purpose

Profile-scoped in-app Notification의 생성과 정리, GraphQL 조회와 Read, visible pagination과 Unread count, selected Profile 목록 UI 계약을 문서화한다.

## Requirements

### Requirement: Membership 기반 Profile Notification GraphQL 계약

**Authority / Provenance:** `docs/domain/objects/notification.md`, [PROD-703](https://linear.app/byulmaru/issue/PROD-703/%EA%B8%B0%EC%A1%B4-notification-read-mutation%EC%9D%B4-%EC%A7%80%EC%A0%95%ED%95%9C-%EC%95%8C%EB%A6%BC-%EC%97%AC%EB%9F%AC-%EA%B0%9C%EB%A5%BC-%EC%B2%98%EB%A6%AC%ED%95%98%EB%8F%84%EB%A1%9D-%ED%99%95%EC%9E%A5%ED%95%9C%EB%8B%A4) — PROD-703은 inactive Recipient 지정 ID Read의 조용한 제외 계약을 소유한다. API는 로그인 Account가 Account-Profile membership을 가진 Profile의 Notification connection과 Unread count를 Profile object에 제공해야 한다(MUST).

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
- **AND** `markNotificationRead(input: { ids })`는 같은 item ID를 조용히 제외하며 그 ID의 존재나 제외 이유를 노출하지 않는다

### Requirement: Visible ID-ordered Notification pagination

API는 kind별 source가 존재하고 source에서 파생한 Recipient가 저장 Recipient와 일치하며, 해당 kind에 필요한 Related Profile과 Related Post를 Recipient Profile 기준으로 조회할 수 있는 Notification만 DB UUID ID 순서의 stable Relay connection에 포함해야 한다(MUST). 기존 UUIDv8과 신규 UUIDv7은 함께 조회되며 같은 millisecond에 생성된 item 사이의 생성 순서와 concurrent insert snapshot은 보장하지 않는다.

#### Scenario: 첫 페이지 정렬과 filtering

- **WHEN** 클라이언트가 권한이 있는 Profile의 Notification 첫 페이지를 요청한다
- **THEN** API는 Recipient Profile 자체의 API visibility, kind별 source 존재와 source-Recipient 관계의 일치, 해당 kind에 필요한 Related Profile과 Related Post의 Recipient 기준 visibility를 SQL에서 적용한 뒤 page limit을 적용한다
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

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-703` — API는 로그인 Account가 지정한 0개 이상의 Notification ID 중 권한이 있는 Recipient Profile의 visible Notification만 멱등적으로 Read로 전환하고, 성공 payload에서 처리 대상 Notification과 영향받은 Recipient Profile의 visible Unread count를 일관되게 반환해야 한다(MUST).

#### Scenario: 지정한 여러 Notification 최초 Read

- **WHEN** membership이 있는 Account가 `markNotificationRead(input: { ids })`로 `readAt = null`인 visible item A와 B의 ID를 전달한다
- **THEN** API는 A와 B의 `readAt`에 최초 Read 시각을 한 번 기록한다
- **AND** 각 Recipient Profile의 visible `unreadNotificationCount`는 실제 전이 결과와 일치한다
- **AND** `MarkNotificationReadPayload.notifications`는 처리 대상 A와 B를, `recipientProfiles`는 영향받은 Profile을 중복 없이 반환한다

#### Scenario: 반복 Read와 중복 입력

- **WHEN** 같은 Account가 같은 visible item ID를 한 입력에 중복해 전달하거나 이미 Read인 visible item ID로 `markNotificationRead`를 다시 호출한다
- **THEN** API는 각 visible item을 결과에 한 번만 포함한 성공한 idempotent 결과를 반환한다
- **AND** 최초 `readAt`과 Unread count를 변경하지 않는다

#### Scenario: 동시 Read

- **WHEN** 같은 Unread item ID를 포함한 둘 이상의 Read 요청이 동시에 도착한다
- **THEN** 시스템은 하나의 Unread-to-Read 전이만 반영한다
- **AND** 모든 성공 응답은 보존된 최초 `readAt`과 일관된 visible Unread count를 관찰한다

#### Scenario: 처리할 수 없는 입력 ID 제외

- **WHEN** 로그인 Account가 존재하지 않거나 Notification이 아니거나 Recipient Profile membership이 없거나 현재 hidden인 ID를 visible Notification ID와 함께 전달한다
- **THEN** API는 처리할 수 없는 ID를 조용히 제외하고 visible Notification만 Read 처리한다
- **AND** payload와 GraphQL error는 제외한 ID의 존재 여부나 제외 이유를 노출하지 않는다
- **AND** 제외한 Notification의 `readAt`과 count는 변경되지 않는다

#### Scenario: 빈 입력과 모든 ID 제외

- **WHEN** 로그인 Account가 빈 `ids`를 전달하거나 모든 입력 ID가 처리 대상에서 제외된다
- **THEN** API는 성공한 no-op으로 빈 `notifications`와 빈 `recipientProfiles`를 반환한다
- **AND** Notification과 Unread count를 변경하지 않는다

#### Scenario: 입력하지 않은 Notification 보존

- **WHEN** 요청에 포함되지 않은 unread Notification이 이미 존재하거나 요청 처리 중 새로 생성된다
- **THEN** API는 해당 Notification을 Read 처리하지 않는다
- **AND** 서버는 입력 ID를 요청 시점의 전체 visible unread 집합으로 확장하지 않는다

#### Scenario: 여러 Recipient Profile 결과

- **WHEN** Account가 membership을 가진 둘 이상의 Recipient Profile에 속한 visible Notification ID를 한 요청에 명시적으로 전달한다
- **THEN** API는 각 visible Notification을 처리하고 영향받은 `recipientProfiles`를 Profile별 한 번씩 반환한다
- **AND** 각 Profile의 `unreadNotificationCount`는 그 Profile의 서버 상태와 일치한다

#### Scenario: 인증되지 않은 Read

- **WHEN** 인증되지 않은 요청이 `markNotificationRead`를 호출한다
- **THEN** API는 `PERMISSION_DENIED` GraphQL 오류를 반환한다

#### Scenario: Read 처리 실패의 원자성

- **WHEN** 지정 Notification을 Read로 전환하는 database 처리가 실패한다
- **THEN** API는 오류를 반환하고 입력 목록의 일부 Notification만 변경된 상태를 남기지 않는다

#### Scenario: visible count 계산

- **WHEN** API가 `unreadNotificationCount`를 계산한다
- **THEN** Recipient Profile 자체가 API에 visible하고 kind별 source가 존재하며 source에서 파생한 Recipient가 저장 Recipient와 일치하고, 해당 kind에 필요한 Related Profile과 Related Post의 Recipient 기준 visible predicate와 `read_at IS NULL`을 만족하는 item만 센다
- **AND** connection에서 숨긴 item을 count에 포함하지 않는다

### Requirement: Unavailable Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-703` — 시스템은 Recipient Profile 자체가 API에 노출되지 않거나 kind별 source가 없거나 source에서 파생한 Recipient가 저장 Recipient와 일치하지 않거나, 해당 kind에 필요한 Related Profile 또는 Related Post를 Recipient Profile 기준으로 조회할 수 없는 Notification을 모든 API 표면에서 존재하지 않는 것으로 취급해야 한다(MUST).

#### Scenario: unavailable item connection과 count

- **WHEN** Recipient Profile 자체가 API에 노출되지 않거나 기존 Follow Notification의 source가 없거나 source Followee가 저장 Recipient와 다르거나 Follower Profile을 Recipient가 조회할 수 없다
- **THEN** API는 item을 connection에서 제외하고 Unread여도 `unreadNotificationCount`에 포함하지 않는다
- **AND** filtering은 page limit 전에 SQL에서 적용된다

#### Scenario: unavailable item Node와 Read

- **WHEN** 요청이 unavailable item ID를 Node 또는 `markNotificationRead(input: { ids })`에 전달한다
- **THEN** Node는 `null`을 반환하고 Read mutation은 해당 ID를 결과에서 조용히 제외한다
- **AND** 저장된 `readAt`은 변경되지 않으며 Read 응답은 item의 존재나 제외 이유를 노출하지 않는다

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

**Authority / Provenance:** `docs/design/accessibility.md`, `docs/design/breakpoints.md`, `docs/design/colors.md`, `PROD-277`, `PROD-372`, `PROD-541`, `PROD-680`, `PROD-703` — 클라이언트는 selected Profile의 visible Follow Notification을 모바일과 Web에서 같은 단일 목록으로 제공하고 Relay connection과 actor cache를 Profile별로 격리해야 한다(MUST).

#### Scenario: 단일 Follow item 표시와 Profile link

- **WHEN** selected Profile의 connection이 Related Profile 한 명을 가진 visible Follow Notification을 반환한다
- **THEN** 목록은 Figma Like 알림 행처럼 왼쪽 28px kind icon과 오른쪽 콘텐츠 column을 같은 상단선에 두고, 콘텐츠 첫 Avatar row에 28px initials Avatar와 상대 시각을 배치한 뒤 `OOO님이 팔로우했습니다` 문구를 그 아래에 표시한다
- **AND** Avatar와 본문은 `Profile.relativeHandle`의 Profile route를 가리키는 link다
- **AND** inline 맞팔로우, 빈 action 영역, snippet, image avatar와 복수 사용자 aggregation을 만들지 않는다

#### Scenario: 알림 화면 header와 단일 목록

- **WHEN** 사용자가 `/notifications` 화면을 연다
- **THEN** 화면은 `알림` 제목을 표시하고 설정 진입 control을 시각적으로 표시하지 않는다
- **AND** `알림 설정 (준비 중)` 또는 같은 의미의 설정 진입 control을 접근성 트리에 button이나 다른 interactive element로 노출하지 않는다
- **AND** 설정 control 없이도 mobile과 Web에서 제목의 정렬과 header 간격을 유지한다
- **AND** `모두`·`멘션` 탭, 단독 `모두` section heading과 날짜별 heading을 표시하지 않는다

#### Scenario: Read와 Unread 표시

- **WHEN** Follow item의 `readAt`이 `null`이다
- **THEN** Web item은 토큰 기반의 분명한 좌측 상태선, 은은한 배경과 접근성 Unread 상태를 제공한다
- **AND** `readAt`이 존재하면 Web item은 Unread 좌측 상태선·배경 강조·접근성 Unread 상태를 제공하지 않는다
- **AND** Web pointer hover 중에는 기존 `surface` 배경을 사용하며 Unread item의 좌측 상태선은 유지한다
- **AND** hover가 없는 native 화면은 Read 상태와 관계없이 `card` 기본 배경을 유지한다

#### Scenario: Profile 이동과 Read side effect 분리

- **WHEN** 사용자가 Follow item의 Avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 Related Profile navigation을 즉시 시작한다
- **AND** Read mutation의 pending, 실패 또는 재시도는 navigation을 지연, 취소 또는 되돌리지 않는다
- **AND** client Read mutation과 Unread count cache 갱신은 `PROD-372`가 소유한다

#### Scenario: 성공 payload 기반 item과 Recipient count 동기화

- **WHEN** Avatar 또는 본문 link activation에서 `{ ids: [id] }`로 시작한 Read mutation이 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** 클라이언트는 payload가 반환한 ID를 기준으로 item의 `readAt`과 정확한 Recipient Profile의 `unreadNotificationCount`를 Relay cache에 정규화한다
- **AND** 성공한 `readAt` 정규화로 item의 Unread 시각·접근성 상태를 제거하고 count가 0이면 기존 전역 알림 인디케이터도 제거한다
- **AND** 현재 selected Profile을 cache target으로 다시 추론하거나 client-side count 산술, optimistic update와 성공 뒤 추가 refetch를 수행하지 않는다
- **AND** 같은 Unread item에 대한 반복 activation 또는 동시 Read의 성공 payload는 서버가 보존한 동일 `readAt`과 일관된 visible Unread count를 반환하며, 어떤 순서로 적용되어도 같은 item/Recipient record로 수렴하고 다른 Profile cache를 변경하지 않는다

#### Scenario: client Read 실패와 수렴

- **WHEN** navigation과 독립적으로 시작한 Read mutation이 pending이거나 실패한다
- **THEN** 클라이언트는 navigation을 유지하고 item 또는 count cache를 보정하지 않는다
- **AND** cached `readAt = null`인 동안 item의 Unread 시각·접근성 상태를 유지한다
- **AND** 앱 수준 자동 retry나 오류 UI를 추가하지 않으며 이후 activation 또는 refetch에서 서버 source of truth로 수렴한다

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
- **AND** `PROD-277`·`PROD-372`·`PROD-324`가 추가한 목록·Read·navigation·badge 요구사항을 같은 item으로 검증한다

#### Scenario: Follow item Read와 이동

- **WHEN** Recipient가 visible Follow item을 활성화한다
- **THEN** Related Profile 이동은 즉시 시작되고 Read pending·실패·재시도에 의해 지연, 취소 또는 되돌려지지 않는다
- **AND** PROD-372의 Read 동작이 성공하면 item은 최초 Read로 전환되고 PROD-324의 badge는 한 번 감소한다
- **AND** 같은 item을 다시 읽어도 최초 `readAt`과 count가 유지된다

#### Scenario: Unfollow cleanup

- **WHEN** Follower가 정상 Unfollow action으로 source를 삭제하고 Notification cleanup이 성공한다
- **THEN** 같은 source item은 Recipient의 목록, count, Node와 Read에서 더 이상 보이지 않는다

### Requirement: ActivityPub Follow Notification integration verification

시스템은 기존 production Fedify listener와 concrete Follow/Undo handler가 공통 core lifecycle을 통해 Notification 저장·정리에 도달하는 흐름을 검증해야 한다(MUST).

#### Scenario: production inbound integration path

- **WHEN** production federation listener가 verified inbound Follow 또는 Undo(Follow)를 concrete handler에 dispatch한다
- **THEN** integration은 concrete handler → 공통 core public action → relation/request/count transaction → commit 이후 Notification effect의 실제 production wiring을 통과한다
- **AND** OPEN 신규 relation과 Notification 하나, APPROVAL_REQUIRED pending-only, duplicate/concurrent no-op, established Undo cleanup, pending/no-op Undo 제외를 검증한다
- **AND** Notification create/delete 실패가 ActivityPub 처리 성공과 source transaction을 rollback하지 않는지 검증한다

### Requirement: Reaction Notification source correlation

**Authority / Provenance:** [Notification canonical 객체](../../../docs/domain/objects/notification.md), [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4) 시스템은 다른 Profile의 Local Post에 새 Reaction이 생성되면 Reaction을 source로 하는 Profile-scoped Notification을 Best Effort로 생성해야 한다(MUST).

#### Scenario: 다른 Profile의 Post Reaction

- **WHEN** Local Profile이 다른 Local Profile의 Post에 새 Reaction을 생성하고 source transaction이 commit된다
- **THEN** 시스템은 `kind = REACTION`, `source_id = Reaction.id`, Recipient를 Post Author Profile로 하는 Notification을 같은 request에서 await한다
- **AND** Related Profile은 Reaction Author Profile, Related Post는 Reaction Target Post, 표시 Type은 source의 Reaction Type에서 파생한다
- **AND** kind별 `data`에는 source에서 파생할 수 있는 Profile, Post, Type snapshot을 저장하지 않는다

#### Scenario: 자기 Post Reaction

- **WHEN** Post Author Profile이 자신의 Post에 Reaction을 생성한다
- **THEN** 시스템은 Reaction 생성 결과를 유지한다
- **AND** Reaction Notification을 생성하지 않는다

#### Scenario: Remote Recipient

- **WHEN** Reaction Target Post의 Author가 Remote Profile이다
- **THEN** 시스템은 Local inbox Notification을 생성하지 않는다

#### Scenario: 동일 Reaction source 재처리

- **WHEN** 같은 Reaction source의 Notification 저장 경계가 둘 이상 호출된다
- **THEN** `(recipient_profile_id, REACTION, source_id)` Notification은 하나만 존재한다
- **AND** 반복 호출은 기존 item을 나타내는 성공 또는 동등한 idempotent no-op으로 끝난다

### Requirement: Reaction Notification 실패 격리

**Authority / Provenance:** [Notification canonical 객체](../../../docs/domain/objects/notification.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4) Reaction Notification 생성 실패는 Reaction 생성 transaction이나 성공 결과를 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Notification 저장 실패

- **WHEN** 새 Reaction commit 뒤 Notification 저장이 실패한다
- **THEN** 시스템은 Reaction과 Reaction 추가 성공 결과를 유지한다
- **AND** 이번 capability는 누락 item을 retry, outbox, queue 또는 backfill로 자동 복구하지 않는다

### Requirement: Reaction Notification GraphQL과 inbox 계약

**Authority / Provenance:** [Notification canonical 객체](../../../docs/domain/objects/notification.md), [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-372](https://linear.app/byulmaru/issue/PROD-372/%EC%95%8C%EB%A6%BC-%ED%95%AD%EB%AA%A9-%EC%9D%BD%EC%9D%8C-%EC%83%81%ED%83%9C%EB%A5%BC-best-effort%EB%A1%9C-%EB%8F%99%EA%B8%B0%ED%99%94%ED%95%9C%EB%8B%A4) API와 클라이언트는 visible Reaction Notification을 기존 Notification interface·connection·Unread count·Read 계약에 통합해야 한다(MUST).

#### Scenario: Reaction Notification concrete object

- **WHEN** GraphQL schema가 `kind = REACTION` Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete Reaction Notification object로 resolve한다
- **AND** object는 source에서 파생한 Reaction Author Profile, Target Post와 Reaction Type을 제공한다
- **AND** raw `kind`, `source_id`, 범용 `data` 또는 generic fallback을 노출하지 않는다

#### Scenario: Recipient inbox 표시와 이동

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Reaction Notification은 기존 connection 정렬과 pagination, Unread count와 Read 계약을 따른다
- **AND** client item은 Reaction Author, Type과 Target Post를 표시하고 해당 Post로 이동할 수 있다
- **AND** item 활성화는 Read 응답을 기다리지 않고 Target Post 이동을 즉시 시작한다
- **AND** Read 요청의 pending·실패·재시도는 이동을 지연·취소·복원하지 않는다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 한 Recipient Profile의 inbox를 조회·읽는다
- **THEN** 시스템은 target Recipient Profile 범위의 Reaction Notification과 count만 반환·갱신한다

### Requirement: unavailable Reaction Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, [PROD-413](https://linear.app/byulmaru/issue/PROD-413/reaction-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-703](https://linear.app/byulmaru/issue/PROD-703/%EA%B8%B0%EC%A1%B4-notification-read-mutation%EC%9D%B4-%EC%A7%80%EC%A0%95%ED%95%9C-%EC%95%8C%EB%A6%BC-%EC%97%AC%EB%9F%AC-%EA%B0%9C%EB%A5%BC-%EC%B2%98%EB%A6%AC%ED%95%98%EB%8F%84%EB%A1%9D-%ED%99%95%EC%9E%A5%ED%95%9C%EB%8B%A4) — PROD-413은 Reaction Notification 숨김을, PROD-703은 지정 ID Read의 조용한 제외 계약을 소유한다. 시스템은 Reaction source가 없거나 source의 Post·Author·Recipient 관계가 저장 Recipient와 일치하지 않거나 Recipient 기준 Related Profile 또는 Target Post를 조회할 수 없는 Reaction Notification을 모든 API 표면에서 숨겨야 한다(MUST).

#### Scenario: source가 없는 item

- **WHEN** Reaction source가 제거됐지만 Notification row가 남아 있다
- **THEN** API는 item을 connection과 Unread count에서 제외한다
- **AND** Node는 `null`을 반환하고 `markNotificationRead(input: { ids })`는 해당 ID를 조용히 제외한다

#### Scenario: source 관계가 일치하지 않는 item

- **WHEN** source의 Target Post Author가 저장 Recipient와 다르거나 source Author·Post가 Recipient 기준으로 unavailable하다
- **THEN** API는 page limit 전에 item을 filtering한다
- **AND** generic Reaction Notification이나 snapshot으로 대신 노출하지 않는다

### Requirement: Reaction 제거 뒤 Best Effort Notification 정리

**Authority / Provenance:** [Notification canonical 객체](../../../docs/domain/objects/notification.md), [Reaction canonical 객체](../../../docs/domain/objects/reaction.md), [ADR 0010](../../../docs/domain/decisions/0010-post-interaction-contracts.md), [PROD-419](https://linear.app/byulmaru/issue/PROD-419/reaction-notification%EC%9D%84-%EC%A0%95%EB%A6%AC%ED%95%9C%EB%8B%A4), [PROD-472](https://linear.app/byulmaru/issue/PROD-472/reaction-selector%EC%9A%A9-%ED%98%84%EC%9E%AC-%EC%83%81%ED%83%9C-%EC%A1%B0%ED%9A%8C%EC%99%80-type-%EC%82%AD%EC%A0%9C-%EA%B3%84%EC%95%BD%EC%9D%84-%EB%B3%B4%EC%99%84%ED%95%9C%EB%8B%A4) 실제 Reaction 제거가 source transaction에서 commit되면 대응 Notification cleanup을 Best Effort로 시도해야 한다(MUST). 삭제 no-op은 cleanup을 시도해서는 안 되며(MUST NOT), 정리 시점과 성공은 Reaction 삭제 결과의 조건이어서는 안 된다(MUST NOT).

#### Scenario: Reaction 삭제 cleanup

- **WHEN** 실제 Reaction 제거가 commit된다
- **THEN** source action은 `(REACTION, source_id)` Notification delete 경계를 await한다
- **AND** cleanup 성공 뒤 item은 connection, Unread count, Node와 Read에서 사라진다

#### Scenario: 반복 cleanup

- **WHEN** 이미 제거된 Reaction source의 cleanup을 다시 호출한다
- **THEN** Notification delete 경계는 성공한 idempotent no-op을 반환한다

#### Scenario: cleanup 실패

- **WHEN** Reaction 삭제 뒤 Notification cleanup이 실패하거나 process가 종료된다
- **THEN** Reaction 삭제와 성공 응답은 유지된다
- **AND** cleanup 실패는 source Reaction을 식별할 수 있는 context와 함께 관측 가능하게 기록된다
- **AND** 남은 Notification row는 source가 없으므로 모든 API 표면에서 숨겨진다
- **AND** retry, cron, queue, backfill 또는 bulk cleanup은 이번 capability에 포함하지 않는다

### Requirement: Selected Profile Web Notification Unread 시각 상태

**Authority / Provenance:** `docs/design/colors.md`, `docs/design/accessibility.md`, `PROD-680`, `PROD-703` — 클라이언트는 selected Profile의 Web 알림 목록에서 visible Notification item의 Read와 Unread 상태를 시각·접근성 정보로 일관되게 구분해야 한다(MUST).

#### Scenario: Web Unread 기본 표시

- **WHEN** Web 알림 목록의 visible Notification item이 `readAt = null`이고 pointer hover 중이 아니다
- **THEN** item은 토큰 기반의 분명한 좌측 상태선과 은은한 배경으로 Unread임을 표시한다
- **AND** 기존 접근성 Unread 설명을 함께 제공해 상태를 색만으로 전달하지 않는다
- **AND** 텍스트, icon과 link는 배경 강조와 독립적으로 기존 가독성과 상호작용을 유지한다

#### Scenario: Web Read 기본 표시

- **WHEN** Web 알림 목록의 visible Notification item에 `readAt`이 존재하고 pointer hover 중이 아니다
- **THEN** item은 Unread 좌측 상태선과 배경 강조를 표시하지 않는다
- **AND** 접근성 Unread 설명을 제공하지 않는다
- **AND** Read와 Unread 전환 전후에 item 콘텐츠의 수평 정렬이 움직이지 않는다

#### Scenario: Web pointer hover

- **WHEN** pointer가 Web 알림 목록 item 위에 있다
- **THEN** item은 기존 `surface` hover 배경을 제공한다
- **AND** item이 Unread이면 좌측 상태선을 유지하고 Read이면 Unread 상태선을 표시하지 않는다

#### Scenario: activation Read 성공과 전역 인디케이터 수렴

- **WHEN** 사용자가 Unread item의 link를 활성화하고 `{ ids: [id] }` Read mutation이 갱신된 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** link navigation은 Read 응답과 독립적으로 즉시 진행된다
- **AND** Relay는 payload ID를 기준으로 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** item의 Unread 시각·접근성 상태가 제거되고 count가 0이면 기존 전역 알림 인디케이터도 사라진다

#### Scenario: activation Read pending 또는 실패

- **WHEN** 사용자가 Unread item의 link를 활성화했지만 Read mutation이 pending이거나 실패한다
- **THEN** link navigation은 유지된다
- **AND** client는 item과 count cache를 보정하지 않으며 cached `readAt = null`인 동안 Unread 시각·접근성 상태를 유지한다

### Requirement: Reply Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/architecture/core-services.md`, `PROD-426`, `PROD-507`, `PROD-722` — 시스템은 origin과 application entrypoint에 관계없이 다른 Profile의 Post에 새 Reply가 실제 생성되어 기존 Post transaction이 commit되면, Post ID 기반 effects Workflow 시작을 시도해야 한다(MUST). 시작이 수락된 경우 Worker가 Activity로 직접 등록한 Core service 함수는 process 기본 `db`로 결과 Reply를 다시 조회하고, 결과 Reply를 source로 하는 Profile-scoped Reply Notification을 공통 Post visibility와 기존 Notification 정책에 따라 직접 멱등 생성해야 한다(MUST). Reply Notification을 Post transaction 안의 Best Effort savepoint에서 직접 생성하거나 Worker pass-through wrapper에 위임해서는 안 된다(MUST NOT).

#### Scenario: 다른 Profile의 Post에 Reply

- **WHEN** 기존 Post transaction이 새 Reply를 commit하고 Reply Author와 Parent Author가 다르며 Recipient가 결과 Reply와 Reply Author를 조회할 수 있고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 결과 Reply를 Related Post와 source로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification 생성을 시도한다
- **AND** 이름, handle, Profile 또는 Post snapshot을 kind data에 저장하지 않는다

#### Scenario: ActivityPub 원격 Reply

- **WHEN** ActivityPub-origin Post transaction이 Local Parent를 참조하는 새 Reply를 commit하고 Post ID 기반 effects Workflow 시작이 수락된다
- **THEN** effects Workflow Activity는 Local Parent Author를 Recipient, 원격 Reply Author를 Related Profile, 결과 Reply를 source와 Related Post로 하는 Notification을 정확히 하나 생성한다
- **AND** Fedify adapter는 Notification side effect를 직접 호출하지 않는다

#### Scenario: duplicate 또는 concurrent ActivityPub Create

- **WHEN** ActivityPub object URI가 이미 저장되어 duplicate 또는 concurrent Create가 no-op이 된다
- **THEN** 시스템은 Reply Notification effects Workflow를 새로 시작하거나 Reply Notification lifecycle을 다시 실행하지 않는다
- **AND** 과거에 누락된 Notification을 backfill하지 않는다

#### Scenario: self-reply

- **WHEN** Reply Author와 Parent Author가 같다
- **THEN** 시스템은 Reply 생성 결과를 유지한다
- **AND** accepted effects Workflow의 Notification Activity는 Notification을 생성하지 않는 멱등 no-op으로 끝난다

#### Scenario: Recipient에게 결과가 보이지 않음

- **WHEN** Parent Author Profile이 결과 Reply 또는 Reply Author Profile을 조회할 수 없다
- **THEN** accepted effects Workflow의 Notification Activity는 Notification을 생성하지 않는 멱등 no-op으로 끝난다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 결과 Reply source에 대해 시작이 수락된 effects Workflow가 재시도되거나 Notification 저장 경계가 중복 또는 동시 호출된다
- **THEN** 같은 Recipient, Reply kind와 source ID의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Reply Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-426`, `PROD-507`, `PROD-722` — Reply Notification 생성 실패는 실제 commit된 Reply transaction, GraphQL 성공 또는 ActivityPub 수신 성공을 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT). Post ID 기반 effects Workflow 시작의 gap 또는 실패로 Notification 효과가 유실될 수 있는 경계는 허용하고 관측해야 하며(MUST), 시작이 수락된 뒤의 Notification Activity 재시도와 멱등 복구는 그 Workflow가 소유해야 한다(MUST).

#### Scenario: effects Workflow 시작 gap 또는 실패

- **WHEN** Reply transaction이 실제 commit됐지만 Post ID 기반 effects Workflow가 시작되기 전에 process가 종료되거나 start 요청이 수락되지 않는다
- **THEN** 시스템은 commit된 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** Reply Notification이 생성되지 않을 수 있는 start gap/failure를 허용하고 감지된 실패를 관측한다
- **AND** 별도 application outbox, MessageQueue, relay 또는 backfill로 누락된 Notification을 자동 복구하지 않는다

#### Scenario: Notification Activity 저장 실패

- **WHEN** 시작이 수락된 effects Workflow Activity가 Reply Notification 저장을 시도하고 재시도 가능한 저장 실패를 만난다
- **THEN** 시스템은 commit된 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** effects Workflow는 같은 Reply source에 대한 Notification 효과를 자신의 Temporal retry 경계에서 재시도할 수 있다
- **AND** transaction savepoint가 Notification 효과의 추가 owner가 되지 않는다

#### Scenario: Post transaction rollback

- **WHEN** 기존 Post transaction이 Reply를 commit하기 전에 rollback된다
- **THEN** 시스템은 Reply와 Reply Notification을 모두 남기지 않는다
- **AND** Post ID 기반 effects Workflow 시작을 시도하지 않는다

### Requirement: Reply Notification GraphQL과 inbox 통합

**Authority / Provenance:** `docs/domain/objects/notification.md`, [PROD-426](https://linear.app/byulmaru/issue/PROD-426/reply-notification%EC%9D%84-%EC%83%9D%EC%84%B1%ED%95%98%EA%B3%A0-inbox%EC%97%90-%ED%91%9C%EC%8B%9C%ED%95%9C%EB%8B%A4), [PROD-703](https://linear.app/byulmaru/issue/PROD-703/%EA%B8%B0%EC%A1%B4-notification-read-mutation%EC%9D%B4-%EC%A7%80%EC%A0%95%ED%95%9C-%EC%95%8C%EB%A6%BC-%EC%97%AC%EB%9F%AC-%EA%B0%9C%EB%A5%BC-%EC%B2%98%EB%A6%AC%ED%95%98%EB%8F%84%EB%A1%9D-%ED%99%95%EC%9E%A5%ED%95%9C%EB%8B%A4) — PROD-426은 Reply inbox 통합을, PROD-703은 지정 ID Read의 조용한 제외 계약을 소유한다. API와 클라이언트는 visible Reply Notification을 기존 Notification interface·connection·Unread count·Read·badge/cache·inbox 계약에 통합해야 한다(MUST).

#### Scenario: Reply Notification concrete object·Node

- **WHEN** GraphQL schema가 Reply kind Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete `ReplyNotification` object로 resolve한다
- **AND** object는 Reply Author `profile`과 결과 Reply `post`를 제공한다
- **AND** concrete global ID로 Node를 조회할 때 row kind, Recipient membership과 visible predicate를 검증하고, 실패하면 다른 type으로 재시도하지 않고 `null`을 반환한다

#### Scenario: visible Recipient inbox

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Reply Notification은 기존 connection 정렬·pagination과 Unread count에 포함된다
- **AND** inbox item은 Reply Author를 표시하고 결과 Reply 상세로 이동한다

#### Scenario: Read side effect와 이동 분리

- **WHEN** 사용자가 Reply Notification item을 활성화한다
- **THEN** 클라이언트는 결과 Reply 이동을 즉시 시작한다
- **AND** Best Effort Read의 pending, 실패 또는 재시도가 이동을 지연·취소·되돌리지 않는다
- **AND** Read 성공 payload는 item과 Recipient Profile Unread count를 같은 actor Relay Store에서 갱신한다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 하나의 Recipient Profile inbox를 조회하거나 읽는다
- **THEN** 시스템은 대상 Profile의 Reply Notification, count, Read와 cache만 반환·갱신한다
- **AND** 다른 selected Profile의 item, badge 또는 Relay Store를 변경하지 않는다

#### Scenario: unavailable item

- **WHEN** source Reply가 없거나 Recipient·Parent·Author 관계가 저장계약과 다르거나 Recipient 기준 Related Post 또는 Related Profile을 조회할 수 없다
- **THEN** API는 item을 page limit 전 connection과 Unread count에서 제외한다
- **AND** Node는 `null`을 반환하고 `markNotificationRead(input: { ids })`는 해당 ID를 조용히 제외하며 generic Notification으로 대신 노출하지 않는다

### Requirement: 현재 로드된 Web Notification 일괄 Read action

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/design/page-header.md`, `docs/design/colors.md`, `docs/design/breakpoints.md`, `PROD-703`, `PROD-679` — Web `/notifications`는 현재 Relay connection에 로드된 unread Notification만 지정 ID 일괄 Read로 처리하는 `모두 읽음` action을 제공하고, 서버 payload로 목록과 전역 인디케이터를 수렴시켜야 한다(MUST).

#### Scenario: Web header action 소유권

- **WHEN** 사용자가 Web `/notifications`를 연다
- **THEN** `<768px` 모바일 Web에서는 `UniversalShell` app bar가, compact/full Web에서는 route의 `PageHeader`가 `모두 읽음` trailing text action을 렌더링한다
- **AND** Android/iOS 화면에는 이 action을 렌더링하지 않는다

#### Scenario: action enabled와 pending 상태

- **WHEN** 현재 Relay connection에 loaded unread Notification이 하나 이상 있고 Read 요청이 pending이 아니다
- **THEN** `모두 읽음` action은 활성화된다
- **AND** loaded unread가 없거나 요청 중이면 disabled와 접근성 disabled 상태를 함께 제공하고 중복 요청을 시작하지 않는다

#### Scenario: 현재 로드된 unread ID만 처리

- **WHEN** 사용자가 `모두 읽음`을 활성화한다
- **THEN** 클라이언트는 클릭 시점의 current Relay connection에서 `readAt = null`인 loaded Notification ID만 수집해 `markNotificationRead(input: { ids })`를 한 번 호출한다
- **AND** 아직 로드하지 않았거나 요청 이후 새로 도착한 Notification을 입력에 포함하지 않는다
- **AND** 처리 범위를 넓히기 위한 추가 page fetch나 client의 단건 Read 반복 호출을 수행하지 않는다

#### Scenario: 일괄 Read 성공과 서버 count 수렴

- **WHEN** `모두 읽음` 요청이 `notifications`와 `recipientProfiles` payload로 성공한다
- **THEN** Relay는 반환된 Node ID를 기준으로 처리된 item의 `readAt`과 Recipient Profile의 `unreadNotificationCount`를 정규화한다
- **AND** 처리된 item은 목록에 남고 Unread 시각·접근성 강조만 제거된다
- **AND** 아직 처리하지 않은 unread Notification이 있으면 전역 인디케이터는 0이 아닌 서버 count를 계속 표시할 수 있다
- **AND** 현재 loaded unread가 모두 처리됐으면 전역 인디케이터가 남아 있어도 action은 disabled 상태가 될 수 있다

#### Scenario: 일괄 Read pending 또는 실패

- **WHEN** `모두 읽음` 요청이 pending이거나 실패한다
- **THEN** 클라이언트는 item과 count cache를 낙관적으로 보정하지 않는다
- **AND** 실패한 요청 전의 Unread 강조와 전역 인디케이터를 유지하고 사용자가 다시 시도할 수 있게 한다
- **AND** 실패하면 기존 앱 toast로 `알림을 모두 읽지 못했어요.`와 `다시 시도` action을 제공한다
- **AND** toast의 재시도는 실행 시점의 current Relay connection에서 loaded unread ID를 다시 수집한다

#### Scenario: Web 상태와 수직 검증

- **WHEN** Web 구현을 독립적으로 검증한다
- **THEN** Storybook은 loaded-unread, loaded-zero, loading과 failure 상태를 구분한다
- **AND** Web E2E는 현재 로드된 복수 unread의 일괄 Read, 목록 유지, 강조 제거, 입력에 없는 Notification 보존과 전역 인디케이터의 서버 count 수렴을 검증한다

### Requirement: Reaction Effects Workflow Notification lifecycle

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/reaction.md`, `PROD-413`, `PROD-419`, `PROD-723` — Accepted Reaction Create Effects Workflow의 Worker Activity는 committed Reaction ID로 기존 Reaction Notification recipient, self suppression, visibility와 uniqueness 정책을 적용해 Notification을 멱등 생성해야 한다(MUST). Accepted Delete Effects Workflow의 Worker Activity는 deleted Reaction ID를 source로 하는 Notification을 멱등 정리해야 한다(MUST).

#### Scenario: Reaction Notification 생성

- **WHEN** 새 Reaction의 Create Effects Workflow가 Notification Activity를 실행하고 Recipient가 기존 정책을 충족한다
- **THEN** Activity는 Reaction을 source로 하는 Unread Reaction Notification을 최대 하나 생성한다

#### Scenario: self Reaction 또는 보이지 않는 source

- **WHEN** Reaction Author가 Post Author와 같거나 Recipient가 source Reaction의 Post 또는 Profile을 조회할 수 없다
- **THEN** Notification Activity는 committed Reaction을 유지한 멱등 no-op으로 끝난다

#### Scenario: Reaction Notification 정리

- **WHEN** 실제 삭제된 Reaction의 Delete Effects Workflow가 Notification Activity를 실행한다
- **THEN** Activity는 해당 Reaction ID를 source로 하는 Reaction Notification을 삭제한다
- **AND** Notification이 이미 없으면 멱등 no-op으로 끝난다

#### Scenario: Notification Activity 실패

- **WHEN** Notification 생성 또는 정리가 재시도 가능한 저장 실패를 만난다
- **THEN** Temporal Activity는 같은 Reaction source로 재시도할 수 있다
- **AND** committed Reaction과 다른 federation Activity 시도를 실패로 바꾸지 않는다

#### Scenario: Create와 Delete Workflow의 교차 실행

- **WHEN** Create Notification Activity가 source를 읽은 뒤 Delete Workflow cleanup과 교차 실행되어 unavailable Notification이 남는다
- **THEN** 시스템은 Reaction source row를 잠그거나 Reaction 삭제를 지연하지 않는다
- **AND** 기존 API visibility는 source가 없는 Notification을 숨긴다
- **AND** durable reconciliation은 PROD-328의 별도 책임으로 유지한다

### Requirement: Repost Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412`, `PROD-725` 시스템은 다른 Local Profile의 Post에 새 Repost가 생성되고 create effects Workflow가 accepted되면 Source Repost Post를 source로 하는 Profile-scoped Repost Notification을 멱등 Activity로 생성해야 한다(MUST).

#### Scenario: 다른 Profile의 Post Repost

- **WHEN** Local Profile이 다른 Local Profile의 Post에 새 Repost를 생성하고 create effects Workflow가 accepted된다
- **THEN** Notification Activity는 Source Repost Post ID를 source로 하고 Source Post Author Profile을 Recipient로 하는 Repost Notification을 생성한다
- **AND** Related Profile은 Repost Author, Related Post는 Repost Source에서 파생한다
- **AND** kind별 data에는 Profile, Post 또는 이름·handle snapshot을 저장하지 않는다

#### Scenario: 자기 Post Repost

- **WHEN** Post Author Profile이 자신의 Post를 Repost한다
- **THEN** 시스템은 Repost 생성 결과를 유지한다
- **AND** Repost Notification을 생성하지 않는다

#### Scenario: Remote Recipient

- **WHEN** Repost Source Author가 Remote Profile이다
- **THEN** 시스템은 Local inbox Notification을 생성하지 않는다
- **AND** ActivityPub delivery를 수행하지 않는다

#### Scenario: 동일 Repost source 재처리

- **WHEN** 같은 Source Repost의 Notification 저장 경계가 둘 이상 호출된다
- **THEN** 같은 Recipient, Repost kind와 source ID의 Notification은 하나만 존재한다
- **AND** 반복 호출은 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Repost Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-389`, `PROD-412`, `PROD-416`, `PROD-725` Repost Notification 생성 또는 정리 실패는 Repost 생성·Tombstone transaction이나 성공 결과를 rollback하거나 실패로 바꾸어서는 안 되며(MUST NOT), accepted effects Workflow는 같은 Repost source의 Notification 효과를 유한하게 재시도해야 한다(MUST).

#### Scenario: Notification 저장 실패

- **WHEN** accepted create effects Workflow의 Notification 저장이 실패한다
- **THEN** 시스템은 Repost와 Repost 생성 성공 결과를 유지한다
- **AND** Workflow Activity는 같은 Repost source로 유한하게 재시도하되 outbox, 별도 queue 또는 backfill을 추가하지 않는다

#### Scenario: Notification 정리 실패

- **WHEN** accepted delete effects Workflow의 Notification 정리가 실패한다
- **THEN** 시스템은 Tombstone과 삭제 성공 결과를 유지한다
- **AND** 남은 Notification은 visible predicate에 의해 모든 API 표면에서 숨겨진다

### Requirement: Repost Notification GraphQL과 inbox 계약

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-389`, `PROD-412` API와 클라이언트는 visible Repost Notification을 기존 Notification interface·connection·Unread count·Read와 inbox 계약에 통합해야 한다(MUST).

#### Scenario: Repost Notification concrete object

- **WHEN** GraphQL schema가 Repost kind Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete `RepostNotification` object로 resolve한다
- **AND** object는 Repost Author `profile`과 Repost Source `post`를 제공한다
- **AND** raw kind, source ID, 범용 data 또는 Source Repost storage Node를 public fallback으로 노출하지 않는다

#### Scenario: concrete Node 조회

- **WHEN** 클라이언트가 visible Repost Notification의 concrete global ID를 `node(id:)`에 제공한다
- **THEN** API는 global ID의 concrete typename으로 Repost Notification loader를 선택한다
- **AND** row kind, Recipient membership과 visible predicate를 검증한 뒤 object를 반환한다
- **AND** 조건을 통과하지 못하면 다른 Notification type이나 generic object로 재시도하지 않고 `null`을 반환한다

#### Scenario: Recipient inbox 표시와 이동

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Repost Notification은 기존 connection 정렬·pagination, Unread count와 Read 계약을 따른다
- **AND** client item은 Repost Author와 Source Post를 표시하고 Source Post로 이동할 수 있다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 한 Recipient Profile의 inbox를 조회하거나 읽는다
- **THEN** 시스템은 target Recipient Profile 범위의 Repost Notification과 count만 반환·갱신한다
- **AND** 다른 selected Profile의 Relay Store와 badge를 변경하지 않는다

#### Scenario: Read 뒤 cache 동기화

- **WHEN** 사용자가 visible Repost Notification을 읽음 처리한다
- **THEN** API는 갱신된 Notification과 Recipient Profile의 visible Unread count를 반환한다
- **AND** client는 normalized payload로 item과 shell badge를 같은 actor Store에서 갱신한다

### Requirement: unavailable Repost Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-389`, `PROD-412`, `PROD-416` 시스템은 Source Repost가 없거나 Tombstone이거나 구조가 Repost가 아니거나, Source 관계가 저장 Recipient와 일치하지 않거나 Recipient 기준 Related Profile 또는 Related Post를 조회할 수 없는 Repost Notification을 모든 API 표면에서 숨겨야 한다(MUST).

#### Scenario: Source Repost가 Tombstone인 item

- **WHEN** Source Repost가 Tombstone이지만 Notification 행이 남아 있다
- **THEN** API는 item을 connection과 Unread count에서 page limit 적용 전에 제외한다
- **AND** Node는 `null`, Read는 `NOT_FOUND` 결과를 반환한다

#### Scenario: source 구조 또는 Recipient가 일치하지 않는 item

- **WHEN** source Post가 Content 또는 Reply Parent를 가지거나 Repost Source가 없거나, 그 Source Author가 저장 Recipient와 다르다
- **THEN** API는 item을 모든 Notification 조회·Read 표면에서 숨긴다
- **AND** generic Notification이나 snapshot으로 대신 노출하지 않는다

#### Scenario: Related 객체를 조회할 수 없는 item

- **WHEN** Recipient Profile 기준으로 Repost Author 또는 Repost Source Post를 조회할 수 없다
- **THEN** API는 item을 page limit 적용 전에 connection과 count에서 제외한다
- **AND** Node와 Read에서도 존재하지 않는 item처럼 처리한다

### Requirement: Repost Tombstone 뒤 Notification 정리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-416`, `PROD-725` 정상 Repost 삭제 action이 Source Repost를 Tombstone으로 commit하고 delete effects Workflow가 accepted되면 Notification Activity는 대응 Repost Notification을 멱등 정리해야 한다(MUST).

#### Scenario: Repost Tombstone cleanup

- **WHEN** Repost Tombstone transaction 뒤 delete effects Workflow가 accepted된다
- **THEN** Notification Activity는 Repost kind와 Source Repost ID로 대응 Notification을 정리한다
- **AND** cleanup 성공 뒤 item은 connection, Unread count, Node와 Read에서 사라진다

#### Scenario: 반복 cleanup

- **WHEN** 이미 제거됐거나 존재하지 않는 Repost Notification source의 cleanup을 다시 호출한다
- **THEN** Notification delete 경계는 성공한 멱등 no-op을 반환한다

#### Scenario: cleanup 실패와 잔존 행

- **WHEN** accepted delete effects Workflow의 cleanup이 실패하거나 Worker가 재시작된다
- **THEN** Repost Tombstone과 성공 응답은 유지된다
- **AND** 남은 Notification 행은 Source Repost가 Active가 아니므로 모든 API 표면에서 숨겨진다
- **AND** Workflow Activity는 유한하게 재시도하되 cron, 별도 queue, backfill 또는 bulk cleanup을 추가하지 않는다

### Requirement: Follow Request Notification API visibility

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `PROD-321` — visible Follow Request Notification은 기존 Profile-scoped API 계약에 통합되어야 한다(MUST).

API는 visible `FOLLOW_REQUEST` Notification을 기존 Profile-scoped Notification connection·Unread count·Node·Read 계약에 통합하되, request source와 Recipient/Related Profile 관계를 Recipient Profile 기준으로 검증해야 한다(MUST).

#### Scenario: concrete Follow Request Notification

- **WHEN** GraphQL이 `kind = FOLLOW_REQUEST` row를 resolve한다
- **THEN** API는 Notification interface와 Node를 구현하는 Follow Request 전용 concrete object를 반환한다
- **AND** object의 requester Profile field는 source request의 Follower Profile에서 파생한다
- **AND** object의 `followRequest: ProfileFollowRequest!` field는 Recipient가 접근할 수 있는 같은 source request를 반환한다
- **AND** raw kind, source ID, data snapshot 또는 받은 요청 처리 action을 공개하지 않는다

#### Scenario: source와 recipient 일치 검증

- **WHEN** Follow Request Notification을 connection, Unread count, Node 또는 Read에서 조회한다
- **THEN** source request가 존재하고 source의 Followee가 저장된 Recipient Profile과 일치하며 requester Profile이 Recipient Profile을 기준으로 조회 가능할 때만 item을 visible로 취급한다
- **AND** visible concrete object의 `followRequest`도 같은 source request를 사용하며 Recipient 기준 visibility를 우회하지 않는다
- **AND** request row가 제거되었거나 관계가 불일치하면 item, count와 Read 결과를 존재하지 않는 것으로 처리한다

#### Scenario: requester Profile 권한과 membership

- **WHEN** 로그인 Account가 Recipient Profile membership을 가지고 Notification 목록 또는 item을 조회한다
- **THEN** API는 selected Profile과 무관하게 해당 Recipient의 visible Follow Request Notification을 반환한다
- **AND** requester Profile이 Recipient Profile의 조회 정책을 통과하지 않으면 item을 숨기고 generic fallback을 반환하지 않는다

#### Scenario: visibility와 source field의 일관된 snapshot

- **WHEN** connection 또는 Node가 pending Follow Request source를 visible로 확인한 뒤 concrete field를 resolve하기 전에 같은 request가 삭제된다
- **THEN** API는 visibility row와 함께 읽은 source snapshot을 사용해 non-null `profile`·`followRequest` field를 일관되게 resolve하거나 부모 Notification을 존재하지 않는 것으로 처리한다
- **AND** source를 별도 조회해 `Notification source not found` GraphQL 오류를 발생시키지 않는다

#### Scenario: unread와 read 반영

- **WHEN** visible Follow Request Notification을 읽음 처리한다
- **THEN** 기존 idempotent Read mutation이 Notification의 최초 `readAt`과 Recipient Profile의 visible Unread count를 갱신한다
- **AND** request가 승인·거절·취소·취소된 inbound Undo로 삭제되면 Notification은 목록과 count에서 사라진다

### Requirement: Follow Request Notification 목록과 requester Profile 활성화

**Authority / Provenance:** `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/objects/profile.md`, `docs/design/page-header.md`, `PROD-321` — 목록은 requester Profile을 표시하고 활성화해야 한다(MUST).

클라이언트는 selected Profile의 visible `FOLLOW_REQUEST` Notification을 기존 단일 Notification 목록, Relay/cache scope와 서버 제공 Unread badge에 포함해야 하며(MUST), item 활성화는 요청자(Follower) Profile로 이동해야 한다(MUST).

#### Scenario: 목록 item 표시

- **WHEN** selected Profile이 수신한 visible Follow Request Notification이 목록 connection에 포함된다
- **THEN** 기존 Notification row의 kind 표현·상대 시각·Unread 표시 구조 안에 requester Profile identity와 팔로우 요청 의미를 표시한다
- **AND** requester Profile의 display/handle과 조회 가능한 avatar를 source에서 파생한다
- **AND** 받은 요청 목록의 별도 row, 승인·거절·취소 action 또는 inline 맞팔로우 control을 추가하지 않는다

#### Scenario: requester Profile로 활성화

- **WHEN** 사용자가 Follow Request Notification의 avatar 또는 본문 link를 활성화한다
- **THEN** 클라이언트는 requester Profile의 기존 `relativeHandle` Profile route로 이동한다
- **AND** canonical received-request route로 이동하거나 해당 route를 새로 만들지 않는다
- **AND** 기존 목록의 best-effort Read mutation과 Profile별 Relay cache 갱신을 적용한다

#### Scenario: 목록과 Unread badge 통합

- **WHEN** selected Profile에 Follow Request Notification이 Unread 상태로 존재한다
- **THEN** 서버의 `unreadNotificationCount`가 기존 Notification 목록과 shell badge에 해당 item을 포함한다
- **AND** 클라이언트는 목록 길이나 숨겨진 item을 이용해 count를 임의로 재계산하지 않는다
- **AND** Profile 전환 시 다른 Profile의 item·count·badge가 노출되지 않는다

#### Scenario: 빈 목록 copy 범위

- **WHEN** 목록에 Follow Request Notification을 포함한 visible item이 하나도 없다
- **THEN** 기존 Notification empty state는 요청·팔로우 알림을 포함한 Notification 의미를 설명할 수 있다
- **AND** 받은 요청 관리 화면의 빈 상태나 승인 안내를 대신 표시하지 않는다

### Requirement: Follow lifecycle Notification effects

**Authority / Provenance:** `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, PROD-720 — The system MUST satisfy this requirement.

The system MUST attach Follow and Follow Request Notification effects to the committed transition of the deterministic directed pair Workflow. A Notification effect MUST use the committed Follow or Follow Request row ID as its source identity and MUST be appended to the pair Workflow's FIFO effect queue only after the source transition commits.

#### Scenario: Established Follow Notification

- **WHEN** an open-policy Follow creates a new relation for a local recipient
- **THEN** the Update returns the committed relation result first and the Workflow later creates the source-correlated Follow Notification

#### Scenario: Pending Follow Request Notification

- **WHEN** an approval-required Follow creates a new request for a local recipient
- **THEN** the Workflow creates the source-correlated Follow Request Notification after commit and keeps the pair lifecycle Pending

#### Scenario: Approval transition Notification order

- **WHEN** an approval or verified Accept atomically removes the exact request and creates a Follow relation
- **THEN** the FIFO effect queue removes the request Notification before creating the new relation Notification, using each source's own immutable identity

#### Scenario: Rejection or cancellation cleanup

- **WHEN** a Pending request is rejected, cancelled, or terminated by a verified inbound transition
- **THEN** the Workflow enqueues only the exact request Notification cleanup and the pair lifecycle closes without creating a Follow Notification

#### Scenario: Duplicate transition

- **WHEN** a command observes an existing Follow or existing Pending request and commits no new source row
- **THEN** the Workflow enqueues no new Notification and does not attempt to repair an unrelated missing historical Notification

#### Scenario: Source isolation across refollow

- **WHEN** an old Follow or Follow Request is removed and a later lifecycle creates a new source row for the same directed pair
- **THEN** cleanup uses the old source ID and cannot remove the later lifecycle's Notification

#### Scenario: Separate Unfollow cleanup

- **WHEN** an established Follow is removed by the separate short Unfollow/removal command
- **THEN** its source-correlated Follow Notification cleanup uses the exact deleted Follow source ID and does not reopen the completed pair lifecycle Workflow

### Requirement: Notification failure isolation and continuation

The system MUST keep Notification failures separate from the committed Follow lifecycle result. The pair Workflow MUST preserve Pending state when a Pending Notification effect fails and MUST close a terminal lifecycle without rolling back its domain transition.

#### Scenario: Early commit result

- **WHEN** the pair transaction commits before a Notification Activity completes
- **THEN** the Update caller receives the domain result, while the Workflow retries or observes the Notification failure independently

#### Scenario: Pending Notification failure

- **WHEN** a Pending request Notification retry or terminal failure occurs
- **THEN** the request row and Pending Workflow remain available for approve, accept, reject, cancel, or applicable inbound termination

#### Scenario: Terminal Notification failure

- **WHEN** a terminal transition's Notification cleanup or creation fails after the DB commit
- **THEN** the committed state is preserved, all applicable FIFO sibling effects are attempted, and the failure is observable when the pair Workflow closes

#### Scenario: Recipient and origin policy

- **WHEN** the Followee is remote or the transition originates from ActivityPub
- **THEN** the Notification effect follows the existing recipient/source policy, and no outbound protocol echo is inferred from creating or removing a Notification
