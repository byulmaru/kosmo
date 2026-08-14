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

모바일 셸의 화면 헤더 높이는 `64px`이며 Android/iOS safe-area inset은 이 높이 바깥에서 셸이 추가한다. `< compact` Web에서 `/home`은 메뉴 버튼과 중앙 브랜드 마크를, `/compose`와 `/notifications`는 메뉴 버튼과 화면 제목을 같은 app bar에 표시한다. 게시글 상세는 같은 위치에서 메뉴 대신 뒤로가기를 표시하고 `게시글` 제목을 함께 렌더링한다. 이 네 화면의 route 본문은 모바일 Web 헤더를 중복 렌더링하지 않는다. 북마크 등 다른 route의 PageHeader 정책은 유지한다. Android/iOS에서는 `/home`만 셸이 헤더를 소유하고 다른 route는 기존 헤더를 유지한다. `compact`와 `full` Web에서는 모바일 셸 헤더가 없으므로 각 route가 기존 브랜드·텍스트·뒤로가기 헤더를 소유한다.

각 컬럼 폭(풀 사이드바 `320px` / 아이콘 레일 `80px`, 중앙 최대 `600px`, 우측 `290~350px`)을 더하면 `full`(1280px) 경계에서 풀 3분할(`320`+`600`+`350` ≈ `1270px`)이 눌리지 않고 중앙 피드를 `600px`로 확보한 채 들어맞는다. 풀 3분할 등장을 1024px가 아닌 1280px로 둬, 1024~1279px 구간에서는 중앙 피드를 비좁게 누르는 대신 아이콘 레일 단계로 폭을 확보한다.

`/settings` route family는 full Web의 예외 workspace를 사용한다. 전역 풀 사이드바 `320px`는 유지하되 일반
우측 레일을 숨기고, 중앙 column과 우측 레일이 사용하던 나머지 폭을 Settings master-detail에 제공한다.
Settings master pane은 약 `320px`, detail pane은 남은 폭을 사용한다. 이 예외는 `full=1280` breakpoint나
다른 route의 중앙 `600px`·우측 레일 계약을 바꾸지 않는다.

## 글쓰기 진입

- `< compact`: 하단 탭 바의 글쓰기가 유일한 shell-level 진입점이다. mobile drawer에는 중복 글쓰기 버튼을 표시하지 않는다.
- `compact`~`full`: 우측 레일이 없으므로 아이콘 레일의 글쓰기 버튼.
- `≥ full`: 우측 레일 컴포저가 담당하며, 사이드바 글쓰기 버튼은 표시하지 않는다. mobile drawer에도 중복 글쓰기 버튼을 표시하지 않는다.

## Web 검색 상단바

- Web `/search`는 모든 breakpoint에서 중앙 컬럼 최상단에 높이 `64px`의 검색 도구막대를 표시한다. 그 안의
  검색 입력은 모든 Web breakpoint에서 높이 `48px`와 위·아래 `8px` 여백을 사용한다. route의 기존 `32px`
  상단 여백과 도구막대 바깥쪽 가로 여백은 제거하며, 도구막대 아래 콘텐츠만 기존 본문 여백을 사용한다.
- `< compact`에서는 셸의 메뉴 전용 상단바와 route의 검색 도구막대를 세로로 함께 표시하지 않는다. 최초 검색
  상태에서는 햄버거 메뉴, 입력 중과 결과 상태에서는 검색 초기화 뒤로가기를 같은 `44×44px` leading 영역에
  표시한다. 상태가 바뀌어도 상단바 높이, 검색 입력의 시작점과 본문 시작 위치를 유지한다.
- `compact`와 `full`은 현재 중앙 컬럼의 검색 상태와 leading action 동작을 유지하면서 `64px` 도구막대 안의
  `48px` 입력을 수직 중앙에 배치한다.
- 검색 초기화 뒤로가기는 현재 `tab`을 유지하면서 검색어와 `q`를 비우고 포커스를 해제한다. 입력 내부 지우기는
  포커스를 유지하며, browser history 뒤로가기와 `q`·`tab` deep link는 기존 동작을 유지한다.
- 모바일 검색 상태에서도 왼쪽 가장자리 스와이프로 drawer를 열 수 있어야 한다.
- Android/iOS에는 이 검색 상단바 통합을 적용하지 않는다.

## 개인정보 처리방침 진입

