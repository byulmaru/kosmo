## Context

`docs/domain/objects/notification-item.md`는 Notification Item의 Recipient, Read State, type별 source와 삭제·억제 정책을 canonical 계약으로 정의한다. 현재 저장소에는 Notification table, GraphQL API와 실제 목록이 없고 `/notifications`는 placeholder다. 선행 `PROD-323`과 PR #244가 Follow Request를 pending-only 모델로 정렬했으므로, Follow와 Follow Request의 충돌 없이 첫 Notification source를 설계할 수 있다.

이 change는 `PROD-271`이 소유하는 하나의 행동 계약을 `PROD-325`, `PROD-274`, `PROD-275`, `PROD-276`, `PROD-277`, `PROD-324`, `PROD-278`의 리뷰 가능한 구현 PR로 나눈다. spec-only PR인 `PROD-273`은 구현 코드를 포함하지 않으며, 마지막 통합 이슈 `PROD-278`이 전체 scope 검증과 archive를 소유한다.

## Goals / Non-Goals

**Goals:**

- Profile Recipient를 기준으로 재사용할 수 있는 Notification Item base와 type-specific source 확장 경계를 만든다.
- Follow를 첫 sample source로 연결해 생성·중복·삭제·Re-follow와 best-effort 실패 격리를 검증한다.
- 선택된 Profile의 Relay connection, Read mutation, Unread count와 Account/Profile 격리를 고정한다.
- Expo 목록과 shell badge의 세부 UX는 소유 이슈가 결정하고 구현 전에 이 change에 동기화하게 한다.
- Local Follow 정상 경로를 source action부터 UI와 badge까지 Web E2E로 검증한다.

**Non-Goals:**

- Follow Request와 다른 Notification Type, historical backfill.
- 실제 Profile Mute·Profile Block·Domain Block 판정 연결.
- Related Profile unavailable item을 후속 자동 정리할 원인·시점 정책.
- ActivityPub ingress, actor materialization, Follow/Undo transport와 remote E2E.
- outbox, retry, reconciliation, background worker, Push, realtime, email과 OS notification.
- 전체 읽음, 수동 삭제, 보존 기간, 별도 Notification 상세 화면과 inline follow-back.

## Architecture

### 저장 모델과 생명주기

`notification_item`은 GraphQL `NotificationItem` Node가 되는 공통 base다. UUID v8 `id`, `recipient_profile_id`, `created_at`, nullable `read_at`만 저장한다. Unread/Read는 `read_at` nullability에서 파생하고 별도 Read State를 중복 저장하지 않는다. `(recipient_profile_id, id DESC)`는 stable inbox pagination을, `read_at IS NULL` 조건의 recipient partial index는 Unread count를 지원한다.

`notification_follow`는 Follow type extension이다. 자체 UUID v8 ID와 discriminator를 가지며, `notification_item_id`와 `profile_follow_id`를 각각 non-null unique foreign key로 저장한다. extension 존재가 `NotificationType.FOLLOW`를 뜻하고 Related Profile은 source의 `follower_profile_id`에서 파생한다. base에는 미래 type용 nullable source column이나 DB type enum을 두지 않는다.

base와 extension은 하나의 transaction에서 생성한다. deferred integrity trigger는 commit 시 살아 있는 base가 정확히 하나의 지원 extension을 갖는지 확인한다. `notification_item` 삭제는 FK cascade로 extension을 삭제한다. `profile_follow` 삭제도 FK cascade로 extension을 삭제하고, extension의 `AFTER DELETE` cleanup trigger가 base를 삭제한다. base 삭제에서 시작한 cascade 중 cleanup trigger가 같은 base를 다시 삭제하는 경로는 zero-row no-op이어야 하며 migration integration test로 고정한다.

