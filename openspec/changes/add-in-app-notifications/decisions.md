## Context

이 기록은 [PROD-273](https://linear.app/byulmaru/issue/PROD-273), canonical Notification Item·Follow Relationship 문서, `add-in-app-notifications` proposal/specs/design과 `PROD-325`~`PROD-278` 구현 이슈 경계를 반영한다. `PROD-323`과 PR #244가 Follow Request를 pending-only 모델로 먼저 정렬했으며, 이번 change는 Follow를 재사용 가능한 Profile-scoped Notification 기반의 첫 sample source로 사용한다.

## Decision Records

### Notification은 하나의 capability와 여러 구현 slice를 공유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 저장, API, source action, 목록, badge와 E2E가 같은 사용자 결과를 만들지만 각각 별도 PR로 전달된다. PR마다 OpenSpec을 만들면 공통 source lifecycle과 Profile 격리 계약이 복제되고, parent 전체를 영구 change로 두면 archive 시점이 불명확해진다.
- Decision Outcome: `notification` 하나의 새 capability와 현재 확정한 `data-model`, `api-platform` delta를 사용한다. 구현은 `PROD-325`, `274`, `275`, `276`, `277`, `324`, `278` heading으로 나누되 모든 slice가 이 change를 공유한다. UI 소유 이슈는 결정을 마친 뒤 같은 change에 requirements/design/decisions를 추가하거나 갱신한다.
- Alternatives Considered: DB/API/UI별 OpenSpec 분리, `PROD-271` Project 전체를 하나의 장기 change로 유지, 기존 `profile` capability에 모든 요구사항 추가.
- Consequences: 각 구현 PR은 자기 Linear 이슈와 검증만 소유하고, 전체 task·canonical 문서 sync와 archive는 마지막 `PROD-278`이 수행한다.
- Confirmation / Follow-up: `tasks.md` 최상위 heading과 Linear 구현 이슈를 1:1로 유지하고 archive gate에서 전체 PR merge를 확인한다.

### Notification Item base와 type-specific extension을 분리한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 공통 Recipient/Read/목록 필드와 type별 source FK를 함께 확장해야 하지만, 하나의 table에 미래 source용 nullable polymorphic FK를 추가하면 type/source correlation이 약해진다.
- Decision Outcome: `notification_item(id, recipient_profile_id, created_at, read_at)` base와 `notification_follow(id, notification_item_id, profile_follow_id)` extension을 둔다. 두 table 모두 UUID v8 surrogate ID와 독립 `TableDiscriminator`를 사용한다. `notification_item_id`와 `profile_follow_id`는 각각 unique다.
- Alternatives Considered: 하나의 wide table과 nullable source FK, polymorphic `source_type/source_id`, shared-primary-key extension, PostgreSQL list partitioning.
- Consequences: GraphQL `NotificationItem` Node identity는 base ID만 사용한다. Follow type과 Related Profile은 extension과 `ProfileFollow.follower_profile_id`에서 파생한다. 미래 type은 별도 extension과 discriminator를 추가한다.
- Confirmation / Follow-up: `PROD-325`가 최신 main에서 미사용 discriminator를 할당하고 schema/migration/relations와 registry uniqueness를 검증한다.

### DB type·Read State enum과 snapshot을 저장하지 않는다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 첫 delivery는 Follow만 지원하며, canonical Notification Type 전체를 선제 migration하거나 read state와 timestamp를 중복 저장하면 drift가 생긴다. unavailable fallback을 위한 이름 snapshot은 개인정보와 stale display 문제를 만든다.
- Decision Outcome: DB Notification type은 type-specific extension 존재로 파생하고, core/API `NotificationType`에는 `FOLLOW`만 등록한다. `read_at = null`을 Unread, non-null을 Read와 최초 Read 시각으로 사용한다. Related Profile 이름·handle snapshot과 base `updated_at`은 저장하지 않는다.
- Alternatives Considered: 모든 canonical type을 DB enum으로 선제 추가, `read_state` enum과 `read_at` 동시 저장, display snapshot 저장.
- Consequences: 후속 type은 enum value와 extension을 같은 change에서 추가해야 한다. UI는 Related Profile을 읽을 수 없으면 type 기반 generic fallback만 표시한다.
- Confirmation / Follow-up: `PROD-325` DB schema test와 `PROD-275` generated schema/API test가 선제 값·snapshot 부재를 검증한다.

### source 삭제를 DB lifecycle로 base까지 전파한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 일반 FK cascade는 parent base에서 child extension 방향으로만 자연스럽게 동작하므로, `ProfileFollow` 삭제가 extension을 지운 뒤 base Notification Item을 orphan으로 남길 수 있다.
- Decision Outcome: base 삭제는 FK cascade로 extension을 지운다. source 삭제는 `profile_follow_id` FK cascade로 extension을 지우고, `notification_follow`의 type-specific cleanup trigger가 base를 삭제한다. deferred integrity constraint는 commit 시 살아 있는 base가 정확히 하나의 지원 extension을 갖도록 검증한다.
- Alternatives Considered: application action에서만 수동 삭제, trigger 없는 ordinary FK, circular FK, list-partitioned base.
- Consequences: raw source delete와 direct mapping delete도 같은 cleanup을 거친다. 다른 domain lifecycle이 실제 `ProfileFollow` row를 삭제하면 동일한 FK 경로를 사용한다. base delete로 child trigger가 재실행하는 parent delete는 zero-row no-op이어야 한다. 미래 type도 같은 integrity/cleanup contract를 제공해야 한다.
- Confirmation / Follow-up: `PROD-325` migration integration test가 source→extension→base, base→extension, direct extension delete와 rollback 경로를 실제 PostgreSQL에서 검증한다.

### source identity와 상관관계는 ProfileFollow row가 소유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Follower/Followee pair uniqueness만 사용하면 Unfollow 뒤 Re-follow의 새 사건을 구분하지 못하고, Recipient/Related Profile을 별도 column으로 복제하면 source와 drift할 수 있다.
- Decision Outcome: uniqueness는 `ProfileFollow.id` source 단위다. 저장 경계는 established `ProfileFollow` 하나만 입력으로 받고 source에서 Followee=Recipient, Follower=Related Profile을 파생하며 Recipient가 Local Profile인지 검증한다. 호출자는 별도 Recipient/Related Profile ID를 전달하지 않는다. 기존 source나 concurrent unique conflict는 기존 item 성공 또는 idempotent no-op으로 정규화한다.
- Alternatives Considered: follower/followee pair uniqueness, Related Profile과 Recipient를 extension에 중복 저장, duplicate conflict를 source action 실패로 반환.
- Consequences: 동일 source 재처리는 item 하나를 유지하고, Unfollow 뒤 새 source ID의 Re-follow는 새 item을 만들 수 있다. 사용자 duplicate Follow는 새 관계가 아니므로 Notification integration을 다시 호출하거나 누락 item을 복구하지 않는다.
- Confirmation / Follow-up: `PROD-274`가 source 기반 파생, Remote Recipient 거부, existing/concurrent source와 Re-follow를 storage test로 검증하고 `PROD-276`이 action-level 재진입을 검증한다.

### Notification 생성은 Follow commit 이후 best-effort로 격리한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Notification을 Follow transaction에 넣으면 정책/저장 오류가 핵심 Follow 결과를 rollback한다. fire-and-forget은 request 종료와 unhandled rejection 때문에 실행 보장이 없고, 현재 범위에는 durable intent/outbox가 없다.
- Decision Outcome: 새 ProfileFollow transaction을 먼저 commit한 뒤 같은 request에서 eligibility와 Notification 저장을 순서대로 await하고 오류를 catch한다. 정책 미연결은 default allow, 명시 deny와 evaluator 오류는 미생성, evaluator 오류는 privacy-safe fail-closed다. 저장 실패도 Follow 성공을 유지한다.
- Alternatives Considered: 동일 transaction 원자성, savepoint, fire-and-forget event, outbox/worker, evaluator 오류 시 fail-open 생성.
- Consequences: commit과 Notification 호출 사이 process 종료 또는 저장 오류로 item이 유실될 수 있고 이번 capability는 자동 복구하지 않는다. Follow response latency에는 eligibility/store await 비용이 포함된다.
- Confirmation / Follow-up: `PROD-276`이 allow, deny, evaluator error, storage failure와 관계 commit 보존을 action test로 검증한다. durable retry가 필요하면 별도 Issue → OpenSpec으로 결정한다.

### Remote compatibility는 materialized source mapping까지만 origin-neutral하다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: Local/Remote Profile이 같은 `ProfileFollow` 모델을 쓰지만, 이번 change에 ActivityPub ingress와 actor materialization을 포함하면 별도 federation capability와 결합된다.
- Decision Outcome: 이미 materialize된 Remote Follower와 Local Followee의 established `ProfileFollow`를 저장 경계에 입력할 때 origin 분기 없이 같은 mapping을 사용한다. ingress, actor materialization, transport와 remote E2E는 요구하지 않는다.
- Alternatives Considered: Local source만 허용, ActivityPub inbound Follow/Undo 전체를 archive gate에 포함.
- Consequences: `PROD-274`와 `PROD-276` target test만 Remote compatibility를 확인하고 대표 E2E는 Local→Local Follow를 사용한다.
- Confirmation / Follow-up: 실제 inbound flow는 `PROD-243`과 그 선행 이슈가 소유한다.

### Notification API는 selected Profile과 Relay Node ownership을 따른다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 같은 Account가 여러 Profile을 운영하므로 Account-scoped inbox나 public Profile field는 다른 identity의 item을 노출할 수 있다. Read 뒤 item과 badge count를 함께 정상화할 payload도 필요하다.
- Decision Outcome: `Profile.notifications`, `Profile.unreadNotificationCount`, `NotificationItem` Node와 `markNotificationRead(input: { id })`를 제공한다. Read payload는 `notificationItem`과 `recipientProfile`을 반환한다. Profile fields는 current selected Profile만 허용하고 다른 Profile은 `PERMISSION_DENIED`, item ID mutation은 없는 ID와 타 Recipient 모두 `NOT_FOUND`, active Profile 부재는 `PERMISSION_DENIED`다. Node loader도 active Recipient로 필터링한다.
- Alternatives Considered: Account root inbox, top-level Notification query/count, payload scalar count만 반환, 다른 Recipient에 별도 forbidden 오류.
- Consequences: 같은 Account의 다른 Profile도 전환 전에는 inbox를 읽을 수 없다. Relay는 payload의 두 Node를 통해 item `readAt`과 Profile count를 함께 갱신한다. raw source ID는 API에 노출하지 않는다.
- Confirmation / Follow-up: `PROD-275` generated schema와 resolver test가 exact field/payload/error/Node visibility를 검증한다.

### UUID ID가 chronology와 cursor tie-breaker를 함께 소유한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: newest-first connection에 `(createdAt, id)`를 사용하면 시간 정렬 UUID가 이미 제공하는 순서를 중복 저장·색인하고 cursor가 복잡해진다.
- Decision Outcome: Notification connection은 `NotificationItem.id DESC` 단일 keyset과 opaque ID cursor를 사용한다. `createdAt`은 표시 값이다. 목록 index는 `(recipient_profile_id, id DESC)`, Unread count는 `recipient_profile_id WHERE read_at IS NULL` partial index를 사용한다.
- Alternatives Considered: `(createdAt DESC, id DESC)` cursor, offset pagination, createdAt 단일 cursor.
- Consequences: 다음 page는 `id < cursor` 경계로 조회하며 새 item은 refresh 후 첫 page에서 나타난다. UUID generation chronology가 깨지지 않는다는 플랫폼 전제를 공유한다.
- Confirmation / Follow-up: `PROD-275`가 동시 insert가 있는 page 경계와 중복/누락을 API test로 검증한다.

### Read는 최초 readAt과 exact Recipient count를 보존한다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: 반복·동시 Read가 timestamp를 덮어쓰거나 count를 두 번 감소시키면 목록과 badge가 불일치한다.
- Decision Outcome: Read update는 active Recipient 조건을 포함하고 `read_at = coalesce(read_at, now())` 의미로 최초 시각을 보존한다. Unread count는 `recipient_profile_id`와 `read_at IS NULL`만 기준으로 매번 계산하며 Related Profile visibility를 필터로 사용하지 않는다.
- Alternatives Considered: client-side count decrement만 사용, 별도 mutable stored counter, 매 Read마다 timestamp 갱신.
- Consequences: 반복·동시 Read는 idempotent하고 unavailable item도 Read/count에 참여한다. source cleanup으로 base가 삭제되면 count에서 자연스럽게 빠진다.
- Confirmation / Follow-up: `PROD-275`가 최초 timestamp, concurrent update, exact count와 unavailable item을 검증한다.

### 목록과 badge의 세부 UX 결정은 구현 소유 이슈로 미룬다

- Decision Date: 2026-07-14
- Status: Accepted
- Context / Problem: `PROD-273`은 공통 저장·API 계약을 확정하지만, Linear는 표시·interaction·navigation·refresh·cache UX를 `PROD-277`, badge UX를 `PROD-324`가 결정하도록 소유권을 분리한다.
- Decision Outcome: 이번 spec-only slice는 Read와 navigation 순서, available item의 실패 표현, refresh/cache 동작, badge cap·접근성·loading/error를 확정하지 않는다. source가 남은 unavailable item의 generic fallback, 이동 불가, Read 가능과 count 참여만 공통 계약으로 고정한다.
- Alternatives Considered: 모든 UI 결정을 `PROD-273`에서 선결정, UI 구현을 별도 OpenSpec change로 분리.
- Consequences: UI 구현 이슈는 코드를 작성하기 전에 선택지를 결정하고 이 change를 갱신해야 한다. 공통 API나 domain behavior를 바꾸는 선택은 해당 구현 PR에서 spec 동기화 없이는 진행할 수 없다.
- Confirmation / Follow-up: `PROD-277`은 `notification` UI requirements/design/decision을, `PROD-324`는 `web-app-shell` delta와 관련 design/decision을 먼저 추가한 뒤 구현·검증한다.

## Remaining Decisions

- 실제 Profile Mute·Profile Block·Domain Block evaluator 연결과 정책별 억제 test는 후속 `PROD-327`의 별도 OpenSpec에서 결정한다.
- source가 남아 있지만 Related Profile이 unavailable인 기존 item의 후속 자동 제거 원인·시점은 `PROD-328`의 별도 OpenSpec에서 결정한다.
- outbox, retry, reconciliation, Push/realtime과 다른 Notification Type은 필요를 소유하는 별도 Linear 이슈와 OpenSpec에서 결정한다.

## Superseded Decisions

- 없음.
