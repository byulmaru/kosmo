## ADDED Requirements

### Requirement: 탭별 마지막 탐색 맥락 복원

iOS 하단 내비게이션은 같은 Session·선택 Profile 안에서 목적지 탭의 마지막 상세 화면과 탐색 계층을 복원해야 한다(SHALL).
검색어·결과 유형·목록·스크롤과 Home/Local 선택도 하단 탭 왕복으로 불필요하게 초기화하지 않아야 한다(SHALL).

**Source Context:** PROD-1079, 2026-10-10 첫 사용자 선택, `docs/design/breakpoints.md`.

#### Scenario: 검색 상세에서 홈을 방문한 뒤 검색 복귀

- **WHEN** 검색어·결과 유형이 있는 검색 목록을 스크롤하고 Profile 상세를 연 뒤 홈으로 이동했다가 검색 탭을 선택한다
- **THEN** 마지막 Profile 상세를 복원한다
- **AND** header back으로 기존 검색어·결과 유형·목록·스크롤을 가진 검색 root에 돌아간다

#### Scenario: 로컬을 선택한 상태에서 알림 왕복

- **WHEN** Home/Local 중 Local을 선택해 목록을 읽고 알림을 방문한 뒤 홈 항목을 선택한다
- **THEN** Local 선택과 이전 탐색 맥락을 유지한다
- **AND** 탭 switch 자체를 명시적 새로고침으로 취급하지 않는다

### Requirement: 상세와 root의 재선택 구분

현재 iOS 탭의 상세 계층에서 같은 탭을 누르면 해당 root로만 돌아가야 한다(SHALL).
root에서 다시 누르면 Home/Local은 선택을 유지한 채 목록 최상단 이동과 새로고침을 수행해야 한다(SHALL).
검색·알림·프로필 root의 재선택은 목록 최상단으로 이동하며 명시적 재조회·검색어 삭제·자동 키보드 열기를 추가하지 않아야 한다(MUST NOT).

**Source Context:** PROD-1079, 2026-10-10 두 번째 사용자 선택, `docs/design/breakpoints.md`.

#### Scenario: 상세에서 재선택한 뒤 root에서 다시 재선택

- **WHEN** 현재 탭의 상세 화면에서 같은 하단 항목을 누른다
- **THEN** root로 돌아가고 root의 기존 스크롤과 상태를 유지한다
- **AND** 해당 입력으로 root 최상단 이동이나 명시적 새로고침까지 함께 실행하지 않는다

#### Scenario: 로컬 root에서 홈 항목 재선택

- **WHEN** Local root에서 하단 홈 항목을 다시 누른다
- **THEN** Local을 유지하면서 목록 최상단으로 이동하고 현재 Local 데이터를 다시 요청한다

#### Scenario: 검색 결과 root에서 검색 항목 재선택

- **WHEN** 검색 결과 root에서 하단 검색 항목을 다시 누른다
- **THEN** 목록 최상단으로 이동하고 검색어·결과 유형을 유지한다
- **AND** 명시적 재조회·검색어 삭제·자동 키보드 열기를 추가하지 않는다

### Requirement: 중복 입력과 기존 갱신·back·작성 계약 보존

iOS 하단 입력은 빠른 연속 선택으로 중복 navigation·새로고침을 시작하지 않아야 한다(MUST NOT).
기존 refresh 오류·재시도, 상세 push·header/OS back, 작성기 열기·닫기·draft·게시 성공 계약을 보존해야 한다(SHALL).
Web·Android의 기존 navigation과 actor 전환 격리를 이 변경으로 바꾸지 않아야 한다(MUST NOT).

**Source Context:** PROD-1079 범위와 사용자 선택, PROD-963, `docs/design/local-timeline.md`, `docs/design/post-composer.md`, `memory/frontend/relay-operation-env-cache.md`.

#### Scenario: 진행 중인 갱신에서 연속 재선택

- **WHEN** root 재선택으로 Home/Local 갱신을 시작한 뒤 진행 중인 요청에 추가 재선택 입력이 들어온다
- **THEN** 중복 갱신을 시작하지 않는다
- **AND** 성공·실패로 요청이 끝난 뒤의 새 입력은 다시 처리할 수 있다

#### Scenario: 작성기 취소 후 탐색 복귀

- **WHEN** 탭의 상세 화면에서 글쓰기 action으로 작성기를 열고 기존 닫기 동작으로 취소한다
- **THEN** 원래 상세 화면과 해당 탭의 탐색 맥락을 유지한다
- **AND** 기존 같은 Profile lifecycle의 draft 처리와 back 계약을 유지한다

#### Scenario: 탭 보존 중 Profile actor 전환

- **WHEN** 여러 탭을 방문한 상태에서 선택 Profile이나 Session이 바뀐다
- **THEN** 기존 actor 전환 격리를 유지하고 이전 actor의 데이터·권한·작성 내용을 새 actor에 재사용하지 않는다
