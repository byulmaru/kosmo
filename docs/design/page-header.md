# 공용 Page Header

주요 화면의 상단 chrome은 `PageHeader`를 사용해 높이, 구분선, 제목 위계와 leading action 배치를 통일한다. 공용 헤더의 기본 시각 최소 높이는 `64px`이며 Android/iOS safe-area inset은 헤더가 아니라 모바일 셸이 바깥에서 추가한다.

## Variant

- `text`: `알림`, `북마크`, `글쓰기`, `게시글`처럼 현재 화면을 설명하는 텍스트 제목을 표시한다. 제목은 하나의 heading으로 노출한다.
- `text` 제목은 leading action 다음의 가용 폭 안에서 줄어들고 여러 줄로 reflow한다. `64px`은 고정 높이가
  아니라 최소 높이이므로, 좁은 화면이나 font scaling에서 제목을 한 줄로 자르거나 header 밖으로 넘기지 않는다.
- `brand`: 홈에서 투명 브랜드 마크를 너비 `38px`로 가로 중앙에 표시한다. 좌우에 같은 `44×44px` action slot을 두는 대칭 Auto Layout을 사용해 한쪽 action만 있어도 마크의 중심이 헤더 전체 중심과 일치하게 한다. 비어 있는 우측 slot은 향후 홈 action 위치로 유지한다. 마크 이미지는 접근성 트리에서 숨기고 `홈` heading 하나만 노출한다.

## Action slot

- `leading` prop은 모바일 홈의 메뉴 버튼과 게시글 상세의 뒤로가기처럼 제목 왼쪽의 화면별 action을 받는다. touch target은 각 action이 소유한다. 모바일 홈 메뉴는 테두리나 텍스트 라벨 없이 햄버거 아이콘만 표시하되 `44×44px` touch target과 접근 가능한 이름을 유지하고, 게시글 상세 뒤로가기도 `44×44px`를 유지한다.
- `text` variant에서 leading action과 제목 사이에는 `spacing.lg`(`16px`)를 두어 `24px` 아이콘과 제목의 시각 간격을 약 `26px`로 유지한다. `brand` variant의 대칭 action slot에는 이 간격을 적용하지 않는다.
- `trailing` prop은 `text` variant 제목과 분리되어 헤더 오른쪽 끝에 정렬되는 화면별 action을 받는다. trailing action은 자기 touch target, 접근 가능한 이름과 disabled 상태를 소유하며, action 유무에 따라 제목 heading이나 헤더 높이를 바꾸지 않는다.

### Web 알림 모두 읽음

- Web `/notifications`의 trailing action은 기존 공용 `Button`의 secondary 표현(흰 배경과 `border` 색상 테두리)으로 `모두 읽음` 텍스트를 표시한다. `<768px` 모바일 Web에서는 `UniversalShell`이, compact/full Web에서는 알림 route가 소유한 `PageHeader`가 렌더링한다. Android/iOS에는 이 action을 표시하지 않는다.
- action은 클릭 시점에 현재 Relay connection에 로드된 unread Notification ID만 처리하며, 아직 로드하지 않았거나 요청 이후 새로 도착한 Notification을 처리하기 위해 추가 page를 먼저 가져오지 않는다.
- 현재 로드된 unread item이 없거나 요청 중이면 action을 disabled 처리하고 접근성 상태에도 반영한다.
- 성공 뒤 처리된 item은 목록에 남고 Unread 강조만 제거된다. 전역 인디케이터는 서버 count로 수렴하므로 아직 처리하지 않은 unread item이 있으면 `모두 읽음` 성공 뒤에도 남을 수 있다.
- pending 또는 실패 중에는 item 강조와 전역 인디케이터를 낙관적으로 제거하지 않는다. 실패하면 기존 앱
  toast로 `알림을 모두 읽지 못했어요.`와 `다시 시도` action을 제공하고, 재시도 시점의 current Relay
  connection에 로드된 unread Notification ID를 다시 수집한다.

## Web 검색 헤더

Web `/search`는 모든 breakpoint에서 중앙 컬럼 최상단에 높이 `64px`의 검색 도구막대를 사용한다. 검색 입력은
모든 Web breakpoint에서 높이 `48px`와 위·아래 `8px` 여백을 사용한다. 도구막대 위나 바깥에 별도 여백을 두지
않으며, 최근 검색, 검색 결과와 empty 상태 등 도구막대 아래 콘텐츠만 기존 본문 여백을 사용한다.

