## Why

설정 기능이 아직 공개될 준비가 되지 않았지만 `/notifications` 헤더에는 비활성 설정 control이, 사이드바에는 실제 설정 화면으로 이어지지 않는 `프로필 설정` row가 노출되어 있다. 사이드바의 `팔로워 요청`도 받은 요청 관리 화면 대신 generic `/menu` placeholder로 이동한다. 준비되지 않은 동작에 대한 기대와 혼선을 막기 위해 현재 동작하지 않는 진입점과 placeholder route를 임시로 제거한다.

팔로우 요청의 pending 모델과 받은 요청 목록·승인·거절 API는 이미 존재한다. 이 change는 그 계약을 삭제하지 않고 App 진입점만 숨기며, 실제 받은 요청 UI와 기존 Lucide `UserRoundPlus` 아이콘을 사용한 진입점 복원은 `PROD-566`으로 분리한다.

## What Changes

- `/notifications` 헤더에서 `알림 설정 (준비 중)` disabled control 전체를 제거한다.
- control 제거 뒤에도 `알림` 제목과 헤더의 mobile/Web 정렬·간격을 유지한다.
- full Web sidebar, compact Web rail과 mobile drawer에서 `프로필 설정`과 `팔로워 요청` row를 제거한다.
- 선택한 Profile의 실제 route로만 이동하는 `프로필` 항목이 `/menu` 임시 href에 의존하지 않도록 정리한다.
- generic `/menu` placeholder route와 positive route smoke를 제거하고, PR #404가 추가한 개인정보 처리방침 링크를 full Web 우측 레일의 보조 위치로 옮긴다.
- full Web은 우측 레일 최하단의 muted text로 공개 `/privacy` route를 연결하고, compact Web과 mobile Web·Android/iOS drawer에는 해당 진입점을 표시하지 않는다.
- 가입·로그인 온보딩 안의 추가 개인정보 처리방침 진입점은 후속 범위에서 결정한다.
- full Web sidebar와 mobile drawer의 ProfileSwitcher 닉네임에 적용된 하향 보정을 제거해 nickname·chevron을 trigger 수직 중심에 정렬하고 compact avatar geometry는 유지한다.
- `PROD-487`과 PR #390이 소유하는 `피드백 보내기`의 label·link·동작은 유지하되 사이드바 아이콘을 Lucide `Mail`로 교체한다.
- mobile Web·Android/iOS drawer의 중복 `글쓰기` 버튼을 제거하고 하단 5탭의 `/compose` 진입점은 유지한다. compact Web icon rail의 글쓰기도 유지한다.
- full·compact·mobile drawer의 Lucide `LogOut` glyph stroke를 주변 navigation icon과 같은 weight로 보강하되 로그아웃 label·동작·target은 유지한다.
- 기존 `프로필`·`북마크`·로그아웃은 유지한다.
- 설정 화면, 받은 팔로우 요청 UI, 새 redirect·404 화면과 향후 `설정 & 지원` 드롭다운은 추가하지 않는다.
- 하단 5탭 구성, compact Web 글쓰기와 `/compose` route를 변경하지 않는다.

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
- `web-app-shell`: 준비되지 않은 `프로필 설정`·`팔로워 요청` 진입점을 모든 responsive surface에서 비노출하고 generic `/menu` placeholder route를 제거하며, ProfileSwitcher 중심 정렬, `피드백 보내기`의 `Mail` 아이콘, mobile drawer의 중복 글쓰기 제거와 `LogOut` glyph weight 정렬을 적용한다. 공개 `/privacy` 진입점은 full Web 우측 레일 최하단에만 유지하고 compact·mobile shell에는 표시하지 않는다.
- `universal-expo-client`: Android/iOS/Web 공용 core route parity 목록에서 삭제된 `/menu` placeholder를 제거한다.

## Impact

- App UI: `apps/app/src/components/notification/NotificationList.tsx`
- App shell UI: `apps/app/src/components/shell/SidebarNavigation.tsx`, `apps/app/src/components/shell/ProfileSwitcher.tsx`, `apps/app/src/components/shell/RightRail.tsx`, `apps/app/src/components/shell/UniversalShell.tsx`
- App route: `apps/app/src/app/(tabs)/(protected)/menu.tsx`
- Storybook: `apps/app/src/stories/Notifications.stories.tsx`, `apps/app/src/stories/Shell.stories.tsx`
- Web E2E: `apps/web/e2e/auth-routes.e2e.ts`
- OpenSpec: active `notification`, `web-app-shell`, `universal-expo-client` capability와 `add-web-openpanel-product-analytics`의 개인정보 처리방침 requirement
- API, GraphQL, Relay data, DB, dependency와 migration 영향은 없다.
- `/feedback` route, feedback label·link·접근성 의미와 전달 동작은 영향 범위에서 제외하고 sidebar glyph만 변경한다. PR #390이 미병합인 동안 구현 PR은 `main -> PROD-487 -> prod-541` 순서로 stack한다.
- Child는 parent `add-web-feedback-slack-delivery`의 feedback requirement를 수정하지 않는다. `Mail` glyph는 PROD-541의 sidebar 비노출 requirement가 소유하며 child archive는 PROD-487 production smoke·archive와 독립적으로 판단한다.
