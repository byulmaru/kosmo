## Why

production `/profile-edit` route와 server-authoritative selected Profile 편집 권한은 이미 제공되지만, Figma의
sidebar Profile 요약에 있던 편집 진입점이 임시 제거 뒤 복원되지 않았다. 최초 PROD-660 구현은 이 요구를
shared navigation row로 해석해 full·compact·drawer에 별도 항목을 추가했지만, 실제 제품 의도는 향후
멀티프로필 전환을 담을 오른쪽 mini-profile 묶음 바로 아래의 작은 노란 `편집` action이다.

## What Changes

- 편집 가능한 selected Profile이 있는 인증 사용자에게 full Web sidebar와 shared mobile drawer의 expanded
  ProfileSwitcher 요약 안에 `/profile-edit` action을 표시한다.
- action은 오른쪽 mini-profile 이미지 묶음 바로 아래에 우측 정렬하며, Figma의 기존 Profile 편집 button과
  primary/sm primitive를 따라 `72x32`, primary 배경, `radius.sm`, `편집` label을 사용한다.
- Web에서는 시각 영역과 같은 `72x32 CSS px` target을 사용하고, iOS·Android에서는 시각 영역을 유지한 채
  각각 최소 `44pt`·`48dp` 높이의 투명 입력 slot을 제공한다.
- nullable `selectedProfileForEdit`을 노출 기준으로 재사용하고, 결과가 없으면 disabled placeholder 없이
  action을 숨긴다. action은 accessible name `프로필 편집`, exact route page-current semantics와 mobile drawer
  navigation 후 close 동작을 제공한다.
- 잘못 추가된 `UserRoundPen` 주요 navigation row와 그 full·compact·drawer 테스트·문서를 제거한다. compact Web
  icon rail, mobile bottom tab과 우측 레일에는 대체 진입점을 추가하지 않는다.
- `/profile-edit` form·API·DB·Media, 공개 ProfileHero 편집 button, generic `/menu`, 실제 멀티프로필 전환 기능과
  새 Profile 권한 정책은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/decisions/0021-profile-edit-selected-owner-route-boundary.md`,
  `docs/design/profile-edit.md`, `docs/design/breakpoints.md`, `docs/design/accessibility.md`
- Figma: [`WebSidebar` node 901:610](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=901-610),
  [`ProfileHero` edit button node 560:453](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=560-453),
  [`Button` primary/sm node 271:3](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=271-3)
- Linear Contract: [PROD-660](https://linear.app/byulmaru/issue/PROD-660/사이드바-프로필-영역에-프로필-편집-진입점을-복원한다)
- Linear Implementations: PROD-660; existing route dependency: PROD-492

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: `/profile-edit` 진입점을 responsive navigation row가 아니라 full sidebar와 mobile drawer의
  expanded ProfileSwitcher 요약 action으로 제공하는 계약으로 수정한다.

## Impact

- `apps/app/src/components/shell/ProfileSwitcher.tsx`의 Relay fragment, expanded Profile summary와 action geometry
- `apps/app/src/components/shell/SidebarNavigation.tsx`의 잘못된 navigation row·eligibility 제거
- `apps/app/src/stories/Shell.stories.tsx`의 eligible/ineligible·full·drawer·compact 제외 카탈로그
- `apps/web/e2e/navigation-scroll.e2e.ts`의 full·mobile drawer navigation과 compact 비노출 검증
- `docs/design/breakpoints.md`, `docs/design/profile-edit.md`와 `web-app-shell` OpenSpec 정합성
- GraphQL schema, API, DB, migration과 package dependency 변경 없음
