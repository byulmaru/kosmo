# 공용 Page Header

주요 화면의 상단 chrome은 `PageHeader`를 사용해 높이, 구분선, 제목 위계와 leading action 배치를 통일한다. 공용 헤더의 시각적 높이는 `64px`이며 Android/iOS safe-area inset은 헤더가 아니라 모바일 셸이 바깥에서 추가한다.

## Variant

- `text`: `알림`, `북마크`, `글쓰기`, `게시글`처럼 현재 화면을 설명하는 텍스트 제목을 표시한다. 제목은 하나의 heading으로 노출한다.
- `brand`: 홈에서 투명 브랜드 마크를 너비 `38px`로 가로 중앙에 표시한다. 마크 이미지는 접근성 트리에서 숨기고 `홈` heading 하나만 노출한다.
- `leading`: 모바일 홈의 메뉴 버튼과 게시글 상세의 뒤로가기처럼 제목 왼쪽의 화면별 action을 받는다. touch target은 각 action이 소유한다. 모바일 홈 메뉴는 테두리나 텍스트 라벨 없이 햄버거 아이콘만 표시하되 `44×44px` touch target과 접근 가능한 이름을 유지하고, 게시글 상세 뒤로가기도 `44×44px`를 유지한다.

## 소유권

- 모바일 Web과 Android/iOS `/home`: `UniversalShell`이 메뉴 버튼, 브랜드 마크와 native safe-area를 소유한다. 홈 route는 헤더를 렌더링하지 않는다.
- compact/full Web `/home`: 모바일 셸 헤더가 없으므로 홈 route가 브랜드 헤더를 소유한다.
- 알림, 북마크, 글쓰기: route 또는 화면의 최상위 scroll content가 텍스트 헤더를 소유한다. loading, error, empty와 content 상태 모두 같은 헤더 아래에서 전환한다.
- 게시글 상세: route가 뒤로가기와 텍스트 헤더를 구성하고 `PostDetailFrame`이 sticky 위치와 native scroll의 첫 번째 sticky child를 계속 소유한다.

`PageHeader` 자체는 safe-area, sticky 위치, scroll container 또는 route 상태를 소유하지 않는다. 따라서 새로운 화면도 헤더를 scroll/sticky 구조의 올바른 위치에 배치하고, 화면 상태별로 별도 헤더를 복제하지 않는다.

홈 타임라인은 헤더 바로 다음에서 시작하며 타임라인 wrapper에 상하 여백을 추가하지 않는다. 게시글 열의 기존 좌우 여백은 유지한다.
