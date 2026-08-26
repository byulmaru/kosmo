## MODIFIED Requirements

### Requirement: Primary navigation targets home route

**Authority / Provenance:** `docs/design/local-timeline.md`, `PROD-649` — The app SHALL 공통 내비게이션의 홈 항목을 `/home`으로 연결하고, 현재 경로가 `/home` 또는 `/local`이면 Home/Local
화면군의 active 진입점으로 표시해야 한다(MUST). Local은 별도 사이드바나 하단 탭 항목을 추가해서는 안 된다
(MUST NOT).

#### Scenario: Home navigation links to /home

- **WHEN** 사용자가 사이드바 또는 하단 탭 바의 홈 항목을 본다
- **THEN** 홈 항목의 링크 대상은 `/home`이다

#### Scenario: Home item active on timeline routes

- **WHEN** 현재 경로가 `/home` 또는 `/local`이다
- **THEN** 사이드바·하단 탭 바의 홈 항목이 active로 강조된다

#### Scenario: No standalone Local primary item

- **WHEN** 사용자가 공통 사이드바나 하단 탭 바를 본다
- **THEN** 시스템은 Local 전용 내비게이션 항목을 표시하지 않는다

## ADDED Requirements

### Requirement: Home and Local timeline tabs

**Authority / Provenance:** `docs/design/local-timeline.md`, `PROD-649` — The app SHALL Home과 Local route에 `홈`, `로컬` 순서의 공통 상단 underline 탭을 표시한다. `/home`에서는 `홈`,
`/local`에서는 `로컬`을 선택 상태로 표시하고 비활성 탭 선택 시 해당 canonical route로 이동해야 한다(MUST).
탭은 Page Header 아래에 고정되고 기존 접근 가능한 TabList 상호작용을 유지해야 한다(MUST).
선택 상태는 하단 중앙의 64×4px `action/primary/base` 인디케이터로 표시하고, TabList 하단 전체에는 타임라인
콘텐츠와 구분하는 1px `border/subtle` boundary를 표시해야 한다(MUST). Home과 Local 사이의 세로 border는
표시해서는 안 된다(MUST NOT).

#### Scenario: Navigate between timeline routes

- **WHEN** 사용자가 Home 또는 Local의 비활성 상단 탭을 선택한다
- **THEN** 시스템은 각각 `/home` 또는 `/local` canonical route로 이동하고 해당 탭을 selected로 표시한다

#### Scenario: Keyboard-operable timeline tabs

- **WHEN** 키보드 사용자가 Home/Local 탭에 초점을 둔다
- **THEN** 시스템은 기존 TabList의 방향키, Home, End, Enter와 Space 동작 및 focus-visible 표현을 제공한다

### Requirement: Local timeline route and list rendering

**Authority / Provenance:** `docs/design/local-timeline.md`, `docs/design/accessibility.md`, `PROD-649` — The app SHALL 선택된 Profile이 있는 인증 사용자가 `/local`을 열면 `localTimeline` 첫 20개를 기존
`PostListItem`으로 렌더한다. 목록 항목의 작성자와 카드 선택은 기존 Profile·Post detail route를 사용해야 하며(MUST),
선택 Profile·Relay actor가 바뀌면 이전 actor/store의 Local connection data·edge·cursor를 재사용해서는 안 된다
(MUST NOT).

#### Scenario: Render Local posts

- **WHEN** `/local`의 connection이 Post edge를 반환한다
- **THEN** 시스템은 각 node를 기존 `PostListItem`으로 렌더하고 기존 Profile·Post detail 이동을 유지한다

#### Scenario: Converge a PUBLIC default-created Post

- **WHEN** Local Profile의 기본 공개 범위를 `PUBLIC`으로 저장한 사용자가 새 Composer로 Post를 작성한다
- **THEN** 시스템은 `createPost`에 `PUBLIC`을 전달하고 새로 조회한 `/local` connection에 생성된 Post를 표시한다

#### Scenario: Isolate selected Profile state

- **WHEN** 사용자가 selected Profile을 바꾼다
- **THEN** 시스템은 새 Relay actor/store의 Local connection을 사용하고 이전 connection data·edge·cursor를 표시하지 않는다

#### Scenario: No selected Profile

- **WHEN** 로그인한 사용자에게 selected Profile이 없다
- **THEN** 시스템은 목록 대신 기존 Profile 생성·선택 흐름으로 이어지는 onboarding을 표시한다

### Requirement: Local timeline loading, empty, and error states

**Authority / Provenance:** `docs/design/local-timeline.md`, `docs/design/accessibility.md`, `PROD-649` — The app SHALL Local route의 최초 loading, empty, 최초 error와 retry 상태를 공용 목록·상태 컴포넌트로 제공한다.
상태 문구와 loading announcement는 canonical design 문서를 따라야 한다(MUST).

#### Scenario: Initial Local loading

- **WHEN** Local 첫 page를 불러오는 중이다
- **THEN** 시스템은 공용 StateView loading으로 `로컬 타임라인을 불러오는 중입니다.`를 표시하고 보조 기술에 알린다

#### Scenario: Empty Local timeline

- **WHEN** Local connection에 표시할 edge가 없다
- **THEN** 시스템은 `아직 게시글이 없어요`와 `첫 게시글이 올라오면 여기에 표시돼요.`를 표시한다

#### Scenario: Recover initial Local error

- **WHEN** Local 첫 page 조회가 실패한다
- **THEN** 시스템은 `로컬 타임라인을 불러오지 못했어요`, `잠시 후 다시 시도해주세요.`와 `다시 시도` action을 표시한다
- **AND** 사용자가 action을 실행하면 첫 page를 다시 요청한다

### Requirement: Local timeline refresh and pagination

**Authority / Provenance:** `docs/design/local-timeline.md`, `docs/design/accessibility.md`, `PROD-649` — The app SHALL 선택된 Local 탭을 다시 선택하면 현재 Local 목록의 최신 데이터를 다시 요청한다. 다음 page가
있고 목록 near-end에 도달하면 같은 Local connection에서 최대 20개를 누적해야 하며(MUST), loading과 실패 중에도
기존 목록과 scroll position을 유지해야 한다(MUST).

#### Scenario: Refresh selected Local tab

- **WHEN** 사용자가 이미 선택된 Local 탭을 다시 선택한다
- **THEN** 시스템은 현재 selected Profile의 Local 첫 page를 다시 요청한다

#### Scenario: Append next Local page

- **WHEN** Local connection에 다음 page가 있고 사용자가 목록 near-end에 도달한다
- **THEN** 시스템은 현재 cursor 이후 Post를 최대 20개 요청해 기존 목록 뒤에 누적한다

#### Scenario: Recover next-page error

- **WHEN** Local 다음 page 요청이 실패한다
- **THEN** 시스템은 기존 목록과 scroll position을 유지하고 `게시글을 더 불러오지 못했어요.` toast와 `다시 시도` action을 제공한다
