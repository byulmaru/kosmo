# 레이아웃 브레이크포인트

KOSMO 웹의 메인 3분할 레이아웃은 트위터/X처럼 화면 폭에 따라 단계적으로 컬럼이 줄어든다. Expo/React Native Web 구현은 `apps/app/src/theme/tokens.ts`의 공용 breakpoint(`compact=768`, `full=1280`)를 사용한다. 이 값은 기존 디자인 명칭 `md`/`xl`과 각각 같으며, 좁은 데스크톱 폭에서 중앙 피드가 비좁게 눌리지 않도록 풀 3분할 등장 폭을 `1280px`로 둔다.

이 단계는 Web에만 적용한다. Android/iOS는 태블릿처럼 폭이 `compact` 이상이어도 safe area를 적용한 mobile header, drawer, 하단 탭 셸을 유지한다.

## 단계

| 단계            | 폭 구간                       | 좌측        | 중앙         | 우측   | 모바일 셸              |
| --------------- | ----------------------------- | ----------- | ------------ | ------ | ---------------------- |
| 1 모바일        | `< compact` (768px 미만)      | 드로어      | 피드(전체폭) | —      | 64px 헤더 + 하단 탭 바 |
| 2 아이콘 + 피드 | `compact`~`full` (768~1279px) | 아이콘 레일 | 피드         | —      | 없음                   |
| 3 풀 3분할      | `≥ full` (1280px 이상)        | 풀 사이드바 | 피드         | 컴포저 | 없음                   |

- **`compact`(768px, 기존 `md`)** = 모바일 ↔ 데스크톱 경계. 미만은 하단 탭 바 + 드로어 사이드바, 이상은 사이드바가 항상 보인다.
- **`full`(1280px, 기존 `xl`)** = 좌측 풀 사이드바(프로필 헤더 + 라벨)와 우측 컴포저(우측 레일)가 함께 등장해 풀 3분할이 된다. `compact`~`full`는 좌측이 아이콘 전용 레일이고 우측 레일이 없다.

모바일 셸의 화면 헤더 높이는 `64px`이며 Android/iOS safe-area inset은 이 높이 바깥에서 셸이 추가한다. `/home`에서는 셸이 메뉴 버튼과 중앙 브랜드 마크를 하나의 app bar로 렌더링하고 route는 헤더를 중복 렌더링하지 않는다. `compact`와 `full` Web에서는 모바일 셸 헤더가 없으므로 `/home` route가 중앙 브랜드 마크 헤더를 소유한다. 다른 주요 route의 텍스트 헤더와 게시글 상세의 뒤로가기 헤더는 route가 소유한다.

각 컬럼 폭(풀 사이드바 `320px` / 아이콘 레일 `80px`, 중앙 최대 `600px`, 우측 `290~350px`)을 더하면 `full`(1280px) 경계에서 풀 3분할(`320`+`600`+`350` ≈ `1270px`)이 눌리지 않고 중앙 피드를 `600px`로 확보한 채 들어맞는다. 풀 3분할 등장을 1024px가 아닌 1280px로 둬, 1024~1279px 구간에서는 중앙 피드를 비좁게 누르는 대신 아이콘 레일 단계로 폭을 확보한다.

## 글쓰기 진입

- `< compact`: 하단 탭 바의 글쓰기가 유일한 shell-level 진입점이다. mobile drawer에는 중복 글쓰기 버튼을 표시하지 않는다.
- `compact`~`full`: 우측 레일이 없으므로 아이콘 레일의 글쓰기 버튼.
- `≥ full`: 우측 레일 컴포저가 담당하며, 사이드바 글쓰기 버튼은 표시하지 않는다. mobile drawer에도 중복 글쓰기 버튼을 표시하지 않는다.

## 개인정보 처리방침 진입

공개 `/privacy` route와 비로그인 landing의 링크는 유지한다. 인증 후 셸에서는 generic `/menu`를 법적 고지의
영구 위치로 사용하지 않고 full Web 우측 레일에만 보조 진입점을 둔다.

- `≥ full`: 우측 레일 최하단에 `textSecondary` 색의 `개인정보 처리방침` 텍스트 링크를 둔다. 선택한 Profile이
  없어 컴포저가 표시되지 않아도 링크는 유지하며, 기존 위치보다 viewport 하단에 가깝게 배치한다.
- `compact`~`full`: 좁은 아이콘 레일의 공간과 navigation 위계를 보존하기 위해 개인정보 처리방침 진입점을
  표시하지 않는다.
- `< compact` mobile Web과 Android/iOS: mobile drawer에 개인정보 처리방침 진입점을 표시하지 않는다.
- 가입·로그인 온보딩 안의 추가 개인정보 처리방침 진입점은 후속 범위에서 결정한다. 현재 범위에서는 공개
  route와 landing 링크, full Web 보조 진입점만 유지하며 준비되지 않은 설정, 팔로워 요청 또는 generic menu
  navigation을 다시 만들지 않는다.

## 프로필 피커

