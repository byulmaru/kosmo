## Why

Kosmo에는 Notification Item의 canonical 도메인 계약과 `/notifications` 진입점은 있지만, 이를 실제 저장·API·클라이언트 흐름으로 연결하는 공통 구현 계약이 없다. [PROD-273](https://linear.app/byulmaru/issue/PROD-273)은 재사용 가능한 Profile-scoped 인앱 알림 기반을 정의하고, Follow를 첫 sample source로 끝까지 검증해 이후 source가 같은 경계를 확장할 수 있게 한다.

## What Changes

- Profile을 Recipient로 하는 Notification Item의 공통 생명주기, source correlation, 생성 정책, 읽음 상태와 격리 계약을 추가한다.
- 첫 type으로 Follow를 지원하고, Local ProfileFollow 생성·중복·Unfollow·Re-follow 및 이미 materialize된 Remote Follower 관계가 같은 source mapping을 사용하는 동작을 정의한다.
- Notification Item과 Follow source를 base/type-specific table로 나누고, Node ID, foreign key/cascade, source uniqueness와 Recipient inbox 조회 index를 정의한다.
- 선택된 Profile의 newest-first Relay connection, item 단위 idempotent Read mutation과 Unread count API를 추가한다.
- `PROD-277`이 목록 표시·interaction·navigation·refresh·cache UX를 결정해 이 change를 갱신한 뒤 `/notifications` Follow 목록을 구현한다. 단, unavailable item의 generic fallback·이동 불가·Read 가능 계약은 공통 경계로 미리 고정한다.
- `PROD-324`가 count cap·접근성·loading/error·Profile 전환 UX를 결정해 이 change의 `web-app-shell` delta를 추가한 뒤 모든 알림 진입점의 Unread badge를 구현한다.
- Notification 정책 평가 오류·deny·저장 실패가 Follow 결과를 바꾸지 않는 실패 경계를 추가한다.
- Follow Request Notification, 다른 Notification Type, 실제 Mute/Block 정책 연결, unavailable item 자동 정리, ActivityPub ingress, historical backfill, outbox/retry, Push/realtime은 제외한다.

## Capabilities

### New Capabilities

- `notification`: Profile-scoped Notification Item의 Follow source 생명주기, eligibility, 조회·Read·Unread API와 cross-slice 검증 계약을 다룬다.

### Modified Capabilities

- `data-model`: Notification Item base table, Follow source table, TableDiscriminator, foreign key/cascade, source uniqueness와 Recipient 조회 index를 추가한다.
- `api-platform`: `NotificationType` enum을 공통 GraphQL enum 등록 계약에 추가한다. `NotificationItem`은 기존 Relay Node identity 규칙을 따른다.

## Impact

- `packages/core`: Notification enum, ID registry, Drizzle table/relation, migration, 저장·정책 경계와 ProfileFollow action 연결.
- `apps/api`: Notification Node/connection, Profile-scoped 목록·Unread count, Read mutation, schema와 resolver/service test.
- `apps/app`: `PROD-277`·`PROD-324`가 이 change를 갱신한 뒤 구현할 `/notifications` 목록, Follow item interaction, shell badge와 Relay cache 갱신.
- `apps/web/e2e`: Local Follow에서 목록·Read·badge·Profile 격리까지의 vertical flow.
- OpenSpec archive는 마지막 통합 이슈인 `PROD-278`이 전체 task와 canonical 문서 정렬을 검증한 뒤 수행한다.
