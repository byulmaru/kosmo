## 1. 최신 기준 재확인

- [x] 1.1 최신 `main` 기준으로 `apps/web/src/routes/(tabs)/+layout.svelte`의 shell grid, mobile header, main, right rail wrapper 구조를 확인한다.
- [x] 1.2 최신 `main` 기준으로 `apps/web/src/lib/components/BottomTabBar.svelte`의 fixed bottom tab, safe-area padding, 표시 breakpoint를 확인한다.
- [x] 1.3 최신 `main` 기준으로 `apps/web/src/lib/components/SidebarNavigation.svelte`의 mobile drawer, `md`~`xl` icon rail, `xl+` full sidebar 분기를 확인한다.
- [x] 1.4 최신 `main` 기준으로 프로필/게시글 상세 route wrapper가 document scroll + sticky rails에서 추가 layout 리팩터링 없이 호환되는지 확인한다.
- [x] 1.5 최신 `main` 기준으로 `openspec/specs/web-app-shell/spec.md`와 `docs/design/breakpoints.md`가 `md`/`xl` 3단계 기준과 어긋나지 않는지 확인한다.
- [x] 1.6 기존 active `add-web-app-shell-internal-scroll` change가 이 change로 대체되어야 하는 범위인지 확인한다.

## 2. Document scroll shell 유지

- [x] 2.1 `(tabs)` 최상위 shell이 document/window scroll을 막지 않도록 `h-dvh`, `overflow-hidden`, 중앙 `overflow-y-auto` 기반 internal scroller 구조를 제거하거나 도입하지 않는다.
- [x] 2.2 중앙 `main`은 route content wrapper로 유지하고, 별도 scroll owner가 되지 않게 한다.
- [x] 2.3 shell chrome wheel 이벤트를 중앙 피드로 전달하는 custom wheel forwarding을 추가하지 않는다.
- [x] 2.4 일반 route 이동과 back/forward는 SvelteKit/browser document scroll 정책을 따르게 하고, internal scroller용 scroll restoration helper를 만들지 않는다.
- [x] 2.5 검색 화면의 `noScroll`/`data-sveltekit-noscroll`/focus 동작이 기존 document scroll 기준으로 유지되는지 확인한다.

## 3. Sticky rail 배치

- [x] 3.1 `md` 이상 좌측 sidebar/icon rail wrapper를 grid flow 안에서 `sticky top-0`와 viewport height 경계로 유지한다.
- [x] 3.2 `SidebarNavigation`과 mobile drawer의 public props/API를 유지하고, sticky shell 안에서 필요한 height/overflow class만 보정한다.
- [x] 3.3 `xl` 이상 우측 rail wrapper를 grid flow 안에서 `sticky top-0`와 viewport height 경계로 유지한다.
- [x] 3.4 우측 rail 내용이 viewport보다 길어질 때만 rail 내부 overflow가 가능하도록 구조를 둔다.
- [x] 3.5 좌우 rail을 `position: fixed` layer로 빼지 않는다. fixed가 필요하다고 판단되면 후속 change로 분리한다.

## 4. Route 호환성과 bottom tab

- [ ] 4.1 `/home`, `/search`, `/notifications`, `/menu`, `/compose`가 document scroll + sticky rails 구조에서 기존 폭과 정렬을 유지하는지 확인한다. Fresh browser context에서는 보호 route가 `/`로 리다이렉트되어, 로그인 세션 smoke가 남아 있다.
- [x] 4.2 `/@{handle}`, `/@{handle}/followers`, `/@{handle}/following`, `/@{handle}/{postId}`가 document scroll + sticky rails 구조에서 레이아웃 깨짐 없이 렌더링되는지 확인한다.
- [x] 4.3 프로필/게시글 상세의 `-mx-6 -mt-8` padding 상쇄 결합은 유지 우선으로 확인하고, 깨지는 경우에만 route wrapper를 최소 보정한다.
- [x] 4.4 모바일 bottom tab은 fixed chrome으로 유지하고, content 하단이 tab/safe-area에 가려지지 않도록 padding 또는 scroll padding을 확인한다.
- [ ] 4.5 `PROD-220` 하단바 겹침이 이 구조 안에서 함께 해소되는지 확인하고, 이슈 처리 여부를 구현 PR 설명에 남긴다. 로그인 세션 `/home` smoke 후 확정한다.

## 5. 문서 정렬

- [x] 5.1 `openspec/changes/add-web-app-shell-sticky-rails`가 document scroll + sticky rails 요구사항과 일치하는지 확인한다.
- [x] 5.2 기존 `openspec/changes/add-web-app-shell-internal-scroll` active change를 제거해 상충하는 scroll ownership 스펙이 동시에 남지 않게 한다.
- [x] 5.3 `docs/design/breakpoints.md`의 scroll ownership 정책이 sticky rails 방향과 일치하는지 확인한다.
- [x] 5.4 `PROD-233`은 변경된 shell 기준의 반응형 내비게이션 E2E 후속 작업으로 남긴다.

## 6. 검증

- [x] 6.1 `pnpm exec openspec validate add-web-app-shell-sticky-rails --strict`를 통과시킨다.
- [x] 6.2 구현 PR에서 `pnpm -F @kosmo/web check`를 통과시킨다.
- [x] 6.3 구현 PR에서 모바일 1개, `md`~`xl` 1개, `xl+` 1개 viewport를 smoke로 확인한다.
- [ ] 6.4 구현 PR에서 `/home`, `/search`, `/notifications`, `/menu`, `/compose`, 프로필/팔로우 목록/게시글 상세 route를 smoke로 확인한다. 현재 fresh browser route smoke는 보호 route 리다이렉트와 공개 프로필 계열 렌더링까지만 확인했다.
- [ ] 6.5 구현 PR에서 drawer open/close, bottom tab, icon rail/full sidebar, RightRail 위치, 검색 `noScroll`, 게시글 상세 sticky header를 확인한다. 현재 viewport smoke는 document scroll, bottom tab fixed, icon rail/full sidebar, RightRail 위치까지 확인했다.
- [x] 6.6 반응형 앱 내비게이션 E2E suite 전체는 구현하지 않고, 필요 검증은 `PROD-233` 후속 범위로 남긴다.
