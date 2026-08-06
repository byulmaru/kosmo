## MODIFIED Requirements

### Requirement: Web 검색 상단바 geometry와 소유권

**Authority / Provenance:** `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-590`, PROD-590 owner confirmation on 2026-08-06 — Web `/search`는 모든 breakpoint에서 중앙 컬럼 최상단에 높이 `64px`의 route 소유 검색 도구막대를 표시해야 한다(MUST). 그 안의 검색 입력은 모든 Web breakpoint에서 높이 `48px`를 사용해야 한다(MUST). 도구막대 위의 `32px` 상단 여백과 도구막대 바깥 가로 여백은 제거하되, 최근 검색·검색 결과·empty 상태 등 도구막대 아래 콘텐츠의 기존 본문 여백은 유지해야 한다(MUST). `compact` 미만 모바일 Web에서는 셸의 메뉴 전용 헤더와 route 검색 도구막대를 중복 렌더링해서는 안 된다(MUST NOT). 최초 검색 상태에는 `44×44px` leading 영역의 햄버거 메뉴를 표시하고, 입력 중·검색 후 상태에는 같은 영역을 현재 `tab`의 최초 검색 상태로 돌아가는 검색 초기화 뒤로가기로 교체해야 한다(MUST). 이 전환은 도구막대 높이, 검색 입력의 시작점과 본문 시작 위치를 바꾸지 않아야 한다(MUST NOT). 검색 초기화 뒤로가기는 실제 browser history를 이동하지 않고 검색 입력과 URL `q`를 비우며 포커스를 해제해야 한다(MUST). 입력 내부 지우기는 검색 입력과 URL `q`를 비우되 포커스를 유지해야 한다(MUST). 기존 `q`·`tab` deep link, browser back/forward, query-only navigation 위치·포커스 보존과 모바일 왼쪽 edge swipe drawer 동작은 유지해야 한다(MUST). Android/iOS 검색 헤더는 변경해서는 안 된다(MUST NOT).

#### Scenario: 모든 Web breakpoint에서 검색 도구막대 정렬

- **WHEN** 사용자가 `390px`, `900px` 또는 `1400px` Web viewport에서 `/search`를 연다
- **THEN** 중앙 컬럼 최상단의 검색 도구막대 높이는 `64px`다
- **AND** 검색 입력 높이는 세 viewport에서 모두 `48px`다
- **AND** 도구막대 위와 바깥에는 별도 route 여백이 없다
- **AND** 도구막대 아래 콘텐츠는 기존 본문 여백을 유지한다

#### Scenario: 모바일 최초 검색 상태에서 단일 상단바 표시

- **WHEN** 사용자가 `compact` 미만 모바일 Web에서 포커스되지 않고 `q`가 없는 `/search`를 본다
- **THEN** 시스템은 route 검색 도구막대 하나만 표시하고 셸의 메뉴 전용 헤더를 별도로 표시하지 않는다
- **AND** `44×44px` leading 영역에 접근 가능한 햄버거 메뉴를 표시한다
- **AND** 사용자가 햄버거 메뉴를 실행하면 셸이 소유한 모바일 drawer를 연다

#### Scenario: 모바일 입력·결과 상태에서 검색 초기화

- **WHEN** 사용자가 `compact` 미만 모바일 Web에서 검색 입력에 포커스하거나 `q`가 있는 검색 결과를 본다
- **THEN** 햄버거 메뉴와 같은 `44×44px` leading 영역에 검색 초기화 뒤로가기를 표시한다
- **AND** 도구막대 높이, 검색 입력 시작점과 본문 시작 위치는 최초 상태와 같다
- **AND** 사용자가 뒤로가기를 실행하면 현재 `tab`을 유지하고 검색 입력과 `q`를 비운 뒤 입력 포커스를 해제한다
- **AND** browser history stack을 직접 뒤로 이동하지 않는다

#### Scenario: 입력 내부 지우기와 URL 상태 보존

- **WHEN** 사용자가 검색 입력 내부 지우기를 실행한다
- **THEN** 시스템은 검색 입력과 URL `q`를 비우고 현재 `tab`을 유지한다
- **AND** 검색 입력 포커스를 유지한다

#### Scenario: 기존 검색 navigation과 drawer gesture 보존

- **WHEN** 사용자가 `q`·`tab` deep link, 검색어·탭 query-only navigation, browser back/forward 또는 모바일 왼쪽 edge swipe를 사용한다
- **THEN** 기존 URL, document 위치, 입력 포커스와 history 복원 계약이 유지된다
- **AND** 모바일 왼쪽 edge swipe는 검색 상태와 관계없이 drawer를 연다

#### Scenario: Native 검색 헤더 유지

- **WHEN** 사용자가 Android 또는 iOS에서 `/search`를 연다
- **THEN** 시스템은 기존 Native 검색 헤더 구조와 동작을 유지한다
