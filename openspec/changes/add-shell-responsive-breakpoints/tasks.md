## 1. 셸 4단계 브레이크포인트

- [x] 1.1 `(tabs)/+layout.svelte` 그리드를 `md`(아이콘+피드) / `lg`(우측 레일 추가) / `xl`(풀 사이드바) 단계별 `grid-cols`로 교체한다
- [x] 1.2 모바일 셸 토글(헤더·drawer·center rows·main padding·swipe·`openProfileSwitcher`)을 `lg`→`md`로 내린다
- [x] 1.3 `BottomTabBar`의 `lg:hidden`을 `md:hidden`으로 바꾼다

## 2. 접힌 사이드바 + 글쓰기

- [x] 2.1 `SidebarNavigation`에 아이콘 레일 분기(`xl:hidden`)와 풀 분기(`hidden xl:flex`)를 추가하고 스크립트·상태를 공유한다
- [x] 2.2 사이드바 양 분기에 `/compose` 글쓰기 버튼을 추가한다
- [x] 2.3 프로필 스위처 드롭다운을 snippet으로 추출해 접힌 아바타에서도 동작하게 한다

## 3. 문서

- [x] 3.1 `docs/design/breakpoints.md`를 작성하고 `README.md`·`figma.md`에 반영한다

## 4. 검증

- [x] 4.1 `pnpm -F @kosmo/web check`와 lint·prettier를 통과시킨다
- [ ] 4.2 767/768 · 1023/1024 · 1279/1280 경계 폭에서 단계가 단계적으로 전환되고, 각 단계의 내비·글쓰기 진입이 동작하는지 확인한다(시각 확인은 사용자)
