## Context

`docs/domain/objects/notification.md`는 Notification의 Recipient, Read State, type별 source와 삭제·억제 정책을 canonical 계약으로 정의한다. 현재 저장소에는 Notification table, GraphQL API와 실제 목록이 없고 `/notifications`는 placeholder다. 선행 `PROD-323`과 PR #244가 Follow Request를 pending-only 모델로 정렬했으므로, Follow와 Follow Request의 충돌 없이 첫 Notification source를 설계할 수 있다.

이 change는 `PROD-271`이 소유하는 하나의 행동 계약을 `PROD-325`, `PROD-274`, `PROD-275`, `PROD-352`, `PROD-351`, `PROD-350`, `PROD-276`, `PROD-277`, `PROD-324`, `PROD-278`의 리뷰 가능한 구현 PR로 나눈다. spec-only PR인 `PROD-273`은 구현 코드를 포함하지 않으며, 마지막 통합 이슈 `PROD-278`이 전체 scope 검증과 archive를 소유한다.

## Goals / Non-Goals

**Goals:**

- Profile Recipient를 기준으로 재사용할 수 있는 최소 Notification projection을 만든다.
- Follow를 첫 sample source로 연결해 생성·중복·삭제·Re-follow와 best-effort 실패 격리를 검증한다.
- Account-Profile membership이 있는 Profile의 Relay connection, Read mutation과 visible Unread count를 고정한다.
- Recipient Profile 자체 visibility, source 존재·Recipient 일치와 Related Profile visibility의 공통 predicate를 만족하지 않는 item을 모든 API 표면에서 숨긴다.
- UI와 Relay cache는 selected Profile별로 격리하고 Local Follow 정상 경로를 Web E2E로 검증한다.

**Non-Goals:**

- Follow Request와 다른 Notification Type, historical backfill.
- 실제 Profile Mute·Profile Block·Domain Block 판정 연결.
- unavailable item을 비동기 삭제할 event, queue/scan, retry, worker와 대량 처리.
- ActivityPub ingress, actor materialization, Follow/Undo transport와 remote E2E.
- outbox, delivery retry/reconciliation, Push, realtime, email과 OS notification.
- 전체 읽음, 수동 삭제, 보존 기간, 별도 Notification 상세 화면과 inline follow-back.

## Architecture

### 단일 Notification projection

`notification` 하나가 저장 projection이며 GraphQL에서는 공통 `Notification` interface와 kind별 concrete object로 해석된다.

- `id uuid`: 기존 UUIDv8과 신규 UUIDv7이 공존하는 Notification DB identity. GraphQL concrete type은 ID bit가 아니라 global ID typename과 저장 `kind`로 검증한다.
- `recipient_profile_id uuid`: `profile.id` foreign key. Recipient Profile 물리 삭제에는 cascade한다.
- `kind notification_kind`: 현재 `FOLLOW`만 지원한다.
- `source_id uuid`: kind가 가리키는 source ID. 의도적으로 foreign key를 만들지 않는다.
- `data jsonb NOT NULL DEFAULT '{}'`: kind별 애플리케이션 타입으로 검증하는 최소 추가 데이터.
- `created_at`, nullable `read_at`: `read_at` nullability가 Unread/Read와 최초 Read 시각을 모두 표현한다.

`(recipient_profile_id, kind, source_id)` unique constraint는 같은 Recipient, kind와 source 조합의 item 하나를 보장하면서 하나의 source가 여러 Recipient에게 투영되는 후속 kind를 허용한다. Recipient-first 물리 순서는 Recipient 기준 접근을 우선한다. source-only cleanup을 위한 별도 `(kind, source_id)` index는 선제 추가하지 않고, 실제 cleanup 구현에서 필요가 확인될 때 별도 범위로 결정한다. `(recipient_profile_id, id DESC)` index는 inbox pagination을, `read_at IS NULL` 조건의 Recipient partial index는 Unread count 후보를 지원한다. `created_at`은 표시 값이며 정렬 key로 중복 사용하지 않는다.