Web profile picker는 breakpoint별 사이드바 구조에 맞는 surface를 사용한다. Android/iOS profile picker는
이 Web 계약의 적용 대상이 아니다.

- `compact`~`full`에서는 아이콘 레일의 프로필 아바타가 trigger다. picker는 80px 레일 오른쪽에
  비모달 overlay drawer로 열리며, 레일과 중앙 피드의 실제 layout 폭을 바꾸지 않는다.
- compact drawer는 본문보다 위에 표시하지만 backdrop과 focus trap을 사용하지 않는다. 아바타 재클릭,
  바깥 클릭, `Escape`, 프로필 선택 성공으로 닫힌다.
- `< compact` mobile Web drawer에서는 프로필 이름과 chevron을 하나의 trigger로 유지한다. 닫힌 상태는 아래
  방향, 열린 상태는 위 방향 chevron으로 표시하고 이름·chevron 콘텐츠를 trigger 상자의 수직 중심에 둔다.
  프로필 이름 행 아래에는 Figma의 `-8px` 보정을 적용해 바로 다음 handle과의 불필요한 간격을 없앤다. trigger
  hitbox, picker anchor와 navigation geometry는 바꾸지 않으며 Android/iOS의 기존 정렬도 변경하지 않는다.
- `≥ full`에서는 프로필 이름과 chevron을 하나의 trigger로 사용하고, picker의 시각적 wrapper를 그 trigger
  바로 아래에 anchored absolute overlay로 표시한다. 닫힌 260px 프로필 요약 영역은 유지하며, picker는 trigger
  아래의 프로필 상세와 navigation 위에 표시하되 navigation의 layout 위치와 sidebar·중앙 피드의 실제 폭을
  바꾸지 않는다. backdrop과 focus trap을 사용하지 않으며, 같은 trigger 재실행, 바깥 클릭, `Escape`, 프로필
  선택 성공으로 닫는다.
  닫힌 상태는 아래 방향, 열린 상태는 위 방향 chevron으로 표시한다. 이름·chevron 콘텐츠는 trigger 상자의
  수직 중심에 두고 이름 행 아래에는 같은 `-8px` 보정을 적용한다. trigger hitbox, picker anchor와 navigation
  geometry는 바꾸지 않으며, chevron 자체는 별도 focus target이 아니다.
- trigger는 열린 상태를 accessibility `expanded` 상태로 노출한다.
- 프로필이 많을 때는 프로필 목록 영역만 제한된 높이 안에서 스크롤한다. 새 프로필 추가 액션과 생성 폼은
  목록 아래의 고정 영역에 두며, 생성 폼이 열리면 목록이 남은 높이에 맞게 줄어든다. full·compact Web picker의
  시각적 wrapper는 기존 viewport 여백 계산을 유지하면서 `430px`를 최대 높이로 사용해 기본 상태에서 약 7개
  프로필 행이 보이게 한다. 실제 가시 행 수보다 고정 footer 접근성과 목록 내부 스크롤을 우선한다.
- full·compact Web picker를 열어도 focus를 강제로 이동하지 않는다. 브라우저의 기본 `Tab` 순서는 trigger,
  프로필 버튼, 새 프로필 추가·생성 control, full summary link 순으로 이어지고 `Enter`·`Space`는 focus된 버튼을
  실행한다. Full Web에서 summary link로 focus가 이동하면 picker를 닫고 해당 link focus를 유지해 focus indicator가
  overlay에 가려지지 않게 한다. 긴 목록에서 focus된 프로필 버튼은 목록의 보이는 영역 안에 유지한다. `Escape`는
  picker를 닫고 trigger로 focus를 복원한다.
- full·compact Web에서 프로필 선택·생성 실패는 picker와 오류를 유지하고 생성 실패는 입력값도 유지한다.
  trigger 재실행, full·compact 바깥 pointer close 또는 `Escape`처럼 사용자가 명시적으로 닫으면 `open=false`,
  `creating=false`, 빈 handle과 오류 없음으로 초기화한다. 바깥 pointer close는 이벤트 기본 동작을 막지 않아
  pointer 대상의 브라우저 기본 focus를 따른다. `Escape`는 trigger focus를 복원한다. mobile Web drawer의
  chevron 표시 외 close transition과 Android/iOS의 기존 상태 동작은 이 계약으로 바꾸지 않는다.

## 알림 Unread badge

모든 셸 단계는 selected Profile의 Unread 상태를 기존 알림 아이콘 우상단 badge로 표시한다. badge는 아이콘 wrapper 안에서 overlay되어 row, touch target과 label layout을 밀지 않는다.

- `< compact` Web과 Android/iOS의 하단 탭 바와 모바일 drawer, `compact`~`full`의 icon-only 레일, `≥ full`의 풀 사이드바 모두 숫자 없는 8px dot을 같은 위치와 스타일로 표시한다.
- `0`은 모든 표면에서 숨기고 양수 count는 Unread가 있다는 사실만 시각적으로 나타낸다.
- dot은 semantic `accent` color token을 사용한다. 숫자나 아이콘이 없는 현재 dot을 위해 foreground 짝 토큰을 선제 정의하지 않는다.
- 실제 count는 진입점의 accessible name에 합쳐 읽는다. 시각적 dot 자체는 별도 focus 대상으로 만들지 않는다.

