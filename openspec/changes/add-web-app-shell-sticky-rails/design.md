## Context

현재 `main`의 `(tabs)` shell은 `min-h-screen` 기반 grid 위에서 document/window scroll을 사용한다. 모바일 하단 탭은 fixed bottom chrome이고, 모바일 header는 sticky header이며, `xl+` 우측 rail은 `(tabs)/+layout.svelte`의 부모 wrapper가 `sticky top-0`으로 잡고 있다.

초기 internal scroll 방향은 shell chrome과 route content의 scroll 기준을 강하게 분리할 수 있다는 장점이 있었지만, 실제 조작에서는 피드 바깥 영역 위에서 scroll이 자연스럽게 이어지지 않는 문제가 생겼다. wheel 이벤트 전달은 이 문제를 보완할 수 있으나 입력 감각이 어색하고, shell 내부 scrollbar 노출도 제품 UI와 잘 맞지 않는다. 이번 변경은 원래 document scroll 모델을 유지하고, 데스크톱 양쪽 rail만 sticky로 안정화하는 방향으로 범위를 다시 잡는다.

## Goals / Non-Goals

**Goals:**

- `(tabs)` shell의 기본 scroll owner를 document/window로 유지한다.
- 사용자가 중앙 피드 바깥의 비스크롤 shell chrome이나 레이아웃 영역에서 wheel/trackpad를 사용해도 브라우저 기본 scroll 흐름으로 페이지가 움직이게 한다.
- `md`~`xl` icon rail과 `xl+` full sidebar를 grid flow 안에서 sticky로 유지한다.
- `xl+` 우측 rail을 grid flow 안에서 sticky로 유지하고, 필요한 경우 rail 내부 overflow만 별도로 허용한다.
- 기존 `md`/`xl` 반응형 단계와 navigation/compose 진입점을 유지한다.
- 검색 `noScroll`, route 이동, back/forward를 SvelteKit/browser document scroll 정책과 충돌하지 않게 둔다.
- 구현 변경에 필요한 최소 viewport smoke 검증만 이 변경에 포함한다.

**Non-Goals:**

- 중앙 콘텐츠만 스크롤되는 internal scroll app shell 구현.
- shell chrome wheel 이벤트를 중앙 피드로 전달하는 custom wheel forwarding 구현.
- 좌우 rail을 viewport fixed layer로 빼는 구조. 필요하면 후속 리팩터링으로 검토한다.
- feed pagination/infinite scroll 구현.
- 팔로워/팔로잉 pagination 구현 또는 재작업.
- 하단 탭 IA 변경. 이는 PROD-221 범위다.
- 반응형 앱 내비게이션 E2E suite 전체 구현. 이는 PROD-233 범위다.
- 네이티브 WebView pull-to-refresh 또는 플랫폼별 overscroll 정책 확정.
- 미래 multi-column/timeline workspace 레이아웃 설계.

## Approach

`(tabs)/+layout.svelte`는 document scroll을 막지 않는다. 최상위 shell은 grid flow를 유지하고, 중앙 `main`은 page content를 렌더링하되 단일 internal scroller가 되지 않는다. 모바일에서는 현재처럼 header가 document scroll 위에서 sticky로 동작하고, 하단 탭은 fixed bottom chrome으로 유지한다. 콘텐츠 하단은 bottom tab과 safe-area를 고려한 padding 또는 scroll padding으로 겹침을 피한다.

`md` 이상에서는 좌측 rail wrapper를 grid track 안에 둔 채 `position: sticky`, `top: 0`, viewport height 경계를 적용한다. `md`~`xl`의 icon rail과 `xl+`의 full sidebar는 같은 `SidebarNavigation` API를 유지하며, 실제 높이와 overflow class만 필요한 만큼 보정한다.

`xl` 이상에서는 우측 column 역시 grid flow에 남긴다. 우측 rail wrapper는 `sticky top-0`을 유지하되, column 자체가 layout width 계산에 참여해야 한다. 우측 rail content가 viewport보다 길어질 가능성은 rail 내부 overflow로 처리하고, 중앙 content를 별도 internal scroller로 만들지 않는다.

route scroll은 별도 공통 helper를 만들지 않고 SvelteKit/browser 기본 document scroll restoration을 따른다. 검색 화면의 query-only 이동은 기존 `noScroll`/focus 정책을 유지한다. 프로필/게시글 상세의 기존 음수 margin wrapper는 유지 우선이며, sticky rail 전환 때문에 깨지는 경우에만 route wrapper를 최소 보정한다.

## Risks / Trade-offs

- [Risk] sticky rail은 부모 overflow, grid row height, transform 등에 민감하다. → shell wrapper에 불필요한 overflow/transform을 두지 않고, rail wrapper가 document scroll 기준 sticky 조건을 만족하는지 viewport smoke로 확인한다.
- [Risk] `position: fixed`보다 rail 고정감이 약해 보일 수 있다. → fixed는 grid flow에서 빠져 중앙 column과 겹침/폭 계산 문제가 커질 수 있으므로 지금은 sticky를 우선한다. 장기적으로 필요하면 fixed 전용 리팩터링을 별도 change로 진행한다.
- [Risk] 모바일 bottom tab은 fixed overlay라 긴 콘텐츠 하단과 겹칠 수 있다. → 기존 safe-area와 bottom padding 정책을 유지·정리하고, PROD-220 겹침 여부를 smoke로 확인한다.
- [Risk] 우측 rail 내용이 길어질 때 document scroll과 rail 내부 overflow가 동시에 존재할 수 있다. → rail 내부 overflow는 rail content가 viewport보다 길 때만 허용하고, 일반 화면에서는 document scroll이 자연스럽게 동작하도록 둔다.
- [Risk] PROD-233의 E2E 범위를 이 PR에 끌어오면 스펙/구현 범위가 커진다. → 이 변경은 최소 viewport smoke만 포함하고, E2E suite는 PROD-233이 변경된 shell 기준으로 보강한다.

## Migration Plan

1. 기존 active `add-web-app-shell-internal-scroll` change를 새 `add-web-app-shell-sticky-rails` change로 대체하는 OpenSpec PR을 먼저 올린다.
2. 구현 PR은 새 Change PR 위에 쌓고, internal scroll 구현을 document scroll + sticky rails 구현으로 되돌려 재작성한다.
3. 구현 PR에서는 shell layout, bottom tab padding, sidebar/drawer height, right rail sticky placement, route scroll behavior를 viewport smoke로 확인한다.
4. 구현 완료 후 PROD-220 하단바 겹침이 함께 해소됐는지 판단하고, PROD-233은 변경된 shell 기준으로 E2E를 보강한다.

Rollback은 구현 PR을 되돌리면 기존 document scroll 기반 shell로 돌아가는 구조를 목표로 한다. 이 change는 구현 PR과 분리되어 있으므로, sticky rail로도 사용자 경험이 부족하다고 판단되면 fixed rail 후속 change를 별도로 제안한다.

## Open Questions

- 우측 rail content가 길어졌을 때 rail 내부 overflow를 어느 시점부터 허용할지 구현 중 확인한다.
- 모바일 bottom tab 겹침을 padding으로 충분히 다룰 수 있는지, PROD-220에서 별도 보정이 필요한지 구현 smoke 후 판단한다.
- iOS Safari/WebView safe-area/overscroll 대응이 웹 shell 기본 구현만으로 충분한지 구현 검증 후 판단한다.
