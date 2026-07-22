## ADDED Requirements

### Requirement: Reaction 선택 component

클라이언트는 현재 허용된 여섯 Reaction Type을 선택하고 selected Profile의 Reaction 추가·삭제 상태를 조작하는 재사용 component를 제공해야 한다(MUST).

#### Scenario: 초기 선택지 표시

- **WHEN** Reaction 선택 component를 연다
- **THEN** component는 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈`만 표시한다
- **AND** selected Profile이 이미 남긴 Type을 선택 상태로 표시한다

#### Scenario: 선택하지 않은 Type 추가

- **WHEN** 사용자가 선택하지 않은 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Type의 멱등 추가 mutation을 실행한다
- **AND** 성공 결과를 selected Profile의 Post Reaction cache에 반영한다

#### Scenario: 선택한 Type 삭제

- **WHEN** 사용자가 이미 선택한 Reaction Type을 누른다
- **THEN** 클라이언트는 해당 Reaction의 멱등 삭제 mutation을 실행한다
- **AND** 성공 결과를 selected Profile의 Post Reaction cache에 반영한다

#### Scenario: Type별 pending 입력

- **WHEN** 한 Reaction Type의 mutation이 pending이다
- **THEN** component는 같은 Type의 중복 입력을 막는다
- **AND** 다른 Type의 확정 상태를 잃지 않는다

#### Scenario: mutation 실패 복구

- **WHEN** Reaction 추가 또는 삭제 mutation이 실패한다
- **THEN** component는 서버가 확인한 이전 선택 상태로 복구한다
- **AND** 사용자가 다시 시도할 수 있는 오류 상태를 제공한다

### Requirement: Reaction 요약 프레젠테이션 component

클라이언트는 공급된 viewer-independent Type별 count와 viewer가 조회할 수 있는 Profile 목록을 props-only 프레젠테이션 component로 표시할 수 있어야 한다(MUST). 실제 Post query, Relay connection, modal/route와 cache 통합은 PROD-418이 소유한다.

#### Scenario: supplied-order Type별 count 표시

- **WHEN** caller가 Type과 count entry를 supplied order로 제공한다
- **THEN** component는 Type과 count를 받은 순서대로 표시한다
- **AND** zero-count Type을 만들거나 제거·정렬·필터링하지 않는다

#### Scenario: loading, empty, error, populated 상태

- **WHEN** caller가 loading, empty, error 또는 populated 상태를 제공한다
- **THEN** component는 해당 상태를 프레젠테이션으로 표시한다
- **AND** retry callback이 제공된 error 상태에서는 caller가 연결한 재시도를 노출한다

#### Scenario: 복수 Type과 count 동률

- **WHEN** caller가 count가 같은 여러 Type을 포함한 entry를 제공한다
- **THEN** component는 supplied order를 보존해 모든 entry를 표시한다
- **AND** 동률 Type 사이에 별도 순서를 유도하지 않는다

#### Scenario: supplied Type 선택 callback

- **WHEN** supplied Reaction Type entry가 활성화된다
- **THEN** `ReactionSummary`는 supplied selection callback을 정확히 그 supplied Type과 함께 호출한다
- **AND** component는 modal 또는 route navigation을 소유하지 않는다

#### Scenario: 기존 Profile row 표시

- **WHEN** caller가 한 Type의 조회 가능한 Profile Relay fragment ref를 제공한다
- **THEN** component는 각 row에 기존 `ProfileListItem`을 사용한다
- **AND** Avatar, name, handle, bio와 Follow button의 별도 raw-scalar row를 만들지 않는다

#### Scenario: mock retry와 pagination callback

- **WHEN** caller가 retry 또는 다음 page callback을 제공한다
- **THEN** component는 해당 callback을 호출할 수 있는 프레젠테이션 입력을 제공한다
- **AND** 자체 Relay connection이나 pagination query를 소유하지 않는다

#### Scenario: Storybook Relay mock fragment ref

- **WHEN** Storybook이 populated Profile row 또는 callback interaction 상태를 구성한다
- **THEN** Storybook fixture는 실제 Relay `Profile` fragment data shape의 mock fragment ref를 사용한다
- **AND** raw `$key` cast로 fixture를 만들지 않는다

#### Scenario: PROD-418 end-state Relay pagination

- **WHEN** PROD-418이 실제 Type별 Profile 목록을 연결한다
- **THEN** component는 Relay cursor로 다음 page를 불러온다
- **AND** 이미 표시한 Profile을 중복 추가하지 않는다

### Requirement: 독립 Reaction UI 검증 경계

Reaction 선택과 요약 UI는 공통 Post Action Bar rollout과 분리된 component 및 integration 경계에서 검증되어야 한다(MUST).

#### Scenario: component 상태 검증

- **WHEN** Reaction component catalog와 interaction test를 실행한다
- **THEN** 선택·해제·복수 Type·pending·오류 복구와 PROD-449의 supplied-order count·Type selection callback·loading/empty/error/populated·기존 Profile row·mock callback 상태를 실제 Relay data shape로 검증한다
- **AND** PROD-418은 실제 connection pagination의 component/integration 검증을 추가한다

#### Scenario: Post Action Bar 제외

- **WHEN** 이 capability를 완료한다
- **THEN** 여러 Post action을 공통 Action Bar에 조립하거나 실제 surface에 배치하는 PROD-432 결과를 요구하지 않는다
