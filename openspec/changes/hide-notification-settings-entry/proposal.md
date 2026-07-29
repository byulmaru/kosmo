## Why

설정 기능이 아직 공개될 준비가 되지 않았지만 `/notifications` 헤더에는 비활성 설정 control이, 사이드바에는 실제 설정 화면으로 이어지지 않는 `프로필 설정` row가 노출되어 있다. 설정 공개 범위와 시점이 확정될 때까지 두 affordance를 시각·접근성 트리에서 제거한다.

## What Changes

- `/notifications` 헤더에서 `알림 설정 (준비 중)` disabled control 전체를 제거한다.
- control 제거 뒤에도 `알림` 제목과 헤더의 mobile/Web 정렬·간격을 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정` row를 제거한다.
- 두 설정 control의 비노출을 기존 Storybook 검증 표면에서 고정한다.
- `PROD-487`과 PR #390이 소유하는 사이드바 `피드백 보내기`, `/feedback`과 설정이 아닌 기존 메뉴는 변경하지 않는다.
- 설정 화면·기능·route, 대체 아이콘, 향후 `설정 & 지원` 드롭다운은 추가하거나 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/accessibility.md`, `docs/design/breakpoints.md`
- Linear Contract: `PROD-541`
- Linear Implementations: `PROD-541` (별도 구현 자식 없이 이 단일 이슈가 OpenSpec, 구현, 검증과 archive를 소유한다.)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: 설정 기능 공개 전 `/notifications` 헤더에서 설정 control을 표시하던 기존 요구사항을 비노출 요구사항으로 변경한다.
- `web-app-shell`: 설정 기능 공개 전 sidebar navigation의 `프로필 설정` row를 모든 responsive surface에서 비노출하고 피드백과 비설정 메뉴를 유지하는 요구사항을 추가한다.

## Impact

- App UI: `apps/app/src/components/notification/NotificationList.tsx`
- App shell UI: `apps/app/src/components/shell/SidebarNavigation.tsx`
- Storybook: `apps/app/src/stories/Notifications.stories.tsx`, `apps/app/src/stories/Shell.stories.tsx`
- OpenSpec: active `notification` capability의 알림 화면 header scenario, active `web-app-shell` capability의 sidebar settings visibility requirement
- API, GraphQL, Relay data, DB, dependency와 migration 영향은 없다.
- `/feedback`, `PROD-487`과 PR #390의 feedback footer 구현은 영향 범위에서 제외한다. PR #390이 미병합인 동안 구현 PR은 `main -> PROD-487 -> prod-541` 순서로 stack한다.
