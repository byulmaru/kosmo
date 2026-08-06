## Context

이 기록은 `PROD-590`의 Web 검색 상단바 계약, `docs/design/page-header.md`와 `docs/design/breakpoints.md`의 소유권·breakpoint 기준, 현재 Expo 검색 route와 UniversalShell의 상태 경계를 구현 전에 정렬한다.

## Decision Records

### Web 검색 상단바는 route가 소유한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-590`
- Status: Active
- Context / Problem: 모바일 Web의 셸 메뉴 헤더와 검색 route 도구막대가 중복되고 breakpoint마다 상단 geometry가 다르지만, 검색 phase와 URL·포커스 상태는 route에 있다.
- Decision Outcome: Web `/search`는 모든 breakpoint의 `64px` 검색 도구막대와 `56px` 입력을 route에서 소유한다. `compact` 미만 모바일 Web에서 셸은 메뉴 전용 헤더를 중복 렌더링하지 않고 drawer와 edge swipe만 계속 소유한다.
- Alternatives Considered: 셸이 검색 도구막대와 검색 phase를 함께 소유하는 방식은 route 상태를 중복시키므로 제외했다. 공용 `PageHeader`가 검색 입력을 소유하는 방식은 text·brand 계약을 불필요하게 확장하므로 제외했다.
- Consequences: route는 모바일 최초 상태의 drawer trigger와 입력·결과 상태의 검색 초기화 action을 같은 leading 영역에 배치해야 한다. 셸은 `/search`의 기본 메뉴 헤더만 억제하고 Native와 다른 route의 header ownership을 유지한다.
- Confirmation / Follow-up: `390px`, `900px`, `1400px` Web geometry와 모바일 drawer button·edge swipe를 검증한다.

### Route는 기존 shell context 경계로 drawer action을 호출한다

- Decision Date: 2026-08-06
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-590`
- Status: Active
- Context / Problem: drawer state와 gesture는 UniversalShell 내부에 있지만 route-owned 검색 도구막대의 hamburger가 같은 drawer를 열어야 한다. 현재 route가 셸 동작을 호출하는 context 경계는 profile switch에 이미 사용된다.
- Decision Outcome: 검색 route는 기존 shell-to-route context 경계를 통해 drawer trigger에 필요한 최소 capability와 상태 의미를 소비한다. drawer state, Modal, close 동작과 edge swipe는 UniversalShell에 유지한다.
- Alternatives Considered: drawer 전용 provider를 새로 만드는 방식은 현재 단일 action에 별도 책임 경계를 만들 실익이 없어 기본안에서 제외했다. 검색 상태를 셸로 올리는 방식은 query·focus ownership을 중복시키므로 제외했다.
- Consequences: shell context contract가 좁게 확장되며, 검색 route의 trigger는 기존 셸 trigger와 같은 접근 가능한 이름·role·`44×44px` target 및 drawer 상태 의미를 제공해야 한다. 공용 `PageHeader` API는 바꾸지 않는다.
- Confirmation / Follow-up: context 소비처와 shell layout 단위 테스트, 모바일 Web 검색 E2E에서 trigger와 drawer open을 검증한다.

### 검색 navigation 동작은 geometry 변경과 분리한다

- Decision Date: 2026-08-06
- Decision Class: Derived Contract
- Authority / Provenance: `docs/design/page-header.md`, `docs/design/breakpoints.md`, `PROD-590`
- Status: Active
- Context / Problem: 검색 상단바 위치를 바꾸면서 입력 내부 지우기, 검색 초기화, `q`·`tab`, browser history와 query-only 위치·포커스 복원이 함께 회귀할 수 있다.
- Decision Outcome: 입력 내부 지우기는 포커스를 유지하고, 검색 초기화 뒤로가기는 현재 `tab`을 유지한 채 입력과 `q`를 비우고 blur한다. browser history를 직접 이동하지 않으며 기존 query navigation과 deep link 흐름을 유지한다.
- Alternatives Considered: 지우기와 검색 초기화를 하나의 handler로 합치는 방식, 뒤로가기에서 browser history를 직접 이동하는 방식은 서로 다른 승인 동작을 잃으므로 제외했다.
- Consequences: layout 변경에 필요하지 않은 router·query navigation 로직은 유지해야 하며, 관련 동작은 기존 E2E에 최소 assertion을 추가해 검증한다.
- Confirmation / Follow-up: clear·back focus, `tab` 유지, deep link와 browser back/forward 회귀를 scoped Web E2E로 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
