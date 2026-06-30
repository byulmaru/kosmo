## Why

현재 KOSMO 웹 `(tabs)` 셸은 문서 스크롤 기반이라 데스크톱에서 좌측 사이드바와 우측 레일이 중앙 피드 스크롤에 함께 반응할 수 있다. PM 검토 결과 단기 sticky/fixed 패치보다 앱형 shell 구조로 정리하는 방향이 적절하므로, `(tabs)` 셸의 scroll ownership을 명확히 해야 한다.

이 변경은 기존 `md`/`xl` 반응형 shell 단계를 유지하면서, shell chrome은 viewport에 고정되고 중앙 콘텐츠만 내부 scroll container를 소유하는 계약으로 `web-app-shell` 스펙을 갱신한다.

## What Changes

- `(tabs)` 셸을 document/window scroll 기반에서 viewport 고정 app shell + 중앙 콘텐츠 내부 scroll 구조로 전환하는 요구사항을 추가한다.
- 모바일 header, 하단 탭, 데스크톱 sidebar/icon rail, 우측 rail이 중앙 콘텐츠 스크롤과 함께 움직이지 않아야 한다는 계약을 명시한다.
- `RightRail`은 document sticky에 의존하지 않고 shell column 안에서 배치되어야 한다.
- 일반 route 이동, 검색 `noScroll`, 게시글 상세 sticky header가 내부 scroll container 기준으로 동작해야 한다.
- 반응형 내비게이션 E2E suite 전체는 `PROD-233` 범위로 남기고, 이 변경은 구현에 필요한 최소 viewport smoke 검증만 포함한다.
- feed/list pagination, 하단 탭 IA 변경, 네이티브 WebView 전용 pull-to-refresh는 제외한다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: `(tabs)` 셸의 scroll ownership, viewport 고정 shell chrome, 중앙 internal scroll container, right rail 배치, route scroll 동작 검증 요구사항을 추가한다.

## Impact

- `apps/web/src/routes/(tabs)/+layout.svelte`
- `apps/web/src/lib/components/BottomTabBar.svelte`
- `apps/web/src/lib/components/SidebarNavigation.svelte`
- `apps/web/src/lib/components/RightRail.svelte`
- `apps/web/src/routes/(tabs)/(protected)/search/+page.svelte`
- `apps/web/src/routes/(tabs)/@[handle]/+layout.svelte`
- `apps/web/src/routes/(tabs)/@[handle]/[postId]/+page@(tabs).svelte`
- `openspec/specs/web-app-shell/spec.md`
- `docs/design/breakpoints.md`