## 스크롤 소유권

React Native Web의 `(tabs)` 셸은 document/window scroll을 기본 scroll owner로 둔다. 중앙 피드만 별도 internal scroller가 되는 앱형 shell은 이 기준의 목표가 아니다. 사용자가 피드 바깥의 비스크롤 sidebar, 우측 rail, 빈 레이아웃 영역에서 wheel/trackpad를 사용해도 브라우저 기본 document scroll 흐름으로 페이지가 움직여야 한다. Android/iOS 화면은 platform의 `ScrollView`를 사용하되 이 web scroll 계약을 바꾸지 않는다.

- `< compact`에서는 64px 모바일 header가 document scroll 위의 sticky chrome으로 동작하고, 하단 탭 바는 safe-area를 포함한 fixed bottom chrome으로 유지된다. 콘텐츠는 하단 탭 높이와 safe-area를 고려한 bottom padding 또는 scroll padding으로 겹침을 피한다.
- `compact`~`full`에서는 아이콘 레일이 layout flow 안에서 sticky viewport column으로 고정된다. 레일 자체가 스크롤 가능한 콘텐츠를 갖지 않는 한 wheel 입력은 document scroll로 이어진다.
- `compact`~`full` profile picker가 열렸을 때는 overlay drawer 안의 프로필 목록만 internal scroll owner가 된다.
  drawer 밖의 wheel 입력은 기존 document scroll 흐름을 유지한다.
- `≥ full`에서는 풀 사이드바와 우측 레일이 각각 layout flow 안의 sticky column으로 배치된다. 두 rail은 중앙 컬럼과 겹치지 않도록 width 계산에 참여한다.
- `≥ full` profile picker가 열렸을 때는 overlay 안의 프로필 목록만 internal scroll owner가 된다. overlay 밖의
  wheel 입력은 기존 document scroll 흐름을 유지하고 navigation의 layout 위치는 닫힌 상태와 같게 유지한다.
- 우측 레일 콘텐츠가 viewport보다 긴 경우 rail 내부 overflow를 허용할 수 있지만, 중앙 피드를 별도 internal scroller로 만들지는 않는다.
- 일반 route 이동과 back/forward는 Expo Router와 browser history의 document scroll policy에 맞춘다. 검색 화면의 query-only `router.push`/`setParams` 이동은 현재 document scroll과 입력 focus를 보존하도록 명시적으로 검증한다.
- shell chrome에서 중앙 피드로 wheel 이벤트를 인위적으로 전달하지 않는다.

## 구현 위치

- breakpoint token: `apps/app/src/theme/tokens.ts`
- 셸 레이아웃과 컬럼 가시성: `apps/app/src/components/shell/UniversalShell.tsx`
- Web/native layout 단계 판정: `apps/app/src/components/shell/shellLayout.ts`
- 접힌/펼친 사이드바와 글쓰기 진입: `apps/app/src/components/shell/SidebarNavigation.tsx`
- 하단 탭 바와 safe-area: `apps/app/src/components/shell/BottomTabBar.tsx`
- 우측 레일: `apps/app/src/components/shell/RightRail.tsx`

## 컨벤션 (다른 화면에서 재사용)

- Web의 모바일 ↔ 데스크톱 셸 전환은 `breakpoints.compact`를 기준으로 한다. native는 폭과 무관하게 모바일 셸을 유지한다.
- 우측 보조 컬럼(레일)과 풀 사이드바 등 데스크톱 전체 구성은 `breakpoints.full`을 기준으로 노출한다.
- 데스크톱 shell chrome은 document scroll 위에서 sticky/fixed 위치 정책을 명확히 갖되, 중앙 콘텐츠를 별도 internal scroller로 만드는 방식에 의존하지 않는다.
- breakpoint 숫자를 component-local 상수로 새로 만들지 않는다. 기존 `compact`/`full`로 표현되지 않는 단계가 꼭 필요할 때만 디자인 오너와 합의 후 `theme/tokens.ts`에 추가한다.

## Figma 대응

`05 Screens - Web`의 프레임과 압축형 단계는 다음과 같이 대응한다. 압축형 재조정으로 일부 프레임이 코드 단계와 어긋나므로 Figma 프레임 정리는 후속 작업으로 남긴다.

- **1440 프레임**(풀 사이드바 + 피드 + 컴포저) = 3단계(`≥ full`).
- **1024 프레임**(접힌 아이콘 메뉴 + 피드)은 코드의 2단계(`compact`~`full` 아이콘 레일 + 피드)에 대응한다. 코드는 `full`(1280px)부터 풀 사이드바로 전환하며 우측 컴포저를 포함하고, 중간 단계에는 우측 컴포저가 없다. 후속에서 2·3단계 기준으로 프레임을 정리한다.
