## Why

설정 기능이 아직 공개될 준비가 되지 않았지만 `/notifications` 헤더에는 비활성 설정 control이, 사이드바에는 실제 설정 화면으로 이어지지 않는 `프로필 설정` row가 노출되어 있다. 사이드바의 `팔로워 요청`도 받은 요청 관리 화면 대신 generic `/menu` placeholder로 이동한다. 준비되지 않은 동작에 대한 기대와 혼선을 막기 위해 현재 동작하지 않는 진입점과 placeholder route를 임시로 제거한다.

팔로우 요청의 pending 모델과 받은 요청 목록·승인·거절 API는 이미 존재한다. 이 change는 그 계약을 삭제하지 않고 App 진입점만 숨기며, 실제 받은 요청 UI와 기존 Lucide `UserRoundPlus` 아이콘을 사용한 진입점 복원은 `PROD-566`으로 분리한다.

## What Changes

- `/notifications` 헤더에서 `알림 설정 (준비 중)` disabled control 전체를 제거한다.
- control 제거 뒤에도 `알림` 제목과 헤더의 mobile/Web 정렬·간격을 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정`과 `팔로워 요청` row를 제거한다.
- 선택한 Profile의 실제 route로만 이동하는 `프로필` 항목이 `/menu` 임시 href에 의존하지 않도록 정리한다.
- 사용자-facing 소비자가 사라진 generic `/menu` placeholder route와 positive route smoke를 제거한다.
- `PROD-487`과 PR #390이 소유하는 `피드백 보내기`와 `/feedback`, 기존 `프로필`·`북마크`·로그아웃은 유지한다.
- 설정 화면, 받은 팔로우 요청 UI, 새 redirect·404 화면과 향후 `설정 & 지원` 드롭다운은 추가하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/accessibility.md`, `docs/design/breakpoints.md`
- Linear Contract: `PROD-541`
- Deferred UI Contract: `PROD-566`
- Linear Implementations: `PROD-541` (별도 구현 자식 없이 이 단일 이슈가 OpenSpec, 구현, 검증과 archive를 소유한다.)

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `notification`: 설정 기능 공개 전 `/notifications` 헤더에서 설정 control을 표시하던 기존 요구사항을 비노출 요구사항으로 변경한다.
- `web-app-shell`: 준비되지 않은 `프로필 설정`·`팔로워 요청` 진입점을 모든 responsive surface에서 비노출하고 generic `/menu` placeholder route를 제거하되 feedback과 실제 동작하는 진입점을 유지한다.
- `universal-expo-client`: Android/iOS/Web 공용 core route parity 목록에서 삭제된 `/menu` placeholder를 제거한다.

## Impact

- App UI: `apps/app/src/components/notification/NotificationList.tsx`
- App shell UI: `apps/app/src/components/shell/SidebarNavigation.tsx`
- App route: `apps/app/src/app/(tabs)/(protected)/menu.tsx`
- Storybook: `apps/app/src/stories/Notifications.stories.tsx`, `apps/app/src/stories/Shell.stories.tsx`
- Web E2E: `apps/web/e2e/auth-routes.e2e.ts`
- OpenSpec: active `notification`, `web-app-shell`, `universal-expo-client` capability와 PR #390의 선행 feedback navigation requirement
- API, GraphQL, Relay data, DB, dependency와 migration 영향은 없다.
- `/feedback`, `PROD-487`과 PR #390의 feedback footer 구현은 영향 범위에서 제외한다. PR #390이 미병합인 동안 구현 PR은 `main -> PROD-487 -> prod-541` 순서로 stack한다.
- Parent `add-web-feedback-slack-delivery`는 parent head에서 `/menu`를 보존한다. 해당 change를 먼저 archive한 뒤 이 child change가 canonical requirement에서 `/menu` 보존 scenario를 제거하며, archive 직전에 parent canonical 내용을 다시 대조한다.
