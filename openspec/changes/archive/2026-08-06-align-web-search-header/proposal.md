## Why

현재 Web `/search`는 모바일 셸의 메뉴 전용 헤더와 route 검색 도구막대가 중복되고, compact/full에서도 검색 도구막대 위와 바깥에 별도 여백이 있어 breakpoint마다 상단 구조와 본문 시작 위치가 달라진다. 검색 상태·URL·포커스 계약은 유지하면서 모든 Web breakpoint의 검색 상단 구조를 하나의 기준으로 정렬해야 한다.

## What Changes

- 모든 Web breakpoint에서 중앙 컬럼 최상단에 높이 `64px`의 검색 도구막대와 높이 `56px`의 검색 입력을 표시한다.
- 검색 도구막대 위의 `32px` 여백과 도구막대 바깥 가로 여백을 제거하고, 최근 검색·결과·empty 콘텐츠에는 기존 본문 여백을 유지한다.
- 모바일 Web 최초 상태에는 햄버거 메뉴를, 입력 중·결과 상태에는 같은 leading 영역의 검색 초기화 뒤로가기를 표시하며 셸의 메뉴 전용 헤더는 중복 렌더링하지 않는다.
- 검색 초기화와 입력 내부 지우기의 서로 다른 포커스 동작, 현재 `tab`, `q` deep link, browser history, query-only navigation 위치와 drawer 가장자리 스와이프를 유지한다.
- 관련 PageHeader와 breakpoint 디자인 문서를 같은 계약으로 정렬한다.

## Authority / Provenance

- Canonical: `docs/design/page-header.md`, `docs/design/breakpoints.md`
- Linear Contract: `PROD-590`
- Linear Implementations: `PROD-590`

## Capabilities

### New Capabilities

없음.

### Modified Capabilities

- `web-app-shell`: Web 검색 route의 상단 도구막대 geometry, 모바일 셸과 route의 헤더 소유권, 상태별 leading action과 기존 검색·drawer 동작 보존 요구사항을 추가한다.

## Impact

- Web 검색 route의 상단 도구막대와 본문 여백 구조
- 모바일 Web 셸의 `/search` 헤더 렌더링과 route에서 호출하는 drawer action
- 검색 화면과 셸 레이아웃의 단위·Web E2E 검증
- `docs/design/page-header.md`, `docs/design/breakpoints.md`
- 검색 API, 결과 데이터·랭킹·필터, 새 route, sidebar/right rail, Android/iOS 검색 헤더, 외부 의존성에는 영향이 없다.
