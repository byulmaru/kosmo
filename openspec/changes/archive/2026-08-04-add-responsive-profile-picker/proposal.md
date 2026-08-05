## Why

현재 Web `ProfileSwitcher`는 full sidebar와 compact icon rail에서 같은 dropdown 표현을 사용해 compact 구간의 stacking과 긴 프로필 목록을 안전하게 처리하지 못한다. Web breakpoint별 셸 구조에 맞는 profile picker surface와 스크롤·dismissal 계약을 정의해 프로필 선택과 생성 흐름을 안정적으로 제공한다.

## What Changes

- `full` 이상 Web에서는 닫힌 260px profile summary를 유지하고 프로필 이름 trigger 바로 아래에 연결된 비모달
  overlay picker를 표시한다. picker는 trigger 아래의 프로필 상세와 navigation 위에 paint되며, navigation 위치와
  sidebar·중앙 피드 폭을 유지하면서 chevron과 accessibility expanded 상태로 열림 여부를 표시한다.
- `compact` 이상 `full` 미만 Web에서는 아이콘 레일의 프로필 아바타가 레일 오른쪽 비모달 overlay drawer를 연다.
- compact drawer는 레이아웃 폭을 바꾸거나 backdrop·focus trap을 사용하지 않으며 trigger 재실행, 바깥 클릭, `Escape`, 프로필 선택으로 닫힌다.
- `< compact` mobile Web drawer의 이름·chevron trigger는 닫힘에 아래 방향, 열림에 위 방향을 표시하고
  기존 trigger geometry를 유지한다.
- full·compact Web picker는 기존 viewport 여백 계산 안에서 최대 430px로 제한하고, 프로필 목록만 스크롤하며
  새 프로필 추가 액션·생성 폼은 고정 footer에 유지한다.
- full·compact Web picker는 별도 menu keyboard model이나 초기 focus 이동 없이 일반 버튼과 브라우저 기본
  `Tab`·`Enter`·`Space` 동작을 사용한다. Full Web에서 summary link로 focus가 이동하면 overlay를 닫고 link focus를
  유지하며, `Escape` close와 trigger focus 복원도 유지한다.
- 기존 프로필 선택·생성·실패 상태와 Relay actor 전환 계약을 유지한다.
- 이 change에서 도입했던 full·mobile Web trigger의 6px 하향 transform은 후속 `PROD-541`에서 supersede되어
  제거됐다. archive와 spec sync는 현재의 transform 없는 수직 중심 정렬을 유지하며 이전 보정을 복원하지 않는다.
- full·mobile Web trigger hitbox·picker anchor·navigation geometry, Android/iOS picker, GraphQL·Relay cache 계약,
  공용 Dropdown 전환과 별도 오류·Storybook 확장은 변경하지 않는다.

## Authority / Provenance

- Canonical: `docs/design/breakpoints.md`, `docs/design/figma.md`
- Linear Contract: `PROD-238`; 후속 supersession: `PROD-541`
- Linear Implementations: `PROD-238`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Web breakpoint별 profile picker surface, dismissal, 내부 스크롤과 기존 선택·생성 흐름 보존 요구사항을 추가한다.

## Impact

- Web 앱 셸 profile picker와 surface 배치: `apps/app/src/components/shell/ProfileSwitcher.tsx`, `apps/app/src/components/shell/SidebarNavigation.tsx`, 필요 시 `apps/app/src/components/shell/UniversalShell.tsx`
- 가장 가까운 fixture·회귀 검증: `apps/app/src/stories/Shell.stories.tsx`, 기존 `apps/web/e2e/profile-switcher.e2e.ts`
- 호환성 stop gate: active `add-shell-responsive-breakpoints`의 이전 compact popover delta를 이 change에 흡수하지 않고, 최종 active spec sync·archive 전에 최신 drawer 계약으로 정렬됐는지 확인
- Canonical 디자인 계약: `docs/design/breakpoints.md`
- GraphQL schema, mutation payload, Relay normalization·actor reset·cache 정책과 패키지 의존성에는 영향이 없다.
