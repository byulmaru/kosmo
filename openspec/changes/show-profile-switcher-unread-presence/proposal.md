## Why

PROD-643은 열린 Profile picker의 숫자 없는 Unread 존재 dot을 Production에 연결했다. 이후 DSN-40과
PROD-855는 닫힌 trigger의 Other Unread indicator와 열린 non-selected 행의 숫자 badge를 최신 공용 UI
계약으로 확정했다. 기존 Profile별 `unreadNotificationCount`와 Profile 전환 lifecycle은 유지하면서 이 최신
표시 계약을 실제 Web·Android·iOS ProfileSwitcher에 동기화해야 한다.

## What Changes

- 닫힌 `full`·`drawer` trigger는 다른 Profile에 Unread가 있을 때 chevron 옆에 8px action-primary dot을
  표시한다.
- 닫힌 `compact` trigger는 같은 조건에서 avatar 우상단에 canvas 1px halo가 있는 12px dot을 표시한다.
- picker가 열리면 닫힌 indicator를 숨기고, Unread가 있는 non-selected Profile 행 오른쪽에 24px 숫자 badge를
  표시한다. `1`~`9`는 실제 값, `10` 이상은 `9+`로 표시하며 selected 행은 기존 check를 유지한다.
- indicator와 badge는 접근성 트리에서 숨기고, Profile option의 accessible name에는 정확한 count 대신
  `읽지 않은 알림 있음`만 유지한다.
- 기존 Profile 선택·생성, navigation guard, actor reset, selected Profile 셸 badge와 알림 목록 수렴 계약은
  변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/accessibility.md`, `docs/design/colors.md`,
  `docs/domain/objects/notification.md`
- Linear Contract: `PROD-643`, `DSN-40`, `PROD-786`
- Storybook·공용 UI 선행 구현: `PROD-855`
- Production 구현·통합 검증: `PROD-786`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: ProfileSwitcher의 닫힌 Other Unread indicator와 열린 Profile별 숫자 badge 계약을 추가한다.

## Impact

- Production 표시: `apps/app/src/components/shell/ProfileSwitcher.tsx`,
  `apps/app/src/components/profile/ProfilePicker.tsx`
- 공용 UI 정합성: `apps/app/src/components/shell/ProfileSwitcherTarget.tsx`
- 검증: `apps/app/src/stories/patterns/ProfileSwitcher.stories.tsx`,
  `apps/app/src/stories/patterns/Shell.stories.tsx`, `apps/web/e2e/profile-switcher.e2e.ts`
- GraphQL schema·resolver, DB·migration, package dependency와 기존 셸 badge controller는 변경하지 않는다.