FOLLOW에서 `source_id`는 `profile_follow.id`이고 `data`는 `{}`다. Recipient는 Followee, Related Profile은 Follower에서 조회 시 파생한다. Profile ID, 이름·handle snapshot을 `data`에 복제하지 않는다. 별도 `notification_follow` table, source FK, cleanup trigger와 deferred integrity constraint는 만들지 않는다. 새 Profile-scoped kind가 생기면 그 시점에 enum, source mapping과 실제 필요한 data shape만 추가한다. Account-scoped Operational Notification의 저장 구조는 해당 kind의 별도 change가 결정한다.

### source 저장·삭제와 failure boundary

공통 Follow Notification 저장 경계는 established `ProfileFollow` 하나만 입력으로 받고, 호출자에게 Recipient나 Related Profile ID를 받지 않는다. source row를 읽어 Followee를 Recipient, Follower를 Related Profile로 파생하고 Recipient가 Local Profile인지 검증한다. 기존 `(FOLLOW, source_id, recipient_profile_id)` 행 또는 concurrent unique conflict는 기존 item을 나타내는 성공 결과로 정규화한다. Follower origin은 분기 기준이 아니며 이미 materialize된 Remote Follower source도 같은 경계를 사용한다.

공용 ProfileFollow 생성 action은 새 관계 transaction을 먼저 commit한다. 그 뒤 같은 request 안에서 Notification eligibility와 create 경계를 순서대로 `await`하고 모든 Notification-side 오류를 catch한다. 실제 Mute/Block evaluator가 연결되기 전에는 기본 allow이며, 명시 deny와 evaluator 오류는 item을 만들지 않는다. evaluator 오류는 privacy-safe fail-closed다.

정상 ProfileFollow 삭제 action도 source transaction을 먼저 commit한 뒤 `(FOLLOW, source_id)` delete 경계를 같은 request에서 `await`하고 오류를 catch한다. create/delete Notification 오류는 모두 source action 성공을 바꾸지 않는다. 같은 DB transaction/savepoint에 넣거나 fire-and-forget 호출을 사용하지 않는다.

따라서 process 종료나 Notification 저장 실패로 새 item이 유실될 수 있고, delete 실패나 raw source 삭제로 orphan row가 남을 수 있다. 첫 delivery는 이를 받아들이며 durable intent, retry와 message queue를 제공하지 않는다. orphan은 아래 visible predicate에서 즉시 숨긴다.

### GraphQL 권한과 identity scope

Notification resolver module은 `Notification` interface, kind별 concrete object, kind-aware Node resolution, connection, Profile fields와 Read mutation을 소유한다. 저장 row의 `kind`가 concrete GraphQL type을 결정하며 `kind` 자체는 public enum이나 공통 field로 노출하지 않는다.

공용 Node decode는 global ID의 concrete typename으로 loadable Node ref를 직접 선택한다. `FollowNotification` ref는 decode된 Notification DB UUID를 batch load하고 membership·visible predicate와 `kind = FOLLOW`를 함께 검증한다. `Notification` interface typename을 ID에 encode하거나 typename/row mismatch에서 다른 concrete loader를 추론하지 않는다. 후속 kind는 자신의 concrete ref와 loader를 추가하며 지원하지 않는 kind나 hidden row는 Node 없음으로 정규화한다.

- `Profile.notifications`: target Profile의 visible `NotificationConnection`.
- `Profile.unreadNotificationCount`: 같은 visible predicate를 만족하는 unread item 수.
- `Notification implements Node`: 모든 kind가 공유하는 `id`, `createdAt`, nullable `readAt`.
- `FollowNotification implements Notification & Node`: Follow 전용 non-null `profile`.
- `markNotificationRead(input: { id })`: `MarkNotificationReadPayload.notification`과 `.recipientProfile`을 반환한다.

Profile fields와 Read mutation의 authorization은 session의 selected Profile이 아니라 로그인 Account와 target Recipient Profile 사이의 Account-Profile membership이다. membership의 role은 권한 판정에 사용하지 않는다. selected Profile이 없거나 target과 달라도 membership이 있으면 API는 성공한다.

