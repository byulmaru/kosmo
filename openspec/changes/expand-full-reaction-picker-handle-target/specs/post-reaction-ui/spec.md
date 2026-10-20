## ADDED Requirements

### Requirement: Native Full Picker의 핸들 행 드래그

시스템은 iOS·Android Full Picker의 상단 핸들 행에서 중앙 바와 같은 행의 좌우 여백 모두에서 세로 드래그를 시작할 수 있게 해야 한다(SHALL). 시작한 가로 위치에 관계없이 기존 중앙 핸들과 같은 펼치기·접기·닫기·취소 결과를 제공해야 한다(SHALL). 보이는 바의 크기·위치와 기존 접근성 활성화 동작을 유지해야 한다(SHALL).

**Source Context:** [PROD-1175](https://linear.app/byulmaru/issue/PROD-1175), `docs/design/reactions.md`, `docs/design/accessibility.md`. 이 문서는 확정된 범위를 검증하기 위한 세션 메모다.

#### Scenario: 좌·중앙·우에서 펼치기

- **WHEN** 접힌 Native Picker의 같은 핸들 행에서 왼쪽 여백·중앙 바·오른쪽 여백 각각을 시작점으로 기존 펼치기 조건에 맞는 위쪽 드래그를 수행한다
- **THEN** 세 시작점 모두 같은 펼친 상태에 도달한다
- **AND** 보이는 손잡이의 크기·위치와 검색 입력은 유지된다

#### Scenario: 같은 아래쪽 드래그의 상태별 결과

- **WHEN** 각 시작점에서 기존 완료 조건에 맞는 아래쪽 드래그를 수행한다
- **THEN** 펼친 시트는 초기 높이로 접히고 접힌 시트는 기존 닫기 경로로 닫힌다
- **AND** 시작점 때문에 완료 조건이나 닫기 횟수가 달라지지 않는다

#### Scenario: 짧은 이동과 취소

- **WHEN** 각 시작점의 드래그가 기존 완료 조건에 못 미치거나 완료 전에 취소된다
- **THEN** 중앙 핸들과 같은 상태로 돌아간다
- **AND** 의도치 않은 접기·펼치기·닫기나 남은 이동 상태가 없다

#### Scenario: 인접 입력과의 분리

- **WHEN** 목록에서 스크롤하거나 이모지를 선택하거나 검색 입력을 조작한다
- **THEN** 해당 입력이 정상 동작하고 핸들 드래그로 바뀌지 않는다
- **AND** 기존 backdrop·Android back·접근성 닫기와 중앙 손잡이 활성화 동작을 유지한다

#### Scenario: 플랫폼 경계

- **WHEN** 모바일 Web에서 Full Picker를 연다
- **THEN** 기존 Web dialog·focus·스크롤 동작을 유지하며 Native 핸들 행을 추가하지 않는다
