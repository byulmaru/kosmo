## Why

production `/profile-edit` route와 server-authoritative selected Profile 편집 권한은 이미 제공되지만, 인증 사용자가
full Web sidebar, compact Web icon rail과 mobile drawer에서 이 화면으로 이동할 진입점이 없다. PROD-541에서
준비되지 않은 generic `/menu` placeholder를 제거한 뒤 남은 navigation 공백을 실제 route와 권한 계약에 맞춰
복원한다.

## What Changes

- 편집 가능한 selected Profile이 있는 인증 사용자에게 shared navigation의 `프로필` 바로 다음에
  `UserRoundPen` 아이콘과 `프로필 편집` label을 가진 `/profile-edit` 링크를 표시한다.
- full Web sidebar, compact Web icon rail과 mobile drawer에서 같은 항목을 제공하고 exact route active state와
  mobile drawer navigation 후 close 동작을 기존 shell navigation으로 제공한다.
- nullable `selectedProfileForEdit`을 노출 기준으로 재사용하고 결과가 없으면 disabled placeholder 없이 항목을
  숨긴다.
- canonical Profile edit·breakpoint 디자인과 `web-app-shell` OpenSpec을 정렬하고 Shell Storybook·component·Web
  E2E로 표시, 미표시, navigation, active state와 drawer close를 검증한다.
- mobile bottom tab, `/profile-edit` form·API·DB, generic `/menu`, Settings 정보 구조, 팔로워 요청 진입점과 새
  Profile 권한 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Linear Contract: [PROD-660](https://linear.app/byulmaru/issue/PROD-660/프로필-편집-진입점을-반응형-내비게이션에-복원한다)
- Linear Implementations: PROD-660; existing route dependency: PROD-492

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: 편집 가능한 selected Profile을 위한 `/profile-edit` shared navigation 진입점, active state와
  mobile drawer close 계약을 추가한다.

## Impact

- `apps/app/src/components/shell/SidebarNavigation.tsx`의 Relay fragment와 shared navigation item
- `apps/app/src/stories/Shell.stories.tsx`의 eligible/ineligible·responsive·active 상태 카탈로그
- `apps/web/e2e/navigation-scroll.e2e.ts`의 full·compact·mobile drawer navigation 검증
- `docs/design/breakpoints.md`, `docs/design/profile-edit.md`와 ADR 0021의 navigation·ownership 정합성
- GraphQL schema, API, DB, migration과 package dependency 변경 없음