- 인증되지 않은 Profile field와 Read 요청은 `PERMISSION_DENIED`다.
- Profile field에서 membership이 없으면 `PERMISSION_DENIED`다.
- Node는 없는 ID, membership 부재와 hidden item을 모두 `null`로 정규화한다.
- Read는 없는 ID, membership 부재와 hidden item을 모두 `NOT_FOUND`로 정규화한다.
- Recipient Profile 자체가 비활성 등으로 GraphQL Profile object에 노출되지 않으면 Notification Node는 `null`이고 Read는 `NOT_FOUND`다.

UI와 Relay cache는 여전히 현재 selected Profile을 inbox scope로 사용한다. API authorization과 UI identity selection을 분리하면 같은 Account의 다른 Profile을 관리 도구나 후속 client가 명시적으로 조회할 수 있으면서, 일반 화면은 selected Profile의 item만 표시한다.

### visible predicate와 pagination

FOLLOW item은 다음 조건을 모두 만족할 때만 API에 존재한다.

1. 요청 Account가 Recipient Profile membership을 가진다.
2. Recipient Profile 자체가 GraphQL Profile object로 조회 가능하다.
3. `kind = FOLLOW`의 `source_id`로 실제 `profile_follow` source를 찾을 수 있다.
4. source의 Followee가 저장된 Recipient와 일치한다.
5. source의 Follower인 Related Profile을 **Recipient Profile을 viewer로** 조회할 수 있다.

Connection query는 이 predicate를 SQL에서 적용한 뒤 `id DESC` keyset limit을 적용한다. page를 먼저 가져온 뒤 hidden row를 애플리케이션에서 버리지 않는다. Unread count, Node와 Read mutation도 같은 source/visibility predicate를 재사용한다. 이로써 hidden row가 short page, 잘못된 page info, badge drift나 Read side channel을 만들지 않는다.

opaque cursor에는 마지막 Notification DB UUID를 담고 다음 page는 `id < cursor`를 사용한다. 기존 UUIDv8과 신규 UUIDv7은 같은 millisecond timestamp 위치 뒤에 random tail을 사용하므로 함께 정렬할 수 있지만 같은 millisecond의 생성 순서와 새 item의 page 배치는 보장하지 않는다. 이 제한은 현재 제품 범위에서 허용한다. 반환되는 `FollowNotification`은 Related Profile이 실제로 조회 가능한 경우뿐이므로 `profile`은 non-null이다. raw `kind`, `source_id`와 `data`는 API에 노출하지 않는다.

Read update는 membership과 visible predicate를 같은 SQL 경계에 포함하고 `read_at = coalesce(read_at, now())` 의미로 최초 시각을 보존한다. payload의 Recipient Profile을 함께 반환해 Relay가 item `readAt`과 정확한 Profile의 count를 함께 갱신할 수 있게 한다.

### unavailable 상태와 후속 cleanup

위 공통 visible predicate를 만족하지 않는 item은 connection, Unread count, Node와 Read mutation에서 모두 없는 것으로 취급한다. generic item, `profile: null` Follow fallback, 이름·handle snapshot 또는 client-side filtering을 제공하지 않는다.

DB row와 기존 `read_at`은 비동기 cleanup 전까지 남을 수 있다. cleanup 전에 visibility가 회복되면 같은 row가 기존 Read 상태로 다시 나타날 수 있다. 이 임시 상태는 첫 delivery에서 허용한다.

도메인 방향은 source가 없거나 Recipient와 일치하지 않거나 Related Profile이 Recipient 기준으로 unavailable이 되면 item을 비동기적이고 idempotent하게 삭제하는 것이다. Recipient Profile 자체의 일시 비활성화·정지만으로 item을 삭제할지는 재활성화 의미와 함께 `PROD-328`에서 결정한다. 원인별 event, message queue 또는 fallback scan, retry, worker, 허용 지연과 대량 처리는 별도 `PROD-328`의 Issue → OpenSpec → Implementation 흐름이 소유한다. `PROD-328`은 이 change의 task나 archive gate가 아니다.

