## ADDED Requirements

### Requirement: Search page input form

검색 페이지(`/search`)는 검색어를 입력하고 submit할 수 있는 검색 입력 폼을 제공해야 한다(MUST). 입력값을 비우는 컨트롤을 제공해야 한다(MUST). submit 시 검색어를 URL 쿼리 파라미터 `q`에 반영하고 현재 활성 탭(`tab`)을 유지해야 한다(MUST).

#### Scenario: Submit search term

- **WHEN** 사용자가 검색 입력에 검색어를 입력하고 submit한다
- **THEN** 시스템은 URL을 `/search?q={검색어}`로 갱신한다
- **AND** 현재 활성 탭(`tab`) 값을 유지한다

#### Scenario: Clear search input

- **WHEN** 사용자가 입력 비우기 컨트롤을 선택한다
- **THEN** 시스템은 검색 입력값을 비우고 입력 포커스를 유지한다
- **AND** 검색 후 단계였다면 URL `q`를 제거해, 빈 입력과 결과 영역이 어긋나지 않게 한다

### Requirement: Search page phases

검색 페이지는 검색바 포커스 상태와 제출된 검색어(`q`)에 따라 검색 전·입력 중·검색 후 단계를 구분해 표시해야 한다(MUST). 검색 결과 유형 탭은 검색 후 단계에서만 노출해야 한다(MUST). 검색바 자체도 단계에 따라 외형이 달라져야 한다(MUST): 입력 중에는 검색바에 포커스 강조를 표시하고, 입력값이 있을 때만 비우기 컨트롤을 노출하며, 검색 전이 아닌 단계(입력 중·검색 후)에는 검색 전으로 되돌리는 뒤로가기 컨트롤을 제공해야 한다(MUST).

#### Scenario: Before search

- **WHEN** 검색바가 포커스되지 않았고 제출된 검색어(`q`)도 없다
- **THEN** 시스템은 검색을 안내하는 검색 전 상태를 표시한다
- **AND** 결과 유형 탭과 뒤로가기 컨트롤을 표시하지 않는다

#### Scenario: Return to before-search

- **WHEN** 사용자가 입력 중 또는 검색 후 단계에서 뒤로가기 컨트롤을 선택한다
- **THEN** 시스템은 검색바 포커스를 해제하고 제출된 검색어(`q`)를 비워 검색 전 단계로 되돌린다

#### Scenario: While typing

- **WHEN** 검색바가 포커스된다
- **THEN** 시스템은 입력 중 단계로 최근 검색을 표시한다
- **AND** 결과 유형 탭을 표시하지 않는다

#### Scenario: After search

- **WHEN** 검색바가 포커스되지 않았고 제출된 검색어(`q`)가 있다
- **THEN** 시스템은 검색 후 단계로 결과 유형 탭과 결과 영역을 표시한다

### Requirement: Recent searches

입력 중 단계는 localStorage에 저장된 최근 검색어를 노출해야 한다(MUST). 최근 검색 항목을 선택하면 그 검색어로 검색을 수행하고, 개별 항목을 삭제할 수 있어야 한다(MUST). 이 기능은 백엔드 없이 동작한다.

#### Scenario: Show recent searches

- **WHEN** 검색바가 포커스되고 저장된 최근 검색어가 있다
- **THEN** 시스템은 최근 검색어 목록을 표시한다

#### Scenario: Select a recent search

- **WHEN** 사용자가 최근 검색 항목을 선택한다
- **THEN** 시스템은 그 검색어로 검색을 수행하고 URL `q`를 갱신한다

#### Scenario: Remove a recent search

- **WHEN** 사용자가 최근 검색 항목의 삭제 컨트롤을 선택한다
- **THEN** 시스템은 해당 항목을 최근 검색 목록에서 제거한다

### Requirement: Search result type tabs

검색 후 단계는 인기·최신·미디어·사람 검색 결과 유형 탭을 제공해야 한다(MUST). 활성 탭을 URL 쿼리 파라미터 `tab`(`popular|latest|media|people`)에 반영해야 하며, `tab`이 없으면 사람(`people`)을 기본 활성으로 사용해야 한다(MUST). 탭을 전환할 때 현재 검색어(`q`)를 유지해야 한다(MUST). 사람 외 탭(인기·최신·미디어)은 관련 검색 백엔드가 준비되기 전까지 준비 중 안내를 표시해야 한다(MUST).

#### Scenario: Default active tab

- **WHEN** 사용자가 `tab` 파라미터 없이 검색 후 단계를 본다
- **THEN** 시스템은 사람(`people`) 탭을 활성으로 표시한다

#### Scenario: Switch result type tab

- **WHEN** 사용자가 다른 결과 유형 탭을 선택한다
- **THEN** 시스템은 URL `tab` 파라미터를 해당 탭으로 갱신한다
- **AND** 현재 검색어(`q`) 값을 유지한다

#### Scenario: Not-ready tab placeholder

- **WHEN** 사용자가 인기·최신·미디어 탭을 활성으로 본다
- **THEN** 시스템은 해당 탭 콘텐츠 대신 준비 중 안내를 표시한다

### Requirement: People tab exact handle search results

검색 후 사람 탭은 제출된 검색어(`q`)를 정확 handle로 해석해 기존 `profileByHandle` 조회 결과를 표시해야 한다(MUST). 사람 탭이 아니거나 제출된 검색어가 비어 있으면 handle 조회를 실행하지 않아야 한다(MUST NOT). 검색 결과는 실데이터와 팔로우 액션이 연결된 `ProfileListItem`으로 표시해야 한다(MUST). 검색 결과 항목은 해당 프로필 페이지(`/@{handle}`)로 이동할 수 있어야 한다(MUST). prefix, display name, fediverse 검색은 이 범위에서 제공하지 않는다(MUST NOT).

#### Scenario: Existing handle result

- **WHEN** 사용자가 존재하는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 `profileByHandle` 결과를 `ProfileListItem`으로 표시한다
- **AND** 결과 항목의 프로필 정보 영역은 `/@{handle}` 프로필 페이지로 이동한다
- **AND** 결과 항목의 팔로우 액션은 기존 `ProfileListItem`/`FollowButton` 정책에 따라 표시되거나 숨겨진다

#### Scenario: Missing handle result

- **WHEN** 사용자가 존재하지 않는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 `profileByHandle` 조회를 실행하지 않는다

### Requirement: People tab search states

검색 후 사람 탭은 로딩, 오류, 결과 없음(empty) 상태를 표시할 수 있어야 한다(MUST). 로딩 스켈레톤은 프로필 항목 형태로 표시하고 스크린리더용 로딩 안내를 제공해야 하며, 색·반경은 시맨틱 디자인 토큰으로 라이트/다크에 대응해야 한다(MUST). 기존 결과 데이터가 있으면 로딩 또는 오류 중에도 기존 결과를 유지해야 한다(SHOULD).

#### Scenario: Loading state

- **WHEN** 사람 탭이 로딩 상태다
- **THEN** 시스템은 프로필 항목 형태의 로딩 스켈레톤을 표시한다
- **AND** 스켈레톤 시각 요소는 보조 기술에 노출하지 않고, 스크린리더에는 검색 로딩 안내를 제공한다

#### Scenario: Error state

- **WHEN** 사람 탭 검색이 실패했고 표시할 기존 결과가 없다
- **THEN** 시스템은 오류 상태와 다시 시도 동작을 표시한다

#### Scenario: Empty result state

- **WHEN** 검색어로 일치하는 프로필이 없다
- **THEN** 시스템은 결과 없음 안내를 표시한다
