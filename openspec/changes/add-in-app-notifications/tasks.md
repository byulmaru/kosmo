## 1. PROD-325 Notification Item 테이블 스키마와 무결성 제약을 도입한다

- [ ] 1.1 `NotificationItems`와 `NotificationFollows`의 미사용 UUID v8 discriminator, base/type-specific Drizzle table, exports와 relations를 추가하고 `notification_item`에는 Recipient·createdAt·nullable readAt만 저장한다.
- [ ] 1.2 `notification_follow`의 unique item/source FK, Recipient 목록 index, Unread partial index, deferred extension integrity와 source cleanup trigger를 additive migration에 반영한다.
- [ ] 1.3 migration integration test로 base와 extension 동시 생성, 직접 duplicate source 거부, source→extension→base cascade, base→extension cascade, direct extension delete와 trigger zero-row 재진입을 검증한다.
- [ ] 1.4 DB schema check와 migration 검증으로 미래 type enum·nullable source·snapshot이 선제 추가되지 않았고 Drizzle schema와 migration이 decisions와 일치하는지 확인한다.

## 2. PROD-274 Follow Notification의 source·Recipient 저장 경계를 제공한다

- [ ] 2.1 established `ProfileFollow`에서 Followee Recipient, Follower Related Profile을 파생하고 Local Recipient만 허용하는 Follow Notification 저장 경계를 구현한다.
- [ ] 2.2 base와 extension을 한 transaction에서 생성하고 existing source 또는 concurrent unique conflict를 기존 item 성공이나 idempotent no-op으로 정규화한다.
- [ ] 2.3 source에서 Recipient/Related Profile을 정확히 파생하는 동작, Remote Recipient 거부, Local Follower, 이미 materialize된 Remote Follower, 동일 source 재호출과 concurrent create를 service/data-access test로 검증한다.
- [ ] 2.4 target package typecheck/test를 통과시키고 storage 경계가 ActivityPub ingress·transport 또는 future type placeholder를 포함하지 않는지 확인한다.

## 3. PROD-275 선택된 Profile의 알림 목록·읽음·Unread count API를 제공한다

- [ ] 3.1 `NotificationType.FOLLOW`, recipient-filtered `NotificationItem` Node와 nullable Related Profile loader를 추가하고 raw source·snapshot을 노출하지 않는다.
- [ ] 3.2 selected `Profile.notifications`를 `id DESC` opaque cursor connection으로, `Profile.unreadNotificationCount`를 Recipient/readAt-only count로 구현한다.
- [ ] 3.3 `markNotificationRead(input: { id })`가 최초 readAt을 보존하고 `notificationItem`·`recipientProfile` payload를 반환하도록 구현하며 Profile field·Node·mutation별 `PERMISSION_DENIED`/`NOT_FOUND` 경계를 적용한다.
- [ ] 3.4 API test로 page 경계와 concurrent insert, 다른 Account/Profile 격리, Node filtering, 반복·동시 Read, exact count와 source가 남은 unavailable item의 `relatedProfile: null`·Read·count 참여를 검증한다.
- [ ] 3.5 생성 GraphQL schema, API typecheck/test와 관련 lint를 통과시키고 spec의 field, enum, nullability, payload와 error code가 일치하는지 확인한다.

## 4. PROD-276 ProfileFollow 생성에서 Follow 알림을 만든다

