## MODIFIED Requirements

### Requirement: Person 단위 검색 결과 선택 전환

시스템은 `people` 검색 결과의 유효한 Profile 링크를 웹의 기본 탐색으로 선택한 person을 분모로 세고, 선택 후 30분 안에 어느 유효한 Profile이든 실제 표시되거나 Follow Relationship 성공 응답을 받은 person을 전환으로 세어야 한다(MUST). 새 탭이나 수정키를 사용한 선택은 분모에서 제외한다. 동일 person의 여러 대상 선택은 분모를 늘리지 않으며 대상 일치는 요구하지 않는다.

#### Scenario: 여러 대상 선택 뒤 일부 성공

- **WHEN** 한 person이 같은 기간에 A·B·C를 선택하고 A·C의 유효한 Profile을 본다
- **THEN** 분모는 1 person, 전체 분자는 1 person이다

#### Scenario: 다른 대상에서 성공

- **WHEN** A 선택 후 A 조회에 실패하고 B를 선택해 B의 유효한 Profile을 본다
- **THEN** 같은 person의 전환은 1이다

#### Scenario: 성공 조건

- **WHEN** 선택 뒤 조회가 로딩·오류·대상 없음으로 끝나거나 Follow Request만 생성된다
- **THEN** 해당 행동은 전환이 아니다
