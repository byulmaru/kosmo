## ADDED Requirements

### Requirement: 검색 결과 맥락과 대상별 journey

**Source Context**: `docs/domain/policies/search-conversion-analytics.md`의 계산 단위, PROD-557 승인 댓글 `ccb6d7a3-1d3e-48f8-a556-dfbf38638d21`.

시스템은 같은 검색 결과 맥락에서 선택한 대상 Profile별 journey를 분모로 세어야 한다(SHALL). 같은 대상의 재선택·뒤로가기는 중복 제거하고, 다른 대상 선택은 별도 journey로 센다.

#### Scenario: 최초 선택과 재선택

- **WHEN** 같은 검색 결과에서 A를 선택한 뒤 뒤로가기로 돌아와 A를 다시 선택한다
- **THEN** 분모는 journey 하나이며 최초 선택 시각을 유지한다

#### Scenario: 다른 대상 선택

- **WHEN** 같은 검색 결과에서 A와 B를 각각 선택한다
- **THEN** 서로 다른 journey 두 개를 분모로 센다

#### Scenario: 실패한 검색과 선택 없는 Follow

- **WHEN** 검색이 실패하거나 결과가 없거나 결과 선택 없이 Follow만 실행한다
- **THEN** 결과 선택 journey를 새로 만들지 않는다

### Requirement: 실제 Profile 표시 성공

**Source Context**: canonical 정책의 성공 조건, PROD-557 승인된 계산 계약.

시스템은 선택 맥락과 대상이 일치하고 유효한 Profile 데이터를 실제 화면에 표시한 경우만 조회 전환으로 기록해야 한다(SHALL). route 진입·자동 pageview·loading·실패 표시를 성공으로 기록해서는 안 된다(MUST NOT).

#### Scenario: 유효한 Profile 표시

- **WHEN** 선택한 대상의 유효한 Profile 데이터를 귀속 기간 안에 실제로 표시한다
- **THEN** 해당 journey의 조회 성공을 한 번 기록한다

#### Scenario: 조회 실패와 별도 진입

- **WHEN** Profile 조회가 실패하거나 대상이 없거나 선택 맥락 없는 별도 진입이다
- **THEN** 기존 journey의 조회 성공을 기록하지 않는다

#### Scenario: 반복 표시

- **WHEN** 같은 journey의 Profile이 재렌더되거나 뒤로가기 뒤 다시 표시된다
- **THEN** 조회 성공 분자를 늘리지 않는다

### Requirement: 실제 Follow Relationship 성공