공개 `/privacy` route와 비로그인 landing의 링크는 유지한다. 인증 후 셸에서는 generic `/menu`를 법적 고지의
영구 위치로 사용하지 않고 full Web 우측 레일에만 보조 진입점을 둔다.

- `≥ full`: 우측 레일 최하단에 `textSecondary` 색의 개인정보 처리방침 footer를 둔다. Production branch
  전환 중에는 표시 tag 공급 방식이 정해지지 않았으므로 기존 `· 버전: <Git tag>` 정적 텍스트를 렌더링하지
  않는다. 선택한 Profile이 없어 컴포저가 표시되지 않아도 개인정보 처리방침 링크는 유지하며, 기존 위치보다
  viewport 하단에 가깝게 배치한다. 표시 tag 공급과 version label 재활성화는 후속 변경에서 결정한다.
- `compact`~`full`: 좁은 아이콘 레일의 공간과 navigation 위계를 보존하기 위해 개인정보 처리방침 진입점을
  포함한 footer를 표시하지 않는다.
- `< compact` mobile Web과 Android/iOS: mobile drawer에 개인정보 처리방침 진입점을 표시하지 않는다.
- 가입·로그인 온보딩 안의 추가 개인정보 처리방침 진입점은 후속 범위에서 결정한다. 현재 범위에서는 공개
  route와 landing 링크, full Web 보조 진입점만 유지하며 준비되지 않은 팔로워 요청 또는 generic menu
  navigation을 다시 만들지 않는다.

## 설정 진입

인증 설정의 canonical route와 정보 구조는 [설정 페이지](./settings.md)가 소유한다.

- `compact` 이상 Web에서는 full sidebar와 compact icon rail의 주요 navigation에 `설정`을 표시한다.
- `< compact` mobile Web과 Android·iOS에서는 mobile drawer에 `설정`을 표시한다. 하단 탭 바와 우측 레일에는
  중복 진입점을 두지 않는다.
- route와 page shell이 같은 구현 slice에서 준비된 뒤 진입점을 노출하며, 준비되지 않은 placeholder route를
  먼저 만들지 않는다.
- `full` Web settings route family에서는 전역 sidebar 다음 공간을 Settings 전용 master-detail workspace로
  사용하고 일반 `RightRail`을 표시하지 않는다.
- `compact` Web, `< compact` mobile Web과 Android·iOS에서는 root 목록과 detail을 한 화면씩 표시하며 내부
  detail에서 back navigation으로 root 목록에 돌아간다.

## 프로필 편집 진입

인증된 사용자의 selected Profile이 서버 권한 계약상 편집 가능할 때만 sidebar의 selected Profile 요약에
`편집` 진입점을 표시한다.

- `>= full` Web sidebar와 `< compact` mobile Web·Android·iOS drawer의 expanded Profile 요약에 표시한다.
  compact Web icon rail에는 expanded Profile 요약이 없으므로 별도 icon이나 navigation 항목을 추가하지 않는다.
  하단 탭 바와 우측 레일에도 중복 진입점을 두지 않는다.
