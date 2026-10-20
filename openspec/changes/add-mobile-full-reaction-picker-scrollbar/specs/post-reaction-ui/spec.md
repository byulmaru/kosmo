## ADDED Requirements

### Requirement: 모바일 Full Picker의 일시 표시 스크롤바와 빠른 이동

시스템은 모바일 Web·iOS·Android Full Picker의 스크롤 가능한 목록에서 스크롤 중 현재 위치를 보여 주는 바를 제공해야 한다(SHALL). 표시된 바를 드래그해 목록을 빠르게 이동할 수 있어야 한다(SHALL). 드래그하는 동안에는 바의 표시를 유지하고 조작이 끝나면 다시 숨겨야 한다(SHALL). 이모지 표시·선택·검색·일반 스크롤과 Native 시트 핸들 조작을 방해해서는 안 된다(MUST NOT).

**Source Context:** 2026-10-20 현재 대화의 사용자 결정, [PROD-1163](https://linear.app/byulmaru/issue/PROD-1163), `docs/design/reactions.md`, `docs/design/accessibility.md`. 이 문서는 확정된 범위를 검증하기 위한 세션 메모다.

#### Scenario: 일반 스크롤 중 위치 확인

- **WHEN** 각 적용 플랫폼의 긴 Browse 또는 SearchResults 목록을 터치로 스크롤한다
- **THEN** 바가 표시되고 현재 목록 위치와 이동 가능한 범위를 반영한다
- **AND** 관성 스크롤과 바 조작이 끝나면 상시 표시로 남지 않는다

#### Scenario: 표시된 바를 잡아 빠르게 이동

- **WHEN** 스크롤 중 표시된 바를 잡아 목록의 앞·중간·끝 방향으로 드래그한다
- **THEN** 목록과 바가 같은 유효 위치로 이동하고 처음과 마지막 항목까지 도달할 수 있다
- **AND** 바를 잡고 있는 동안에는 표시가 사라지지 않는다
- **AND** 이모지가 선택되거나 Native 시트가 펼쳐지거나 접히거나 닫히지 않는다

#### Scenario: 조작 종료와 취소

- **WHEN** 바 드래그를 놓거나 플랫폼이 조작을 취소한다
- **THEN** 목록 위치가 유효 범위에 머물고 이후 일반 스크롤과 이모지 선택을 정상적으로 수행할 수 있다
- **AND** 남아 있는 gesture나 숨겨진 touch layer가 입력을 가로채지 않는다

#### Scenario: 검색과 크기 변경

- **WHEN** 검색어·결과 수·viewport·글자 크기 또는 Native 시트 높이가 바뀐다
- **THEN** 바는 현재 목록과 표시 영역에 맞는 범위와 위치를 반영한다
- **AND** 검색어 변경 시 기존 목록의 첫 위치 복귀와 검색 focus를 유지한다
- **AND** 이전 목록의 조작 대상이나 범위를 새 목록에 남기지 않는다

#### Scenario: 이동할 목록이 없는 상태

- **WHEN** 목록이 표시 영역 안에 모두 들어가거나 Empty·Loading 상태가 된다
- **THEN** 이동할 바와 그 입력 영역을 표시하지 않는다
- **AND** 검색·기존 상태 표현·닫기 동작은 유지한다

#### Scenario: 기존 탐색과 플랫폼 경계 유지

- **WHEN** 바를 조작하지 않고 이모지를 선택하거나 검색·keyboard·보조 기술로 목록을 탐색한다
- **THEN** 기존 경로를 계속 사용할 수 있고 이모지 target이 바의 입력 영역에 가려지지 않는다
- **AND** 모바일 Web은 Web dialog, Native는 bottom sheet를 유지한다
- **AND** Desktop Web의 기존 동작은 변경하지 않는다