**Source Context**: canonical 정책의 성공 조건, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`.

시스템은 같은 journey·대상의 실제 Follow Relationship이 응답으로 확인된 경우만 Follow 전환으로 기록해야 한다(SHALL). Pending Follow Request, optimistic 표시, 오류·실패와 나중의 수신자 승인·원격 Accept를 이번 전환 성공에 포함해서는 안 된다(MUST NOT).

#### Scenario: Follow와 Request 구분

- **WHEN** 같은 대상의 Follow 요청이 귀속 기간 안에 실제 Follow Relationship을 반환한다
- **THEN** Follow 성공을 한 번 기록한다
- **AND** Pending Follow Request 응답에는 Follow 성공을 기록하지 않는다

#### Scenario: 오류와 optimistic 상태

- **WHEN** UI가 optimistic 상태를 표시했지만 mutation이 실패하거나 성공 관계를 확인하지 못한다
- **THEN** Follow 성공을 기록하지 않는다

#### Scenario: 나중의 요청 승인

- **WHEN** Pending Follow Request가 이후 수신자 승인 또는 원격 Accept로 관계가 된다
- **THEN** 이 비동기 전이를 이번 검색 journey의 Follow 전환으로 추가하지 않는다

### Requirement: 귀속 수명과 종료

**Source Context**: canonical 정책의 귀속 기간·종료, PROD-557 승인된 계산 계약.

시스템은 최초 선택 후 30분 경계값을 포함하되, 새 검색, Account·선택 Profile·인증 상태·PostHog session 변경, 탭 종료·전체 reload 중 먼저 발생한 경계에서 새 귀속을 끝내야 한다(SHALL). 종료 전 기록은 유지하고 이후 늦은 성공을 추가해서는 안 된다(MUST NOT). 탭 간 공유·reload 뒤 복원은 하지 않는다.

#### Scenario: 정확히 30분과 초과

- **WHEN** 다른 종료 조건 없이 최초 선택 후 정확히 30분에 성공한다
- **THEN** 전환에 포함한다
- **AND** 30분을 초과한 성공은 제외한다

#### Scenario: 새 검색과 늦은 완료

- **WHEN** 기존 journey의 요청이 진행 중인 상태에서 새 검색을 시작하고 이후 옛 응답이 도착한다
- **THEN** 옛 journey와 새 journey 어디에도 그 늦은 성공을 추가하지 않는다
- **AND** 종료 전 기록한 분모와 성공은 유지한다

#### Scenario: 인증과 선택 주체 전환

- **WHEN** Account, 선택 Profile 또는 인증 상태가 바뀐다
- **THEN** 이전 journey로 새 성공을 귀속하지 않는다

#### Scenario: PostHog session 변경

- **WHEN** 앱의 인증 상태는 같지만 PostHog session이 바뀐다
- **THEN** 이전 session의 journey로 새 성공을 귀속하지 않는다

#### Scenario: 새 탭과 전체 reload

- **WHEN** 선택 맥락을 전달받지 않은 새 탭에서 진입하거나 탭을 닫거나 전체 reload한다
- **THEN** 이전 journey를 공유·복원하지 않으며 새 진입을 이전 funnel에 연결하지 않는다

### Requirement: 전체와 행동별 전환 집계

**Source Context**: canonical 정책의 계산식·집계 기간, PROD-557 승인된 계산 계약.

시스템은 전체 전환 분자를 조회 또는 Follow가 성공한 journey의 합집합으로 계산하고, 조회·Follow 비율도 별도로 제공해야 한다(SHALL). 집계 기간은 journey 시작 시점과 Asia/Seoul을 따른다. 마지막 journey의 관측 window가 끝나기 전에는 잠정치로 표시하며, 분모 0은 데이터 없음으로 표시해야 한다(SHALL).

#### Scenario: 두 성공의 중복 제거

- **WHEN** 같은 journey에서 조회와 Follow가 모두 성공한다
- **THEN** 전체 분자는 1이고 조회·Follow 분자는 각각 1이다

#### Scenario: 날짜를 넘는 성공

- **WHEN** Asia/Seoul 날짜 경계 전에 journey를 시작하고 이후 귀속 기간 안에 성공한다
- **THEN** 시작 날짜에 분모와 성공을 함께 귀속한다

#### Scenario: 미성숙 window와 데이터 없음

- **WHEN** 마지막 journey의 30분 window가 아직 끝나지 않았다
- **THEN** 해당 결과를 잠정치로 표시한다
- **AND** 대상 기간의 분모가 0이면 0% 대신 데이터 없음으로 표시한다

### Requirement: custom 귀속 개인정보 경계

**Source Context**: canonical 정책의 수집 경계, PROD-557 및 PROD-819·820의 승인된 metadata 계약.

시스템은 Account·Profile·검색어에서 파생하지 않은 불투명 journey 값으로 연결해야 한다(SHALL). custom 귀속 속성에 raw 검색어·이름·handle·대상 Profile ID 또는 그 hash·암호화 대체값을 전송해서는 안 된다(MUST NOT). 기존 SDK identity와 승인된 표준 Search `q`·click/referrer/session metadata 계약을 유지해야 한다(SHALL).

#### Scenario: 귀속 payload

- **WHEN** 검색 journey의 시작·조회·Follow 이벤트를 보낸다
- **THEN** custom 귀속 속성에 금지된 값과 파생값이 없다
- **AND** journey 값으로 SDK person identity를 바꾸지 않는다

#### Scenario: 표준 metadata와 실패 격리

- **WHEN** 기존 표준 metadata가 수집되거나 SDK 설정 누락·전송 오류가 발생한다
- **THEN** custom 개인정보 제한을 이유로 표준 metadata 계약을 바꾸지 않는다
- **AND** analytics 실패가 검색·Profile·Follow 동작을 중단하지 않는다

### Requirement: PostHog 결과 재현

**Source Context**: PROD-557 전달 결과와 완료 조건, canonical 정책의 계산식.

PROD-557은 정의된 테스트 journey의 기대 분모·분자를 PostHog funnel·dashboard에서 재현하고 증거를 남겨야 한다(SHALL). 공통 production acceptance나 다른 이슈의 검증 완료를 대신 주장해서는 안 된다(MUST NOT).

#### Scenario: 같은 Account의 여러 journey

- **WHEN** 같은 Account에서 서로 다른 검색·대상 journey를 포함한 fixture를 실행한다
- **THEN** 사람 수로 합치지 않고 journey별 기대 분모·전체·조회·Follow 분자와 일치한다

#### Scenario: 검증 증거

- **WHEN** funnel·dashboard 검증을 완료한다
- **THEN** query·설정, fixture, 기대값·실제값, 환경·시각, dashboard/insight URL로 결과를 다시 확인할 수 있다
