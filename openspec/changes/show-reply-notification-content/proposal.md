## Why

공용 Notification presentation과 Storybook 계약은 Reply 본문·미디어·Action Bar를 포함하지만 실제 알림 목록은 아직 legacy 행을 사용해 Reply 내용을 보여주지 않는다. PROD-811은 승인된 presentation을 기존 Relay·Read·권한 경계에 연결해 알림 목록에서 Reply를 안전하게 확인할 수 있게 한다.

## What Changes

- Production Notification 목록이 Follow·FollowRequest·Reaction·Repost에 공용 `NotificationListItemView`를 사용하고 Reply에 `ReplyNotificationPost`를 합성한다.
- Reply는 허용된 본문·Content Warning·미디어·Quote·공용 Post Action Bar를 표시하고, Reply action은 기존 목록용 popup composer를 재사용한다.
- FollowRequest target을 `/follow-requests`로 정렬하고 Reaction·Repost는 기존 Post 표시 정책에 따른 한 줄 미리보기와 첫 미디어를 표시한다.
- Notification 이동·열기와 Best Effort Read를 결속하되 Read 응답이 navigation을 막지 않게 하고, Reply의 Content Warning·Action Bar·composer control은 item navigation·Read와 독립적으로 실행한다.
- 기존 unavailable filtering, Relay pagination·actor cache, 모두 읽음, loading/error/empty 상태를 유지하면서 loading skeleton과 실제 Production Storybook 계약을 새 행에 맞춘다.
- Notification grouping, server GraphQL schema·resolver 변경, 새 Reply composer 또는 popup lifecycle, Post 공개 범위·Content Warning·미디어 정책 변경은 추가하지 않는다. 기존 `ReplyNotification.post`와 Post fragment를 Production consumer에서 확장해 사용한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/notification.md`, `docs/design/notifications.md`, `docs/design/accessibility.md`, `docs/design/breakpoints.md`
- Linear Contract: [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다), [DSN-42](https://linear.app/byulmaru/issue/DSN-42/figma-notificationpost-presentation을-시각-리디자인한다)
- Linear Implementations: [PROD-811](https://linear.app/byulmaru/issue/PROD-811/답글-알림에서-답글-본문을-미리-볼-수-있게-한다); 선행 공용 UI [PROD-884](https://linear.app/byulmaru/issue/PROD-884/dsn-42-notification-presentation을-공용-ui와-storybook으로-이관한다)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: selected Profile의 Notification 목록 presentation, Reply content, target navigation과 Read interaction 계약을 승인된 공용 UI에 맞게 변경한다.

## Impact

- `apps/app/src/components/notification`: 종류별 Relay adapter, 공용 presentation 합성, Reply Post, 목록 provider와 loading state
- `apps/app/src/stories/screens/Notifications.stories.tsx`: 실제 Production 목록의 Relay fixture와 interaction 검증
- `openspec/specs/notification/spec.md`: archive 시 새 presentation·Reply content·navigation·Read 계약으로 동기화
- Client Relay fragment와 실제 Production query가 기존 `ReplyNotification.post`의 Post presentation field를 소비한다. Server GraphQL schema·resolver, database, Notification 생성 lifecycle과 새 dependency에는 영향이 없다.
