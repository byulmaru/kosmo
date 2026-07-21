## Why

Kosmo에는 Notification의 canonical 도메인 계약과 `/notifications` 진입점은 있지만, 이를 실제 저장·API·클라이언트 흐름으로 연결하는 공통 구현 계약이 없다. [PROD-273](https://linear.app/byulmaru/issue/PROD-273)은 재사용 가능한 Profile-scoped 인앱 알림 기반을 정의하고, Follow를 첫 sample source로 끝까지 검증해 이후 source가 같은 경계를 확장할 수 있게 한다.

## What Changes

- Profile을 Recipient로 하는 Notification의 공통 생명주기, source correlation, 생성 정책, 읽음 상태와 권한 계약을 추가한다.
- 첫 kind로 Follow를 지원하고, Local action 또는 verified ActivityPub ingress로 새 established `ProfileFollow`가 생성되는 경우와 중복·Unfollow/Undo·Re-follow가 같은 source mapping과 lifecycle을 사용하는 동작을 정의한다.
- `kind`, FK 없는 `source_id`와 kind-specific `data` JSONB를 가진 단일 `notification` projection, source·Recipient uniqueness와 Recipient inbox 조회 index를 정의한다.
- 로그인 Account가 Account-Profile membership을 가진 Profile의 ID-ordered Relay connection, item 단위 idempotent Read mutation과 visible Unread count API를 사용하게 한다. GraphQL은 공통 `Notification` interface와 kind별 concrete object를 사용하며 selected Profile은 API 권한 조건이 아니고 UI/cache scope에만 사용한다.
- Recipient Profile 자체 visibility, source 존재·Recipient 일치와 Recipient Profile 기준 Related Profile visibility로 구성된 공통 predicate를 만족하지 않는 item은 connection, count, Node와 Read에서 모두 숨긴다. row와 Read 상태는 후속 cleanup 전까지 남을 수 있지만 API는 generic fallback이나 raw source/data를 반환하지 않는다.
- `PROD-277`이 정상 item의 표시·interaction·navigation·refresh·cache UX를 결정하고, `PROD-324`가 badge UX를 결정한 뒤 `/notifications` 목록과 모든 shell badge를 구현한다.
- Notification 저장·정리 실패가 Follow 결과를 바꾸지 않는 best-effort 실패 경계를 추가한다.
- Follow Request Notification 자체는 제외하되, 승인 또는 verified ActivityPub inbound Follow로 새 established `ProfileFollow`가 생성될 때의 Follow Notification integration은 포함한다. 다른 Notification kind, 실제 Mute/Block 정책 연결, invalid source·unavailable Related Profile item의 비동기 물리 삭제와 Recipient inactivity cleanup 정책, ActivityPub actor materialization·transport 재구현·새 protocol compatibility, remote network E2E, historical backfill, outbox/message queue/retry, Push/realtime은 제외한다.

## Capabilities

### New Capabilities

- `notification`: Profile-scoped Notification의 Follow source 생명주기, membership 기반 조회·Read·Unread API, unavailable 숨김과 cross-slice 검증 계약을 다룬다.

### Modified Capabilities

- `data-model`: `notification` 단일 table, `notification_kind` enum, FK 없는 source ID, kind-specific JSONB data, source uniqueness와 Recipient 조회 index를 추가한다.
- `api-platform`: concrete typename 기반 global ID가 kind별 Notification loader로 직접 route되고 row kind·visibility를 검증하는 동작 계약을 추가한다.
- `web-app-shell`: 모든 Android/iOS/Web 셸 알림 진입점에 selected Profile별 숫자 없는 Unread presence dot, 실제 count 접근성 이름과 loading/error/stale·Profile 전환 freshness 계약을 추가한다.

## Impact

- `packages/core`: Notification enum, 단일 Drizzle table/migration, 저장·정책 경계와 ProfileFollow 생성·삭제 public action 연결. verified inbound Follow/Undo도 같은 public core lifecycle을 사용한다.
- `apps/api`: `PROD-275`의 concrete typename 기반 Notification Node resolution·Notification interface/concrete object·공통 visible 조회 기반, `PROD-352`의 Profile connection, `PROD-351`의 visible Unread count, `PROD-350`의 Read mutation과 각 slice의 schema/resolver test.
- `apps/app`: `PROD-277`·`PROD-324`가 구현할 `/notifications` 정상 Follow 목록, item interaction, shell badge와 selected Profile별 Relay cache 갱신.
- `apps/web/e2e`: Local Follow에서 목록·Read·badge·Profile 이동·Unfollow cleanup까지의 vertical flow.
- `packages/fedify`: 기존 verified Follow/Undo listener와 concrete handler가 relation mutation이나 Notification 호출을 중복 구현하지 않고 공통 core lifecycle을 사용한다.
- `PROD-380`: production listener → concrete handler → core action → DB/Notification 흐름의 ActivityPub integration을 검증한다.
- OpenSpec archive는 계약 부모 `PROD-271`이 Local Follow Web E2E, `PROD-380` integration evidence, 전체 task와 canonical 문서 정렬을 검증한 뒤 수행한다. unavailable 비동기 cleanup은 별도 `PROD-328`이 소유하며 이 change의 archive gate가 아니다.
