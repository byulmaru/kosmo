## ADDED Requirements

### Requirement: Internal scroll app shell

`(tabs)` 앱 셸은 document/window scroll에 의존하지 않는 viewport 고정 app shell로 동작해야 한다(MUST). 셸 chrome(모바일 header, 모바일 하단 탭, 데스크톱 sidebar/icon rail, 우측 rail)은 viewport 기준으로 배치되어야 하며(MUST), 라우트 콘텐츠가 길어질 때는 중앙 콘텐츠 영역의 내부 scroll container만 세로로 스크롤되어야 한다(MUST). 이 요구사항은 기존 `md`/`xl` 반응형 shell 단계를 유지해야 한다(MUST).

#### Scenario: Scroll content without moving shell chrome

- **WHEN** 사용자가 `(tabs)` 셸 아래의 긴 콘텐츠 화면을 스크롤한다
- **THEN** 중앙 콘텐츠 영역의 내부 scroll container만 스크롤된다
- **AND** 모바일 header, 모바일 하단 탭, 데스크톱 sidebar/icon rail, 우측 rail은 중앙 콘텐츠 스크롤과 함께 움직이지 않는다

#### Scenario: Prevent document scroll in tab shell

- **WHEN** `(tabs)` 셸 아래 라우트 콘텐츠가 viewport보다 길다
- **THEN** `(tabs)` shell 자체는 document/window scroll을 발생시키지 않는다
- **AND** 콘텐츠 overflow는 중앙 내부 scroll container 안에서 처리된다

#### Scenario: Preserve responsive shell stages

- **WHEN** 사용자가 `md` 미만, `md` 이상 `xl` 미만, `xl` 이상 너비에서 `(tabs)` 셸을 본다
- **THEN** 시스템은 기존 모바일 header/하단 탭, 아이콘 레일, 풀 사이드바/우측 rail 단계와 각 내비게이션 진입점을 유지한다
- **AND** 각 단계에서 중앙 콘텐츠만 내부 scroll ownership을 가진다

### Requirement: Internal scroll route behavior

`(tabs)` 셸 아래의 라우트 전환과 라우트별 sticky UI는 내부 scroll container 기준으로 동작해야 한다(MUST). 일반 라우트 이동은 새 화면의 내부 scroller 상단으로 이동해야 하며(MUST), 검색 화면의 `noScroll`/`data-sveltekit-noscroll` 동작은 유지되어야 한다(MUST). 게시글 상세의 sticky header는 document/window가 아니라 중앙 내부 scroll container 기준으로 고정되어야 한다(MUST).

#### Scenario: Route navigation starts at internal scroll top

- **WHEN** 사용자가 `(tabs)` 셸 안에서 일반 내비게이션으로 다른 라우트로 이동한다
- **THEN** 새 라우트의 중앙 내부 scroll container는 상단 위치에서 시작한다

#### Scenario: Preserve search noScroll behavior

- **WHEN** 사용자가 검색 화면에서 검색어 또는 검색 탭을 변경한다
- **THEN** 시스템은 기존 `noScroll`/`data-sveltekit-noscroll` 정책을 유지한다
- **AND** 검색 입력 포커스와 결과 영역 전환은 내부 scroll container 안에서 깨지지 않는다

#### Scenario: Post detail sticky header follows internal scroller

- **WHEN** 사용자가 게시글 상세 화면을 내부 scroll container 안에서 스크롤한다
- **THEN** 게시글 상세 header는 중앙 내부 scroll container 기준으로 sticky 동작을 유지한다
- **AND** shell chrome은 게시글 상세 스크롤과 함께 움직이지 않는다

### Requirement: Right rail shell column placement

우측 rail은 document/window sticky에 의존하지 않고 `(tabs)` shell grid의 `xl` 이상 우측 column 안에서 배치되어야 한다(MUST). 우측 rail 콘텐츠가 viewport보다 길어지는 경우, 우측 rail은 중앙 콘텐츠와 독립된 내부 overflow를 가질 수 있어야 한다(MUST).

#### Scenario: Place right rail without document sticky

- **WHEN** 사용자가 `xl` 이상 너비에서 `(tabs)` 셸을 본다
- **THEN** 우측 rail은 shell grid의 우측 column 안에 배치된다
- **AND** 우측 rail 위치는 document/window sticky에 의존하지 않는다

#### Scenario: Right rail overflow is independent

- **WHEN** 우측 rail 콘텐츠가 viewport 높이보다 길다
- **THEN** 우측 rail은 중앙 콘텐츠 scroll container와 독립적으로 overflow를 처리할 수 있다
- **AND** 중앙 콘텐츠 스크롤은 우측 rail 위치를 이동시키지 않는다

### Requirement: Internal scroll verification boundary

`(tabs)` 내부 scroll 전환은 최소 viewport smoke 검증으로 shell chrome 고정, 중앙 내부 스크롤, drawer, 하단 탭, 우측 rail, 검색 `noScroll`, 게시글 상세 sticky header 회귀 여부를 확인해야 한다(MUST). 반응형 앱 내비게이션 E2E suite 전체 구현은 별도 `PROD-233` 범위로 유지해야 한다(MUST).

#### Scenario: Minimum viewport smoke coverage

- **WHEN** 내부 scroll 전환을 검증한다
- **THEN** 모바일 1개, `md` 이상 `xl` 미만 1개, `xl` 이상 1개 viewport에서 shell chrome 고정과 중앙 내부 스크롤 동작을 확인한다
- **AND** drawer open/close, bottom tab, RightRail 위치, 검색 `noScroll`, 게시글 상세 sticky header의 핵심 회귀를 확인한다

#### Scenario: Leave navigation E2E suite to follow-up

- **WHEN** 구현 중 반응형 내비게이션 E2E suite 전체가 필요해 보인다
- **THEN** 이 변경은 suite 전체를 포함하지 않는다
- **AND** 변경된 shell 기준의 내비게이션 E2E 보강은 후속 `PROD-233` 범위로 남긴다
