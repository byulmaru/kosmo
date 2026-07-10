## Why

`PROD-219`의 초기 방향은 `(tabs)` 셸을 viewport 고정 app shell로 만들고 중앙 콘텐츠만 internal scroll container로 두는 것이었다. 구현 검토와 로컬 smoke 과정에서 이 구조는 피드 바깥의 사이드바, 우측 레일, 빈 레이아웃 영역 위에서는 자연스러운 document scroll이 일어나지 않고, 이를 보완하려면 wheel 이벤트 전달 같은 별도 동작이 필요하다는 점이 확인됐다. 이 보완은 사용자 입력 감각을 해치고 shell 내부 scrollbar도 시각적으로 어색하게 드러난다.

따라서 이 변경은 기존 active `add-web-app-shell-internal-scroll` change를 대체해, document/window scroll을 유지하면서 데스크톱 좌우 rail을 sticky로 고정하는 방향으로 `web-app-shell` 계약을 다시 정한다. `fixed` rail은 장기적으로 필요해질 수 있지만, 지금은 grid flow를 보존하는 sticky 구조를 먼저 구현 기준으로 삼는다.

## What Changes

- active `add-web-app-shell-internal-scroll` OpenSpec change를 제거하고, 새 `add-web-app-shell-sticky-rails` change로 대체한다.
- `(tabs)` 셸의 기본 scroll owner는 document/window로 유지한다.
- 중앙 `main`을 단일 internal scroll container로 만들거나, shell chrome의 wheel 이벤트를 중앙 피드로 인위적으로 전달하지 않는다.
- `md` 이상 좌측 icon rail/full sidebar와 `xl` 이상 `RightRail`은 grid flow 안에서 `position: sticky` 기반으로 viewport에 머무르게 한다.
- 우측 rail 내용이 viewport보다 길어지는 경우에는 rail 내부 overflow를 허용할 수 있지만, 중앙 피드의 scroll ownership과 분리한다.
- 일반 route 이동과 back/forward는 Expo Router/browser의 document scroll 정책을 따르고, 검색 화면의 query-only navigation은 현재 scroll/focus를 유지한다.
- 반응형 내비게이션 E2E suite 전체는 `PROD-233` 범위로 남기고, 이 변경은 구현에 필요한 viewport smoke 검증만 포함한다.
- feed/list pagination, 하단 탭 IA 변경, native 전용 pull-to-refresh/overscroll 정책은 제외한다.

## Dependencies

- `add-shell-responsive-breakpoints`의 `md`/`xl` 3단계 shell 모델을 전제로 한다. 이 change는 해당 breakpoint 계약을 다시 설계하지 않고, scroll ownership과 rail positioning 정책만 조정한다.
- 기존 active `add-web-app-shell-internal-scroll` change는 이 change로 supersede한다. 두 change를 동시에 archive하지 않는다.

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: `(tabs)` 셸의 document scroll ownership, sticky desktop rails, 우측 rail overflow 경계, route scroll 정책, viewport smoke 검증 요구사항을 추가한다.

## Impact

- `apps/app/src/components/shell/UniversalShell.tsx`
- `apps/app/src/components/shell/BottomTabBar.tsx`
- `apps/app/src/components/shell/SidebarNavigation.tsx`
- `apps/app/src/components/shell/RightRail.tsx`
- `apps/app/src/app/(tabs)/(profile)/[profileHandle]/_layout.tsx`
- `apps/app/src/app/(tabs)/(post)/[profileHandle]/[postId].tsx`
- `openspec/specs/web-app-shell/spec.md`
- `docs/design/breakpoints.md`
