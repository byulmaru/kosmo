# 레이아웃 브레이크포인트

KOSMO 웹의 메인 3분할 레이아웃은 트위터/X처럼 화면 폭에 따라 단계적으로 컬럼이 줄어든다. 별도 커스텀 브레이크포인트 토큰을 만들지 않고 **Tailwind 기본 브레이크포인트(`md`/`xl`)를 그대로 재사용**한다. 좁은 데스크톱 폭에서 중앙 피드가 비좁게 눌리지 않도록 풀 3분할 등장 폭을 `xl`(1280px)로 둔다.

## 단계

| 단계            | 폭 구간              | 좌측        | 중앙         | 우측   | 모바일 셸            |
| --------------- | -------------------- | ----------- | ------------ | ------ | -------------------- |
| 1 모바일        | `< md` (768px 미만)  | 드로어      | 피드(전체폭) | —      | ☰ 헤더 + 하단 탭 바 |
| 2 아이콘 + 피드 | `md`~`xl` (768~1280) | 아이콘 레일 | 피드         | —      | 없음                 |
| 3 풀 3분할      | `≥ xl` (1280px 이상) | 풀 사이드바 | 피드         | 컴포저 | 없음                 |

- **`md`(768px)** = 모바일 ↔ 데스크톱 경계. 미만은 하단 탭 바 + 드로어 사이드바, 이상은 사이드바가 항상 보인다.
- **`xl`(1280px)** = 좌측 풀 사이드바(프로필 헤더 + 라벨)와 우측 컴포저(우측 레일)가 함께 등장해 풀 3분할이 된다. `md`~`xl`는 좌측이 아이콘 전용 레일이고 우측 레일이 없다.

각 컬럼 폭(풀 사이드바 `20rem` / 아이콘 레일 `5rem`, 중앙 `minmax(0,600px)`, 우측 `minmax(290px,350px)`)을 더하면 `xl`(1280px) 경계에서 풀 3분할(`20rem`+`600`+`350` ≈ 1270px)이 눌리지 않고 중앙 피드를 `600px`로 확보한 채 들어맞는다. 풀 3분할 등장을 `lg`(1024)가 아닌 `xl`로 둬, 1024~1280 구간에서는 중앙 피드를 비좁게 누르는 대신 아이콘 레일 단계로 폭을 확보한다.

## 글쓰기 진입

- `< md`: 하단 탭 바의 글쓰기.
- `md`~`xl`: 우측 레일이 없으므로 아이콘 레일의 글쓰기 버튼.
- `≥ xl`: 우측 레일 컴포저가 담당하며, 사이드바 글쓰기 버튼은 표시하지 않는다(드로어 surface에서만 유지).

## 스크롤 소유권

`(tabs)` 셸은 document/window scroll을 기본 scroll owner로 둔다. 중앙 피드만 별도 internal scroller가 되는 앱형 shell은 이 기준의 목표가 아니다. 사용자가 피드 바깥의 비스크롤 sidebar, 우측 rail, 빈 레이아웃 영역에서 wheel/trackpad를 사용해도 브라우저 기본 document scroll 흐름으로 페이지가 움직여야 한다.

- `< md`에서는 모바일 header가 document scroll 위의 sticky chrome으로 동작하고, 하단 탭 바는 safe-area를 포함한 fixed bottom chrome으로 유지된다. 콘텐츠는 하단 탭 높이와 safe-area를 고려한 bottom padding 또는 scroll padding으로 겹침을 피한다.
- `md`~`xl`에서는 아이콘 레일이 grid flow 안에서 `position: sticky`, `top: 0`, viewport height 경계를 사용해 시각적으로 고정된다. 레일 자체가 스크롤 가능한 콘텐츠를 갖지 않는 한 wheel 입력은 document scroll로 이어진다.
- `≥ xl`에서는 풀 사이드바와 우측 레일이 각각 grid flow 안의 sticky column으로 배치된다. 두 rail은 중앙 컬럼과 겹치지 않도록 layout width 계산에 참여한다.
- 우측 레일 콘텐츠가 viewport보다 긴 경우 rail 내부 overflow를 허용할 수 있지만, 중앙 피드를 별도 internal scroller로 만들지는 않는다.
- 일반 route 이동과 back/forward는 SvelteKit/browser document scroll policy를 따른다. 검색 화면처럼 `noScroll`이 필요한 query-only 이동은 기존 `noScroll`/focus 흐름을 유지한다.
- shell chrome에서 중앙 피드로 wheel 이벤트를 인위적으로 전달하지 않는다.

## 구현 위치

- 셸 그리드와 컬럼 가시성: `apps/web/src/routes/(tabs)/+layout.svelte`
- 접힌/펼친 사이드바 분기(`xl` 기준 전환): `apps/web/src/lib/components/SidebarNavigation.svelte`
- 하단 탭 바 가시성(`md:hidden`): `apps/web/src/lib/components/BottomTabBar.svelte`

## 컨벤션 (다른 화면에서 재사용)

- 모바일 ↔ 데스크톱 셸 전환은 `md`를 기준으로 한다(`md:hidden`, `hidden md:block`).
- 우측 보조 컬럼(레일)과 풀 사이드바 등 데스크톱 전체 구성은 `xl`를 기준으로 노출한다.
- 데스크톱 shell chrome은 document scroll 위에서 sticky/fixed 위치 정책을 명확히 갖되, 중앙 콘텐츠를 별도 internal scroller로 만드는 방식에 의존하지 않는다.
- 커스텀 `--breakpoint-*` 토큰을 새로 만들지 않는다. 기본 `sm`/`md`/`lg`/`xl`/`2xl`로 표현되지 않는 단계가 꼭 필요할 때만 디자인 오너와 합의 후 추가한다.

## Figma 대응

`05 Screens - Web`의 프레임과 압축형 단계는 다음과 같이 대응한다. 압축형 재조정으로 일부 프레임이 코드 단계와 어긋나므로 Figma 프레임 정리는 후속 작업으로 남긴다.

- **1440 프레임**(풀 사이드바 + 피드 + 컴포저) = 3단계(`≥ xl`).
- **1024 프레임**(접힌 아이콘 메뉴 + 피드)은 코드의 2단계(`md`~`xl` 아이콘 레일 + 피드)에 대응한다. 코드는 `xl`(1280px)부터 풀 사이드바로 전환하며 우측 컴포저를 포함하고, `md`~`xl` 단계에는 우측 컴포저가 없다. 후속에서 2·3단계 기준으로 프레임을 정리한다.