- 기준 geometry는 Figma `KOSMO` 파일의 [`WebSidebar` node 901:610](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=901-610),
  [`UserInfo` node 148:852](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=148-852),
  [`ProfileHero`의 `편집` button node 560:453](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=560-453)과
  [`Button` primary/sm node 271:3](https://www.figma.com/design/Erj975S6vVP8PlHQius801/KOSMO?node-id=271-3)이다.
  320px Profile 요약에서 Figma의 오른쪽 멀티프로필 cluster 바로 아래 좌표(`top: 158`, `right: 20`)에 정렬하고,
  시각 영역은 `72x32`, `primary` 배경, `radius.sm`, SUIT 14px bold의 `편집` label을 사용한다. 현재 production
  Profile 요약에는 그 thumbnail visual이 없으므로 PROD-660은 action만 예약 좌표에 복원하며 thumbnail
  visual·data·전환 interaction은 추가하지 않는다.
- Web pointer target은 시각 영역과 같은 `72x32 CSS px`로 유지한다. iOS와 Android에서는 시각 영역을 키우지
  않고 각각 최소 `44pt`, `48dp` 높이의 투명 입력 slot 중앙에 배치한다.
- action은 canonical `/profile-edit` route를 열고 accessible name `프로필 편집`을 제공한다. `/profile-edit`가
  현재 route이면 page-current semantics를 노출하되 노란 button의 시각 geometry는 바꾸지 않는다.
- mobile drawer에서 실행하면 기존 guarded forward navigation을 거쳐 drawer를 닫는다. 별도 modal이나 주요
  navigation row를 만들지 않는다.
- 노출 여부는 `currentSession.selectedProfile`의 Local Instance와
  `viewerState.membership.role === OWNER`를 함께 확인한다. client는 selected Profile id,
  `Profile.instance.kind`, Membership role 또는 route 존재 하나만으로 권한을 추측하지 않으며, 조건을
  충족하지 않으면 disabled placeholder 없이 action 자체를 숨긴다.
- PROD-541에서 제거한 generic `/menu`의 `프로필 설정` placeholder는 복원하지 않는다. PROD-660은 준비된
  `/profile-edit` route에 연결되는 실제 Profile 편집 진입점만 복원한다.
- 현재 제품 runtime 검증 범위는 Web이다. 공용 mobile drawer와 자동화는 platform별 target·semantics를
  유지하되 Android·iOS 실제 기기·simulator 검증 완료로 일반화하지 않는다.

## 프로필 피커

Web profile picker는 breakpoint별 사이드바 구조에 맞는 surface를 사용한다. 아래 surface·overlay·close
계약은 Android/iOS profile picker의 기존 geometry와 interaction을 바꾸지 않는다. 단, 별도로 명시한
`Profile별 Unread 표시`는 Web·Android·iOS 공통 계약이다.

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

### Profile별 Unread 표시

Profile picker는 Account가 접근할 수 있는 각 Profile에 visible Unread 알림이 있는지를 Web·Android·iOS의
같은 Profile option에서 표시한다. selected Profile도 같은 표시 대상이며, 이 상태는 오른쪽의 기존 선택
check와 별개다.

- Unread가 있는 Profile은 아바타 우상단에 숫자 없는 `12` logical unit(Web CSS px·iOS pt·Android dp) dot을
  겹쳐 표시한다. dot은 semantic `accent` color token을 사용하며 Profile option의 행 폭, label,
  pointer·touch target과 기존 selected check를 밀지 않는다.
- dot 자체는 접근성 트리와 focus 순서에서 숨긴다. Profile option의 accessible name은 기존 표시 이름과
  handle을 유지하고 Unread가 있을 때만 `읽지 않은 알림 있음`을 덧붙인다. 정확한 count는 시각적 UI나
  accessible name에 포함하지 않는다.
- 각 Profile option의 서버 제공 `unreadNotificationCount`가 양수일 때만 dot을 표시한다. count가 `0`이거나
  Profile option을 표시할 수 없으면 잘못된 dot을 표시하지 않는다.
- Profile 전환 성공 뒤 알림 목록과 셸 badge는 기존 actor 전환과 서버 재조회 계약에 따라 새 selected Profile
  상태로 수렴한다.
- 다른 Profile의 알림 내용이나 정확한 count를 현재 화면에 노출하거나, Profile을 자동 전환하거나, 알림을
  자동으로 읽음 처리하지 않는다. Push, OS app icon badge와 realtime delivery도 이 표시가 변경하지 않는다.
- 이 `12` logical unit Profile avatar dot은 아래의 알림 navigation icon용 `8px` dot과 서로 다른 컴포넌트
  계약이다. 기존 셸 badge의 geometry, 실제 count accessible name과 selected Profile 격리 계약은 변경하지
  않는다.

## 알림 Unread badge

모든 셸 단계는 selected Profile의 Unread 상태를 기존 알림 아이콘 우상단 badge로 표시한다. badge는 아이콘 wrapper 안에서 overlay되어 row, touch target과 label layout을 밀지 않는다.

- `< compact` Web과 Android/iOS의 하단 탭 바와 모바일 drawer, `compact`~`full`의 icon-only 레일, `≥ full`의 풀 사이드바 모두 숫자 없는 8px dot을 같은 위치와 스타일로 표시한다.
- `0`은 모든 표면에서 숨기고 양수 count는 Unread가 있다는 사실만 시각적으로 나타낸다.
- dot은 semantic `accent` color token을 사용한다. 숫자나 아이콘이 없는 현재 dot을 위해 foreground 짝 토큰을 선제 정의하지 않는다.
- 실제 count는 진입점의 accessible name에 합쳐 읽는다. 시각적 dot 자체는 별도 focus 대상으로 만들지 않는다.

## 스크롤 소유권

React Native Web의 `(tabs)` 셸은 document/window scroll을 기본 scroll owner로 둔다. 중앙 피드만 별도 internal scroller가 되는 앱형 shell은 이 기준의 목표가 아니다. 사용자가 피드 바깥의 비스크롤 sidebar, 우측 rail, 빈 레이아웃 영역에서 wheel/trackpad를 사용해도 브라우저 기본 document scroll 흐름으로 페이지가 움직여야 한다. Android/iOS 화면은 platform의 `ScrollView`를 사용하되 이 web scroll 계약을 바꾸지 않는다.

- `< compact`에서는 64px 모바일 header가 document scroll 위의 sticky chrome으로 동작하고, 하단 탭 바는 safe-area를 포함한 fixed bottom chrome으로 유지된다. 콘텐츠는 하단 탭 높이와 safe-area를 고려한 bottom padding 또는 scroll padding으로 겹침을 피한다.
- `< compact`에서 mobile drawer가 열리면 drawer 안의 navigation content가 세로 internal scroll owner가 된다. drawer 안에서 profile picker를 연 경우에는 프로필 목록만 그 picker 안에서 다시 스크롤하며, drawer 바깥의 document/body scroll은 잠근다.
- `compact`~`full`에서는 아이콘 레일이 layout flow 안에서 sticky viewport column으로 고정된다. 레일 자체가 스크롤 가능한 콘텐츠를 갖지 않는 한 wheel 입력은 document scroll로 이어진다.
- `compact`~`full` profile picker가 열렸을 때는 overlay drawer 안의 프로필 목록만 internal scroll owner가 된다.
  drawer 밖의 wheel 입력은 기존 document scroll 흐름을 유지한다.
- `≥ full`에서는 풀 사이드바와 우측 레일이 각각 layout flow 안의 sticky column으로 배치된다. 두 rail은 중앙 컬럼과 겹치지 않도록 width 계산에 참여한다.
- `≥ full` profile picker가 열렸을 때는 overlay 안의 프로필 목록만 internal scroll owner가 된다. overlay 밖의
  wheel 입력은 기존 document scroll 흐름을 유지하고 navigation의 layout 위치는 닫힌 상태와 같게 유지한다.
- 우측 레일 콘텐츠가 viewport보다 긴 경우 rail 내부 overflow를 허용할 수 있지만, 중앙 피드를 별도 internal scroller로 만들지는 않는다.
- Web 하단 탭, mobile drawer, compact 아이콘 레일과 full sidebar에서 현재와 다른 shell-level 주요 route를
  여는 forward navigation은 대상 route가 준비된 뒤 document 최상단에서 표시한다. 로딩·빈 상태에서도 이전
  route의 document scroll offset을 대상 route에 노출하지 않는다.
- 브라우저 뒤로/앞으로 history traversal은 browser scroll restoration을 유지한다. 검색 화면의 query-only
  `router.push`/`setParams` 이동은 현재 document scroll과 입력 focus를 보존한다.
- Web의 모바일·compact·full 홈 헤더 브랜드 마크와 shell의 홈 navigation 항목은 모두 홈 진입 control이다.
  다른 route에서 실행하면 기존처럼 홈으로 이동하고, 이미 홈에서 다시 실행하면 document scroll을 매번
  최상단으로 이동하면서 현재 Home Relay 데이터를 서버에서 다시 요청한다. 브랜드 마크는 기존 시각 geometry를
  바꾸지 않고 pointer·keyboard·screen reader에서 같은 결과를 제공하는 navigation control이어야 한다.
- 홈 재선택으로 시작한 새로고침이 진행 중이면 추가 실행도 document scroll은 최상단으로 이동하지만 네트워크
  요청을 중복 시작하지 않는다. 요청이 성공하거나 실패해 종료된 뒤의 다음 실행은 새 요청을 한 번 시작하며,
  이전 요청이 실패했어도 현재 timeline 데이터는 유지한다.
- 이 홈 재선택 정책은 `PROD-610`이 소유한다. 다른 현재 route 재선택, Android/iOS Native 동작, Home 외 Relay
  데이터 정책에는 최상단 이동이나 데이터 새로고침을 추가하지 않는다.
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
