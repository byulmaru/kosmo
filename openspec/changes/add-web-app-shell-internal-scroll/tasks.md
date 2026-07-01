## 1. 최신 기준 재확인

- [ ] 1.1 최신 `main` 기준으로 `apps/web/src/routes/(tabs)/+layout.svelte`의 shell grid, header, main, right rail wrapper 구조를 확인한다.
- [ ] 1.2 최신 `main` 기준으로 `apps/web/src/lib/components/BottomTabBar.svelte`의 하단 탭/프로필 진입, safe-area padding, 표시 breakpoint를 확인한다.
- [ ] 1.3 최신 `main` 기준으로 `apps/web/src/lib/components/SidebarNavigation.svelte`의 mobile drawer, `md`~`xl` icon rail, `xl+` full sidebar 분기를 확인한다.
- [ ] 1.4 최신 `main` 기준으로 `ProfileConnectionList`와 팔로워·팔로잉 route가 shell 전환에 추가 pagination 작업 없이 호환되는지 확인한다.
- [ ] 1.5 최신 `main` 기준으로 `openspec/specs/web-app-shell/spec.md`와 `docs/design/breakpoints.md`가 `md`/`xl` 3단계 기준과 어긋나지 않는지 확인한다.
- [ ] 1.6 `add-shell-responsive-breakpoints`가 먼저 archive되어 canonical `web-app-shell`이 `md`/`xl` 3단계 기준인지 확인한다.

## 2. Shell scroll ownership 전환

- [ ] 2.1 `(tabs)` 최상위 shell을 viewport 높이 기준 app shell로 바꾸고, grid 자식이 내부 overflow를 가질 수 있도록 `min-h-0`/height 경계를 정리한다.
- [ ] 2.2 중앙 route content 영역을 단일 세로 internal scroll container로 만들고, `(tabs)` shell 자체에서 document/window scroll이 발생하지 않게 한다.
- [ ] 2.3 모바일 header와 하단 탭을 shell chrome으로 유지하고, 중앙 content row가 남은 viewport 높이 안에서 스크롤되게 한다.
- [ ] 2.4 `BottomTabBar` safe-area padding은 유지하되, 기존 `main pb-24` 계열 하단 겹침 회피가 중복되지 않게 정리한다.
- [ ] 2.5 `SidebarNavigation`과 mobile drawer가 viewport shell 높이 기준으로 열리고 닫히며, `shellInert` 상태가 유지되는지 확인한다.
- [ ] 2.6 `RightRail` 부모 wrapper의 `sticky top-0`/document-scroll 의존을 제거하고, `xl+` shell column 안에서 `h-full`/`min-h-0` 기준으로 배치한다.
- [ ] 2.7 우측 rail 내용이 viewport보다 길어질 때 중앙 콘텐츠와 독립된 rail overflow를 가질 수 있는 구조로 둔다.

## 3. Route 호환성과 scroll 동작

- [ ] 3.1 `/home`, `/search`, `/notifications`, `/menu`, `/compose`가 새 internal scroll container 안에서 기존 폭과 정렬을 유지하는지 확인한다.
- [ ] 3.2 `/@{handle}`, `/@{handle}/followers`, `/@{handle}/following`, `/@{handle}/{postId}`가 새 internal scroll container 안에서 레이아웃 깨짐 없이 렌더링되는지 확인한다.
- [ ] 3.3 프로필/게시글 상세의 `-mx-6 -mt-8` padding 상쇄 결합이 유지 가능한지 확인하고, 필요하면 route content wrapper 경계를 최소 변경으로 정리한다.
- [ ] 3.4 일반 route 전환 시 내부 scroller가 새 화면 상단으로 이동하는지 확인한다.
- [ ] 3.5 검색 화면의 `noScroll`/`data-sveltekit-noscroll`/focus 동작이 내부 scroll container 기준으로 유지되는지 확인한다.
- [ ] 3.6 게시글 상세 sticky header가 내부 scroll container 기준으로 동작하는지 확인한다.
- [ ] 3.7 back/forward 위치 복원에 공통 helper가 필요할 정도로 동작이 커지면 별도 이슈로 분리하고 이 구현 범위에서는 smoke 확인으로 남긴다.

## 4. 문서 정렬

- [ ] 4.1 `openspec/specs/web-app-shell/spec.md` 또는 이 change delta가 internal scroll app shell 요구사항과 일치하는지 확인한다.
- [ ] 4.2 `docs/design/breakpoints.md`의 scroll ownership 정책이 구현 결과와 일치하는지 확인한다.
- [ ] 4.3 구현 중 `PROD-220` 하단바 겹침이 함께 해소됐는지 확인하고, 이슈 처리 여부를 구현 PR 설명에 남긴다.
- [ ] 4.4 `PROD-233`은 변경된 shell 기준의 반응형 내비게이션 E2E 후속 작업으로 남긴다.

## 5. 검증

- [ ] 5.1 `pnpm exec openspec validate add-web-app-shell-internal-scroll --strict`를 통과시킨다.
- [ ] 5.2 `pnpm -F @kosmo/web check`를 통과시킨다.
- [ ] 5.3 모바일 1개, `md`~`xl` 1개, `xl+` 1개 viewport에서 shell chrome 고정과 중앙 internal scroll 동작을 확인한다.
- [ ] 5.4 drawer open/close, bottom tab, RightRail 위치, 검색 `noScroll`, 게시글 상세 sticky header smoke를 확인한다.
- [ ] 5.5 반응형 앱 내비게이션 E2E suite 전체는 구현하지 않고, 필요 검증은 `PROD-233` 후속 범위로 남긴다.
