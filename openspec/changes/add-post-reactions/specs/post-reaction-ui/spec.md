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

### Requirement: Reaction 요약 component

클라이언트는 Post의 viewer-independent Type별 count를 내림차순으로 표시하고, Type별로 viewer가 조회할 수 있는 Profile 목록을 열어 page 단위로 탐색할 수 있어야 한다(MUST).

#### Scenario: Type별 count 표시

- **WHEN** Post에 현재 Reaction이 존재한다
- **THEN** component는 Type과 count를 count 내림차순으로 표시한다
- **AND** count 동률 Type의 순서에 의존하지 않는다

#### Scenario: Type별 Profile 목록 진입

- **WHEN** 사용자가 한 Reaction Type 요약을 연다
- **THEN** component는 그 Type의 Profile connection만 표시한다
- **AND** server가 viewer 기준으로 숨긴 Profile을 client에서 복구하거나 count에서 빼지 않는다

#### Scenario: Profile 목록 추가 page

- **WHEN** Type별 Profile 목록에 다음 page가 있다
- **THEN** component는 Relay cursor로 다음 page를 불러온다
- **AND** 이미 표시한 Profile을 중복 추가하지 않는다

### Requirement: 독립 Reaction UI 검증 경계

Reaction 선택과 요약 UI는 공통 Post Action Bar rollout과 분리된 component 및 integration 경계에서 검증되어야 한다(MUST).

#### Scenario: component 상태 검증

- **WHEN** Reaction component catalog와 interaction test를 실행한다
- **THEN** 선택·해제·복수 Type·pending·오류 복구·count 정렬·Profile pagination 상태를 실제 Relay data shape로 검증한다

#### Scenario: Post Action Bar 제외

- **WHEN** 이 capability를 완료한다
- **THEN** 여러 Post action을 공통 Action Bar에 조립하거나 실제 surface에 배치하는 PROD-432 결과를 요구하지 않는다