공통 Follow Notification 저장 경계는 established `ProfileFollow` 하나만 입력으로 받고, 호출자에게 Recipient나 Related Profile ID를 받지 않는다. source row를 읽어 Followee를 Recipient, Follower를 Related Profile로 파생하고 Recipient가 Local Profile인지 검증한다. 두 unique constraint의 기존 행 또는 concurrent conflict를 기존 item을 나타내는 성공 결과로 정규화한다. origin은 이 경계의 분기 기준이 아니며, 이미 materialize된 Remote Follower source도 같은 경계를 사용한다.

### source action과 failure boundary

공용 ProfileFollow action은 새 관계 transaction을 먼저 commit한다. 그 뒤 같은 request 안에서 Notification eligibility와 저장 경계를 순서대로 `await`하고 모든 Notification-side 오류를 catch한다. 같은 DB transaction/savepoint에 넣어 Notification SQL 오류가 Follow를 abort하게 하거나, request 종료 뒤 실행이 보장되지 않는 fire-and-forget 호출을 사용하지 않는다.

실제 Mute/Block evaluator가 연결되기 전에는 기본 allow다. 명시적 deny와 evaluator 오류는 item을 만들지 않으며, evaluator 오류는 privacy-safe fail-closed로 처리한다. 저장 실패도 Follow 성공을 유지한다. 누락 intent를 durable하게 저장하지 않으므로 duplicate Follow, scan 또는 backfill로 자동 복구하지 않는다. 단, 새 관계에서 시작한 integration 경계 자체가 같은 source로 재진입하면 저장 경계의 idempotency로 성공한 no-op이 된다.

### GraphQL API

Notification resolver module은 `NotificationItem` loadable Node ref, `NotificationType`, connection, Profile fields와 Read mutation을 소유한다.

- `Profile.notifications`: 현재 선택된 Profile만 읽을 수 있는 `NotificationItemConnection`.
- `Profile.unreadNotificationCount`: `recipient_profile_id`와 `read_at IS NULL`만 계산한다.
- `NotificationItem`: `id`, `type`, `createdAt`, nullable `readAt`, nullable `relatedProfile`.
- `markNotificationRead(input: { id })`: `MarkNotificationReadPayload.notificationItem`과 `.recipientProfile`을 반환한다.

목록은 시간 정렬 UUID v8 `id DESC` keyset pagination을 사용하고 opaque cursor에 ID를 담는다. `created_at`은 표시 값이며 정렬 key로 중복 사용하지 않는다. 목록과 count query는 Related Profile visibility를 join filter로 사용하지 않는다. item/source를 찾은 뒤 Related Profile ID를 Profile Node loader에 전달하고, 조회 불가하면 필드만 `null`로 만든다.

Read update는 현재 active Profile의 recipient 조건을 SQL에 포함하고 `read_at = coalesce(read_at, now())` 의미로 최초 시각을 보존한다. 다른 Recipient의 item과 없는 ID는 모두 `NOT_FOUND`, active Profile 부재는 `usingProfile` auth의 `PERMISSION_DENIED`로 처리한다. Node loader도 active recipient로 제한해 다른 inbox Node를 반환하지 않는다. payload의 Recipient Profile을 함께 선택하면 Relay가 `unreadNotificationCount`를 동일 Node에 정규화한다.

### 후속 UI 결정 경계

이 spec-only slice는 UI 세부 UX를 선결정하지 않는다. `PROD-277`은 목록 표시 상태, item activation 순서, navigation·실패 표현, fetch·refresh·pagination·Profile 전환 cache 경계를 결정하고 구현 전에 `notification` requirements, design과 decisions를 갱신한다. `PROD-324`는 shell surface, count cap, 접근성, loading/error와 Profile 전환 cache 경계를 결정하고 구현 전에 `web-app-shell` delta와 관련 design/decisions를 추가한다.

다만 공통 API·domain behavior에서 파생되는 unavailable 계약은 지금 고정한다. source가 남은 item은 Related Profile visibility와 무관하게 목록·Read·Unread count에 참여하며, 클라이언트는 snapshot 없이 type 기반 generic fallback을 표시하고 Profile 이동을 제공하지 않되 Read는 허용한다. 이 최소 계약을 넘는 interaction과 표현은 `PROD-277`이 소유한다.

