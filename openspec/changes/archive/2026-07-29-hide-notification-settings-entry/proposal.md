## Why

설정 기능이 아직 공개될 준비가 되지 않았지만 `/notifications` 헤더에는 비활성 설정 control이 노출되어 있어 사용자가 준비되지 않은 진입점을 기대할 수 있다. 설정 공개 범위와 시점이 확정될 때까지 이 affordance를 시각·접근성 트리에서 제거한다.

## What Changes

- `/notifications` 헤더에서 `알림 설정 (준비 중)` disabled control 전체를 제거한다.
- control 제거 뒤에도 `알림` 제목과 헤더의 mobile/Web 정렬·간격을 유지한다.
- 설정 control의 비노출을 UI 테스트 또는 Storybook 검증으로 고정한다.
- `PROD-487`과 PR #390이 소유하는 사이드바 `피드백 보내기` 진입점은 변경하지 않는다.
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

## Impact

- App UI: `apps/app/src/components/notification/NotificationList.tsx`
- Storybook: `apps/app/src/stories/Notifications.stories.tsx`
- OpenSpec: active `notification` capability의 알림 화면 header scenario
- API, GraphQL, Relay data, DB, dependency와 migration 영향은 없다.
- `SidebarNavigation`, `/feedback`, `PROD-487`과 PR #390은 영향 범위에서 제외한다.
