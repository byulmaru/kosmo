## Context

`add-main-three-column-shell`(PROD-112, 아카이브 완료)이 legacy Svelte `(tabs)` 셸을 3컬럼으로 만들었고, PROD-118은 그 위에 트위터식 압축형 다단계 브레이크포인트를 확정했다. Expo migration은 같은 768px/1280px product 경계를 `apps/app` universal shell로 옮긴다.

## Decisions

- **공용 `compact`/`full` token을 재사용한다.** `compact`(768)에서 아이콘 레일(80)+중앙, `full`(1280)에서 풀 사이드바(320)+중앙(최대 600)+우측 레일(290~350)로 전환한다. 1280px 경계에서 컬럼 합(320+600+350≈1270)이 들어맞아 중앙은 `600px`를 확보한다. component-local breakpoint 숫자는 쓰지 않는다.
- **모바일 경계는 `compact`.** 768px 이상에서는 (접힌/펼친) 사이드바가 항상 보이고 하단 탭 바·drawer는 숨긴다. 아이콘 레일 단계는 768~1279px, 풀 사이드바 3분할은 1280px 이상이다.
- **아이콘 레일은 같은 `SidebarNavigation` 책임을 공유한다.** `UniversalShell`이 `useWindowDimensions`와 breakpoint token으로 surface를 선택하고, compact/full sidebar는 navigation, mutation, profile switcher 상태를 공유한다. drawer surface는 항상 full navigation을 쓴다. 두 숨은 DOM subtree를 동시에 유지하지 않는다.
- **글쓰기 진입은 우측 레일 없는 단계만.** 아이콘 레일 단계(`md`~`xl`)엔 우측 컴포저·하단 탭이 없어 아이콘 레일에 `/compose` 글쓰기 버튼을 둔다. `xl` 이상은 우측 레일 컴포저가 담당하므로 풀 사이드바 글쓰기 버튼은 데스크톱에서 숨기고 drawer surface에서만 남긴다.
- **프로필 스위처 modal/popover**는 공용 React Native component로 두고 full sidebar와 icon rail에서 trigger/placement만 바꿔 재사용한다.

## Risks / Trade-offs

- viewport가 경계값을 오갈 때 sidebar/modal local state가 예기치 않게 남을 수 있다. surface 변경 시 닫힌 상태로 정리하고 Relay/session state만 공유한다.
- web과 native의 safe-area/viewport 단위가 다르므로 767/768, 1279/1280 web smoke와 실제 native screen smoke를 모두 수행한다.