검색 route가 검색 입력, `q`·`tab`, 포커스와 검색 상태를 계속 소유한다. 모바일 Web `< compact`에서는
`UniversalShell`이 기본 메뉴 전용 헤더를 중복 렌더링하지 않으며, 셸은 drawer 상태와 왼쪽 가장자리 스와이프
열기 동작을 계속 소유한다.

- 모바일 Web 최초 상태의 leading action은 햄버거 메뉴다. 입력 중과 결과 상태에서는 같은 `44×44px` 자리를
  뒤로가기로 교체한다. leading action이 바뀌어도 입력 영역의 시작점과 사용 가능한 너비는 바뀌지 않는다.
- 뒤로가기는 실제 browser history를 이동하지 않는다. 검색어와 `q`를 비우고 입력 포커스를 해제해 현재
  `tab`의 최초 검색 상태로 돌아간다.
- 입력 안의 지우기 action은 검색어와 `q`를 비우되 입력 포커스를 유지한다. browser 뒤로가기와 `q`·`tab`
  deep link는 기존 Expo Router 계약을 유지한다.
- 검색 입력은 모든 Web breakpoint에서 `48px` 높이와 유연한 너비를 사용한다. 긴 입력이나 좁은 viewport에서도
  leading action과 지우기 action의 target을 줄이지 않는다.
- 햄버거와 검색 뒤로가기는 각각 실제 동작에 맞는 접근 가능한 이름과 `44×44px` target을 제공한다.
- 검색 상태에서도 셸의 왼쪽 가장자리 스와이프가 drawer를 열 수 있어야 한다.
- Android/iOS 검색 헤더는 이 계약의 적용 대상이 아니다.

## 소유권

- 모바일 Web과 Android/iOS `/home`: `UniversalShell`이 메뉴 버튼, 브랜드 마크와 native safe-area를 소유한다. 홈 route는 헤더를 렌더링하지 않는다.
- Web `/search`: 검색 route가 모든 breakpoint의 `64px` 검색 도구막대와 검색 상태를 소유한다. 모바일 Web
  `< compact`에서 `UniversalShell`은 기본 메뉴 전용 헤더 대신 drawer action과 가장자리 스와이프만 제공한다.
- `<768px` 모바일 Web `/compose`, `/notifications`와 `/settings` root: `UniversalShell`이 메뉴 버튼과 텍스트 제목을 하나의 app bar로 렌더링한다. `/notifications`에서는 같은 app bar가 `모두 읽음` trailing action도 소유하고, Settings 내부 category·detail destination에서는 같은 위치에 뒤로가기와 현재 destination 제목을 렌더링한다. route의 loading, error, empty와 content 상태는 셸 헤더 아래에서 전환하며 자체 PageHeader를 렌더링하지 않는다.
- `<768px` 모바일 Web 게시글 상세: `UniversalShell`이 기존 `router.back()` 동작을 사용하는 뒤로가기 버튼과 `게시글` 제목을 하나의 app bar로 렌더링한다. route는 별도 sticky PageHeader와 그 offset을 만들지 않는다.
- Android/iOS의 알림·글쓰기·게시글 상세와 compact/full Web: 모바일 Web 셸 헤더가 없으므로 route 또는 화면의 최상위 scroll content가 기존 텍스트·뒤로가기 헤더를 소유한다. Native 게시글 상세에서는 `PostDetailFrame`이 첫 번째 sticky child를 계속 소유한다.
- Android/iOS와 compact Web의 `/settings` root·category·detail destination: settings route가 현재 화면의 text header를 scroll content의 첫 heading으로 소유한다. category·detail header는 뒤로가기를 제공하고 Native safe area는 모바일 셸이 바깥에서 소유한다.
- full Web의 settings route family: Settings master pane이 `설정` heading을, detail pane이 현재 설정 heading을 소유한다. 일반 route `PageHeader`와 `RightRail`을 중복하지 않는다.
- 북마크 등 이 변경에 포함되지 않은 PageHeader 소비 화면은 기존 route 소유권을 유지한다.
- compact/full Web `/home`: 모바일 셸 헤더가 없으므로 홈 route가 브랜드 헤더를 소유한다.

`PageHeader` 자체는 safe-area, sticky 위치, scroll container 또는 route 상태를 소유하지 않는다. 따라서 새로운 화면도 헤더를 scroll/sticky 구조의 올바른 위치에 배치하고, 화면 상태별로 별도 헤더를 복제하지 않는다.

홈 타임라인은 헤더 바로 다음에서 시작하며 타임라인 wrapper에 상하 여백을 추가하지 않는다. 게시글 열의 기존 좌우 여백은 유지한다.
