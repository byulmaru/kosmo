## Why

현재 알림 badge는 selected Profile의 Unread 상태만 보여 주므로 여러 Profile에 접근하는 사용자는 다른 Profile에
Unread 알림이 생겼는지 전환 전에는 알 수 없다. 기존 selected Profile 셸 badge와 알림 목록의 격리 계약을
유지하면서 Profile picker 안에서 각 Profile의 Unread 존재만 안전하게 알려야 한다.

## What Changes

- Profile picker를 열 때 Account가 접근할 수 있는 각 Profile의 서버 제공 `unreadNotificationCount`를 별도
  non-suspending Relay network operation으로 갱신한다.
- selected Profile을 포함해 Unread가 있는 Profile option의 아바타 우상단에 숫자 없는 `12` logical unit
  `accent` dot을 표시한다.
- dot은 접근성 트리와 focus 순서에서 숨기고 Profile option의 accessible name에 정확한 count 대신
  `읽지 않은 알림 있음`만 추가한다.
- 최초 loading·최초 오류·unavailable 상태에는 dot을 숨기고, 갱신 실패에는 같은 Profile ID의 마지막 성공
  상태만 유지하며, 성공 응답에서 사라진 Profile의 상태는 제거한다.
- 요청을 Account와 Relay actor environment generation에 귀속해 close·reopen·actor 교체 뒤 늦게 도착한 결과가
  현재 상태를 덮지 못하게 한다.
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

- `web-app-shell`: Profile picker의 Profile별 Unread 존재 표시, 접근성, 비차단 상태와 actor/request 격리 계약을
  추가한다.

## Impact

- Profile picker query·상태·표시: `apps/app/src/components/shell/ProfileSwitcher.tsx`와 필요한 공용 상태 helper
- Relay 생성 산출물: 별도 Profile별 Unread query의 generated artifact
- 가장 가까운 자동 검증: Profile별 상태 unit test, `apps/app/src/stories/Shell.stories.tsx`,
  `apps/web/e2e/profile-switcher.e2e.ts`
- 기존 API 회귀 검증: `apps/api/tests/integration/graphql/notification.test.ts`
- GraphQL schema, resolver, DB·migration, 패키지 dependency와 기존 셸 badge 구현은 변경하지 않는다.