## Verification Strategy

- `PROD-325`: migration/DB integration으로 discriminator, unique/FK, deferred integrity, cascade/cleanup trigger, index를 검증한다.
- `PROD-274`: storage test로 source correlation, Local/Remote Follower, existing/concurrent idempotency를 검증한다.
- `PROD-275`: schema/resolver test로 cursor, 권한, Node filtering, 반복·동시 Read, count와 unavailable을 검증한다.
- `PROD-276`: action test로 allow/deny/evaluator error/storage failure, integration 재진입과 origin-neutral port 호출을 검증한다.
- `PROD-277`·`PROD-324`: 구현 전에 각 이슈가 소유한 UI 결정을 이 change에 반영하고, 그 계약을 Storybook interaction/a11y와 Android/iOS smoke로 검증한다.
- `PROD-278`: 실제 Local Follow action을 사용하는 Web E2E와 관련 workspace 검증을 통과한 뒤 archive 전후 strict validation을 실행한다.

## Risks / Trade-offs

- [Follow commit 뒤 Notification 호출 전에 process가 종료되면 item이 유실될 수 있다] → 첫 delivery는 best-effort임을 명시하고 자동 retry를 제공하지 않는다. durable delivery가 필요해지면 별도 outbox/recovery change로 다룬다.
- [type-specific cleanup/integrity trigger는 Drizzle relation만 읽어서는 생명주기가 드러나지 않는다] → migration SQL에 목적이 드러나는 이름을 사용하고 raw source delete, base delete, mapping delete와 rollback을 DB integration test로 검증한다.
- [base delete cascade가 extension cleanup trigger를 다시 실행한다] → parent delete가 zero-row no-op인지 검증해 recursion과 unexpected row count를 막는다.
- [여러 active change가 TableDiscriminator를 동시에 추가할 수 있다] → `PROD-325` 구현 시 최신 기준 브랜치에서 미사용 discriminator를 할당하고 registry uniqueness test를 실행한다.
- [Related Profile visibility를 목록 join에 넣으면 item과 count가 조용히 사라진다] → base recipient/read 조건과 nullable Profile Node load를 분리해 target API test로 고정한다.
- [UI 구현이 공통 API 계약과 다른 cache 또는 interaction을 선택할 수 있다] → `PROD-277`·`PROD-324`의 첫 task를 OpenSpec 갱신 gate로 두고 구현·검증을 그 뒤에 진행한다.

## Migration Plan

1. `PROD-325`에서 additive `notification_item`·`notification_follow` schema, discriminator, relation, index와 trigger를 배포한다. 기존 `ProfileFollow`는 backfill하지 않는다.
2. `PROD-274` 저장 경계와 `PROD-275` API를 schema 위에 병렬로 구현한다.
3. `PROD-281`의 공용 ProfileFollow action과 `PROD-274`가 준비되면 `PROD-276` source integration을 연결한다.
4. API가 안정되면 `PROD-277` 목록과 `PROD-324` badge를 병렬로 배포한다.
5. `PROD-278`에서 vertical E2E, canonical 문서/task sync와 archive 전후 validation을 완료한다.

애플리케이션 rollback은 additive table을 유지하고 Notification source 호출·API·UI만 이전 버전으로 되돌린다. 데이터가 생성된 뒤 table을 자동 drop하는 down migration은 사용하지 않는다. trigger 또는 schema 자체를 제거해야 한다면 Notification 쓰기를 먼저 중단하고 데이터 보존/삭제 결정을 별도 migration으로 수행한다.

## Open Questions

현재 공통 저장·API 계약의 구현을 막는 열린 질문은 없다. 목록과 badge의 세부 UX는 소유 이슈인 `PROD-277`·`PROD-324`가 구현 전에 결정한다. 실제 Mute/Block 연결은 `PROD-327`, unavailable item 자동 정리 원인·시점은 `PROD-328`, delivery/retry와 다른 Notification Type은 각각 별도 Issue → OpenSpec 흐름에서 결정한다.