### Follow 알림 목록 UI와 Relay 경계

`PROD-277`의 `/notifications`는 모바일과 Web이 공유하는 단일 목록이다. 상단에는 Figma 화면 구조에 맞춘 `알림` 제목과 44px 알림 설정 control을 두되, 설정 route가 없는 현재 slice에서는 `알림 설정 (준비 중)`으로 식별되는 disabled placeholder로 표시한다. `모두`·`멘션` 탭이나 단독 section heading, 날짜별 heading은 추가하지 않는다. Follow item은 Figma Like 알림 행의 정보 위계를 Follow에 맞게 적용한다. 행의 왼쪽 28px kind icon과 오른쪽 콘텐츠 column은 같은 상단선에 놓고, 콘텐츠의 첫 Avatar row에는 28px initials Avatar와 오른쪽 상대 시각을 둔 뒤 `OOO님이 팔로우했습니다` 문구를 그 아래에 표시한다. inline 맞팔로우, 본문 snippet과 빈 action 영역은 만들지 않는다. 현재 `FollowNotification.profile`이 단수이고 Profile image field가 없으므로 복수 사용자 집계와 이미지 avatar를 client에서 합성하지 않는다. 복수 사용자 문구와 겹친 avatar는 server aggregation 계약이 생기는 후속 이슈가 소유한다.

Avatar와 본문은 모두 `Profile.relativeHandle`의 Profile route를 가리키는 실제 link다. 활성화는 즉시 navigation을 시작하며 Read mutation의 pending·실패·재시도는 navigation을 지연하거나 취소하거나 되돌리지 않는다. `readAt = null` item은 `surface`, Read item은 `card` 배경을 사용하고 접근성 label에 Unread 상태를 포함한다. client Read mutation과 Unread count cache 갱신은 `PROD-372`, shell badge surface는 `PROD-324`가 소유한다.

route query는 selected Profile을 target으로 `store-and-network` fetch를 수행한다. 초기 loading/error/retry/empty를 구분하고 native에는 pull-to-refresh를 제공한다. Web에는 별도 in-app refresh control을 만들지 않으며 browser의 표준 document reload가 새 Relay Environment에서 query를 다시 실행한다. 목록은 한 번에 20개씩 Relay connection pagination을 사용하며, 다음 page 요청 중 중복 호출을 막고 실패해도 기존 item을 유지한 채 같은 위치에서 재시도한다. Relay가 edge 누적과 중복 제거를 소유하고 route state는 edge를 수동 병합하지 않는다. selected Profile 전환은 actor별 Relay Environment/Store 재생성과 query target 변경으로 격리한다.

목록은 API에서 반환한 visible item만 표시한다. unavailable item을 client가 다시 판정하거나 generic fallback, snapshot 또는 client-side filtering으로 표현하지 않는다. `PROD-324`는 shell surface, count cap, 접근성, loading/error와 Profile 전환 cache 경계를 결정하고 구현 전에 `web-app-shell` delta와 관련 design/decisions를 추가한다.

## Verification Strategy

- `PROD-325`: migration/DB integration으로 kind enum, 단일 table, Recipient FK, loose source ID, JSONB default, unique constraint와 조회 index를 검증한다.
- `PROD-274`: storage test로 source-only create/delete, Recipient/Related Profile 파생, Local/Remote Follower, existing/concurrent idempotency를 검증한다.
- `PROD-275`: schema/resolver test로 kind-aware Node resolution, batch 순서, role-independent membership, 비선택 Profile 접근과 공통 SQL visible predicate를 검증한다.
- `PROD-352`: connection test로 `id DESC` keyset pagination과 limit 전 visible filtering을 검증한다.
- `PROD-351`: count test로 공통 predicate를 만족하는 visible Unread item만 계산하는지 검증한다.
- `PROD-350`: mutation test로 Node와 같은 hidden predicate, 최초 `readAt`, 반복·동시 Read와 payload를 검증한다.
- `PROD-276`: action test로 allow/deny/evaluator error/create·delete storage failure, integration 재진입, 정상 source cleanup과 origin-neutral port 호출을 검증한다.
- `PROD-277`·`PROD-324`: 정상 item UI 계약을 Storybook interaction/a11y, Relay cache integration과 결정된 platform smoke로 검증한다.
- `PROD-278`: 실제 Local Follow/Unfollow action을 사용하는 Web E2E와 관련 workspace 검증을 통과한 뒤 archive 전후 strict validation을 실행한다.

