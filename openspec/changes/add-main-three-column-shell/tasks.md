## 1. 레이아웃 셸 구현

- [x] 1.1 `(tabs)/+layout.svelte` 그리드를 `lg:grid-cols-[20rem_minmax(0,600px)_minmax(290px,350px)]` 3컬럼으로 확장한다
- [x] 1.2 세 번째 트랙에 우측 레일 placeholder 컬럼(`hidden lg:block` 빈 div)을 추가한다
- [x] 1.3 3컬럼 묶음을 `lg:justify-center`로 가운데 정렬해 남는 폭을 양옆 여백으로 배분한다

## 2. 검증

- [x] 2.1 `pnpm dev`로 1440px 폭에서 좌 내비 · 중앙 · 우측 레일 자리 3분할 표시를 확인한다
- [x] 2.2 `lg` 미만 폭에서 기존 모바일 레이아웃(메뉴 헤더, drawer, 하단 탭 바)이 회귀 없이 유지되는지 확인한다
- [x] 2.3 `(tabs)` 하위 라우트(홈/검색/알림 등)에서 중앙 콘텐츠가 깨짐 없이 렌더링되는지 확인한다
- [x] 2.4 `pnpm check`와 lint를 통과시킨다
