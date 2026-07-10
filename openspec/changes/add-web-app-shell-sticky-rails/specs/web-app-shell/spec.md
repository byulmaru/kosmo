## ADDED Requirements

### Requirement: Document scroll tab shell

`(tabs)` 앱 셸은 기본 scroll owner로 document/window scroll을 사용해야 한다(MUST). 중앙 `main`은 라우트 콘텐츠를 렌더링하되 셸 전체에서 유일한 internal scroll container가 되어서는 안 된다(MUST NOT). 사용자가 피드 바깥의 비스크롤 shell chrome 또는 레이아웃 영역에서 wheel/trackpad를 사용해도, 시스템은 custom wheel forwarding 없이 브라우저 기본 document scroll 흐름으로 페이지를 스크롤해야 한다(MUST).

#### Scenario: Scroll from shell chrome without forwarding

- **WHEN** 사용자가 `(tabs)` 셸에서 피드 바깥의 비스크롤 sidebar, rail, 또는 빈 레이아웃 영역 위에 포인터를 둔 채 wheel/trackpad로 스크롤한다
- **THEN** 페이지는 브라우저 기본 document/window scroll로 이동한다
- **AND** 시스템은 wheel 이벤트를 중앙 피드 scroller로 인위적으로 전달하지 않는다

#### Scenario: Route content uses document scroll

- **WHEN** `(tabs)` 셸 아래 라우트 콘텐츠가 viewport보다 길다
- **THEN** route content overflow는 document/window scroll 흐름에서 처리된다
- **AND** 중앙 `main`만 별도 내부 세로 scroller가 되는 구조를 요구하지 않는다

#### Scenario: Preserve responsive shell stages

- **WHEN** 사용자가 `md` 미만, `md` 이상 `xl` 미만, `xl` 이상 너비에서 `(tabs)` 셸을 본다
- **THEN** 시스템은 기존 모바일 header/하단 탭, 아이콘 레일, 풀 사이드바/우측 rail 단계와 각 내비게이션 진입점을 유지한다
- **AND** scroll ownership은 모든 단계에서 document/window를 기본으로 한다

### Requirement: Sticky desktop rails

`(tabs)` 셸은 `md` 이상 좌측 sidebar/icon rail과 `xl` 이상 우측 rail을 grid flow 안에 유지하면서 sticky로 배치해야 한다(MUST). 좌우 rail은 baseline 구현에서 `position: fixed` layer로 layout flow 밖에 빠져서는 안 된다(MUST NOT). Rail 콘텐츠가 viewport보다 길어지는 경우 rail 내부 overflow를 허용할 수 있어야 한다(MUST).

#### Scenario: Keep left rail sticky in flow

- **WHEN** 사용자가 `md` 이상 너비에서 긴 `(tabs)` route를 document scroll한다
- **THEN** 좌측 icon rail 또는 full sidebar는 grid column 안에서 viewport에 머문다
- **AND** 좌측 rail은 중앙 콘텐츠와 겹치지 않도록 layout flow에 참여한다

#### Scenario: Keep right rail sticky in flow

- **WHEN** 사용자가 `xl` 이상 너비에서 긴 `(tabs)` route를 document scroll한다
- **THEN** 우측 rail은 grid column 안에서 viewport에 머문다
- **AND** 우측 rail은 중앙 콘텐츠와 겹치지 않도록 layout flow에 참여한다

#### Scenario: Allow independent rail overflow

- **WHEN** 좌측 또는 우측 rail 콘텐츠가 viewport 높이보다 길다
- **THEN** 해당 rail은 document scroll과 별도로 내부 overflow를 처리할 수 있다
- **AND** rail 내부 overflow는 중앙 `main`을 internal scroller로 바꾸는 요구사항이 아니다

### Requirement: Mobile bottom tab overlap policy

모바일 하단 탭은 safe-area를 포함한 fixed bottom chrome으로 유지되어야 한다(MUST). `(tabs)` 라우트 콘텐츠는 fixed bottom tab과 safe-area에 가려지지 않도록 하단 padding 또는 scroll padding을 제공해야 한다(MUST). 이 변경은 하단 탭 IA를 바꾸지 않아야 한다(MUST NOT).

#### Scenario: Keep bottom tab visible on mobile

- **WHEN** 사용자가 `md` 미만 너비에서 `(tabs)` route를 본다
- **THEN** 모바일 하단 탭은 viewport 하단에 표시된다
- **AND** 하단 탭은 safe-area inset을 포함한다

#### Scenario: Prevent bottom content overlap

- **WHEN** 모바일 route 콘텐츠가 viewport보다 길고 사용자가 페이지 하단까지 스크롤한다
- **THEN** 마지막 콘텐츠는 하단 탭과 safe-area에 가려지지 않는다

### Requirement: Document scroll route behavior

`(tabs)` 셸 아래의 route 전환은 Expo Router/browser의 document scroll 정책과 호환되어야 한다(MUST). 일반 path-changing navigation은 새 route 상단에서 시작해야 하며(MUST), 검색 화면의 query-only navigation은 현재 document scroll과 input focus를 유지해야 한다(MUST). 이 변경은 internal scroller 전용 back/forward restoration helper를 도입하지 않아야 한다(MUST NOT).

#### Scenario: Route navigation starts at document top

- **WHEN** 사용자가 `(tabs)` 셸 안에서 일반 내비게이션으로 다른 route로 이동한다
- **THEN** 새 route는 document scroll 상단에서 시작한다

#### Scenario: Preserve search query scroll and focus

- **WHEN** 사용자가 검색 화면에서 검색어 또는 검색 탭을 변경한다
- **THEN** 시스템은 query-only Expo Router navigation 중 현재 document scroll을 유지한다
- **AND** 검색 입력 포커스와 결과 영역 전환은 document scroll 정책과 충돌하지 않는다

#### Scenario: Do not add internal restoration helper

- **WHEN** 사용자가 back/forward navigation을 사용한다
- **THEN** 시스템은 Expo Router/browser의 document scroll restoration과 호환된다
- **AND** 중앙 internal scroller 전용 위치 저장 helper를 요구하지 않는다

### Requirement: Sticky rails verification boundary

`(tabs)` sticky rail 전환은 최소 viewport smoke 검증으로 document scroll, sticky rail 위치, drawer, 하단 탭, 우측 rail, 검색 query scroll/focus, 게시글 상세 sticky header 회귀 여부를 확인해야 한다(MUST). 반응형 앱 내비게이션 E2E suite 전체 구현은 별도 `PROD-233` 범위로 유지해야 한다(MUST).

#### Scenario: Minimum viewport smoke coverage

- **WHEN** sticky rail 전환을 검증한다
- **THEN** 모바일 1개, `md` 이상 `xl` 미만 1개, `xl` 이상 1개 viewport에서 document scroll과 rail sticky 동작을 확인한다
- **AND** drawer open/close, bottom tab, RightRail 위치, 검색 query scroll/focus, 게시글 상세 sticky header의 핵심 회귀를 확인한다

#### Scenario: Leave navigation E2E suite to follow-up

- **WHEN** 구현 중 반응형 내비게이션 E2E suite 전체가 필요해 보인다
- **THEN** 이 변경은 suite 전체를 포함하지 않는다
- **AND** 변경된 shell 기준의 내비게이션 E2E 보강은 후속 `PROD-233` 범위로 남긴다