- [ ] 4.1 `PROD-281` 공용 ProfileFollow action merge 뒤 새 Local Follow 관계에 공통 Notification eligibility port와 `PROD-274` 저장 port를 연결하고 정책 미연결 기본값을 allow로 둔다.
- [ ] 4.2 Follow transaction commit 뒤 eligibility/store를 같은 request에서 await하고 deny·fail-closed evaluator error·저장 실패를 catch해 Follow 성공을 보존한다.
- [ ] 4.3 동일 source integration 재진입은 성공한 no-op으로 만들고 사용자 duplicate Follow는 integration을 다시 호출하지 않으며, materialized Remote Follower도 origin 분기 없이 같은 port를 사용하게 한다.
- [ ] 4.4 action test로 allow, deny, evaluator error, storage failure, duplicate action, integration 재진입, Remote compatibility와 source deletion cleanup 증거를 검증한다.
- [ ] 4.5 target package typecheck/test와 lint를 통과시키고 fire-and-forget, outbox, retry, backfill 또는 ActivityPub ingress가 추가되지 않았는지 확인한다.

## 5. PROD-277 알림 목록 화면과 항목 읽음·Profile 이동 흐름을 제공한다

- [ ] 5.1 구현 전에 표시 상태, item activation과 Read/navigation 순서, 실패·unavailable 표현, route fetch·refresh·pagination·Profile 전환 cache 선택을 결정하고 `notification` requirements/design/decisions를 갱신한다.
- [ ] 5.2 갱신된 계약에 따라 `/notifications` placeholder를 selected Profile connection을 사용하는 공유 Expo Router/Relay 화면으로 교체한다.
- [ ] 5.3 공통 계약인 unavailable generic fallback·Profile 이동 불가·Read 가능을 포함해 결정된 목록 상태와 interaction을 구현한다.
- [ ] 5.4 Storybook story와 interaction/a11y test로 결정된 정상·오류·긴 텍스트·Profile 전환·unavailable 흐름과 Read 표현을 검증한다.
- [ ] 5.5 app check, Relay compiler, Storybook build/test를 통과시키고 결정된 Android/iOS smoke 항목을 확인한다.

## 6. PROD-324 모든 알림 셸 진입점에 Profile별 Unread badge를 제공한다

- [ ] 6.1 구현 전에 shell surface, count cap, 접근성, loading/error, refresh와 Profile 전환 cache 선택을 결정하고 `web-app-shell` delta 및 관련 design/decisions를 추가한다.
- [ ] 6.2 갱신된 계약에 따라 BottomTabBar, compact/full SidebarNavigation과 mobile drawer가 같은 selected Profile `unreadNotificationCount`를 표시하게 한다.
- [ ] 6.3 Read payload와 Profile 전환이 모든 surface count를 일관되게 갱신하고 unavailable Unread item도 count에 포함하게 한다.
- [ ] 6.4 Storybook interaction/a11y와 Android/iOS smoke로 결정된 shell variant, count, refresh/error, Profile 전환과 Read 후 감소 계약을 검증한다.

## 7. PROD-278 인앱 알림 시스템의 Follow sample 흐름을 Web E2E로 고정하고 OpenSpec을 archive한다

- [ ] 7.1 기존 DB reset/Profile fixture로 Local Follower와 Recipient의 Local Profile A/B를 만들고 Notification 직접 insert 없이 실제 Local Follow action으로 item을 발생시킨다.
- [ ] 7.2 Profile B에서 A의 item·badge 부재, Profile A에서 Unread item·badge와 B 재전환 격리를 확인하고, `PROD-277`·`PROD-324`가 확정한 activation·Read·navigation·badge 계약을 Web E2E로 검증한다.
- [ ] 7.3 각 구현 PR의 migration/DB, core/action, API/schema, Relay/app, Storybook, Android/iOS smoke와 Web E2E target 검증 및 관련 workspace lint/typecheck/test를 통과시킨다.
- [ ] 7.4 canonical Notification Item·Follow 문서와 OpenSpec requirements/decisions/tasks를 실제 구현에 동기화하고 `PROD-327`·`PROD-328` 및 delivery/future type의 별도 후속 경계를 유지한다.
- [ ] 7.5 모든 slice PR merge와 전체 task 완료를 확인한 뒤 `openspec validate add-in-app-notifications --strict`, archive, archive 후 전체 strict validation을 순서대로 통과시킨다.