## Risks / Trade-offs

- [Follow commit 뒤 Notification 호출 전에 process가 종료되면 item이 유실될 수 있다] → 첫 delivery는 best-effort임을 명시하고 자동 retry를 제공하지 않는다. durable delivery가 필요해지면 별도 message queue/outbox change로 다룬다.
- [공통 visible predicate를 만족하지 않는 row가 물리적으로 남을 수 있다] → API의 list/count/Node/Read는 같은 predicate로 숨기고, invalid source·unavailable Related Profile의 장기 비동기 정리와 Recipient inactivity 정책은 `PROD-328`로 분리한다.
- [hidden row를 조회 후 버리면 page가 짧아지고 count와 불일치한다] → 공통 visible predicate를 SQL에서 limit 전에 적용하고 모든 API 표면이 같은 predicate를 사용한다.
- [Account membership 권한과 selected Profile UI scope를 혼동할 수 있다] → resolver는 membership만 검사하고 client query/cache는 selected Profile ID를 명시하는 test를 각각 둔다.
- [JSONB가 범용 extension framework가 될 수 있다] → kind별 최소 type validation만 두고 FOLLOW는 `{}`, GIN index와 snapshot은 추가하지 않는다.
- [UI 구현이 공통 API 계약과 다른 cache 또는 interaction을 선택할 수 있다] → `PROD-277`·`PROD-324`의 첫 task를 OpenSpec 갱신 gate로 두고 구현·검증을 그 뒤에 진행한다.

## Migration Plan

1. `PROD-325`에서 additive `notification` schema, `notification_kind`, Recipient FK, source uniqueness와 조회 index를 배포한다. 기존 Notification UUIDv8과 `ProfileFollow`는 backfill하지 않는다.
2. `PROD-274` 저장 경계와 `PROD-275` GraphQL/Node·공통 visible 조회 기반을 schema 위에 병렬로 구현한다.
3. `PROD-275` 뒤 `PROD-352` connection, `PROD-351` Unread count와 `PROD-350` Read mutation을 독립 PR로 구현한다.
4. `PROD-281`의 공용 ProfileFollow action과 `PROD-274`가 준비되면 `PROD-276` create/delete source integration을 연결한다.
5. API가 안정되면 `PROD-277` 목록과 `PROD-324` badge를 병렬로 배포한다.
6. `PROD-278`에서 vertical E2E, canonical 문서/task sync와 archive 전후 validation을 완료한다.

애플리케이션 rollback은 additive table을 유지하고 Notification source 호출·API·UI만 이전 버전으로 되돌린다. 데이터가 생성된 뒤 table을 자동 drop하는 down migration은 사용하지 않는다. schema 자체를 제거해야 한다면 Notification 쓰기를 먼저 중단하고 데이터 보존/삭제 결정을 별도 migration으로 수행한다.

## Open Questions

현재 공통 저장·API 계약의 구현을 막는 열린 질문은 없다. 목록과 badge의 세부 UX는 소유 이슈인 `PROD-277`·`PROD-324`가 구현 전에 결정한다. 실제 Mute/Block 연결은 `PROD-327`, invalid source·unavailable Related Profile item의 비동기 삭제 방식과 Recipient inactivity cleanup 여부는 `PROD-328`, delivery queue/retry와 다른 Notification kind는 각각 별도 Issue → OpenSpec 흐름에서 결정한다.
