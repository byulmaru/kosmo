## Why

현재 알림 badge는 selected Profile의 Unread 상태만 보여 주므로 여러 Profile에 접근하는 사용자는 다른 Profile에
Unread 알림이 생겼는지 전환 전에는 알 수 없다. 기존 selected Profile 셸 badge와 알림 목록의 격리 계약을
유지하면서 Profile picker 안에서 각 Profile의 Unread 존재만 알려야 한다.

## What Changes

- selected Profile을 포함해 Unread가 있는 Profile option의 아바타 우상단에 숫자 없는 `12` logical unit
  `accent` dot을 표시한다.
- dot은 접근성 트리와 focus 순서에서 숨기고 Profile option의 accessible name에 정확한 count 대신
  `읽지 않은 알림 있음`만 추가한다.
- 각 Profile option의 서버 제공 `unreadNotificationCount`가 양수인지 여부만 사용하고, count가 `0`이거나
  option을 표시할 수 없으면 잘못된 dot을 표시하지 않는다.
- 기존 Profile 선택 mutation, actor reset, selected Profile의 8px 셸 badge와 알림 목록 수렴 계약은 유지한다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/colors.md`,
  `docs/domain/objects/notification.md`
- Linear Contract: `PROD-643`
- Linear Implementations: `PROD-643`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Profile picker의 Profile별 Unread 존재 표시와 접근성 계약을 추가한다.

## Impact

- Profile picker 표시: `apps/app/src/components/shell/ProfileSwitcher.tsx`
- Relay 생성 산출물: 기존 ProfileSwitcher fragment와 이를 포함하는 query artifact
- 가장 가까운 자동 검증: `apps/app/src/stories/Shell.stories.tsx`,
  `apps/web/e2e/profile-switcher.e2e.ts`
- GraphQL schema, resolver, DB·migration, 패키지 dependency와 기존 셸 badge 구현은 변경하지 않는다.
