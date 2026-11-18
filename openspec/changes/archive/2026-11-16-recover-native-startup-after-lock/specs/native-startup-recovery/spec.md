## ADDED Requirements

### Requirement: 잠금·복귀로 중단된 Native 초기 조회의 자동 복구

iOS와 Android Native 앱은 초기 로딩 중 잠금·복귀와 관련해 중단된 조회를 복귀 후 자동으로 한 번 재시도해야 한다(SHALL). 같은 중단 요청의 자동 재시도를 중복 실행하거나 연결 복원까지 반복해서는 안 된다(MUST NOT).

**Source Context:** PROD-1138, `docs/domain/decisions/0032-native-startup-recovery.md`, 2026-10-22 사용자 선택.

#### Scenario: 잠금 해제 후 일시적인 연결 중단에서 복구

- **WHEN** 초기 조회가 잠금·복귀와 관련해 중단되고 복귀 후 연결이 정상화된다.
- **THEN** 해당 조회는 자동 재시도 한 번으로 완료되고 사용자는 초기 로딩을 마쳐 이용을 이어간다.

#### Scenario: 원래 요청이 정상 완료

- **WHEN** 초기 조회 중 화면을 잠갔다가 돌아왔지만 원래 요청이 정상 완료된다.
- **THEN** 정상 완료를 잠금·복귀에 따른 실패로 취급해 같은 조회를 자동 재실행하지 않는다.

#### Scenario: 중복 이벤트와 연속 잠금

- **WHEN** 같은 중단 요청을 복구하는 동안 복귀 이벤트가 중복되거나 다시 잠금·복귀한다.
- **THEN** 그 요청의 자동 재시도는 최대 한 번이며 복귀 이벤트가 그 횟수를 되살리지 않는다.

### Requirement: 지속 오류에서 기존 안내와 수동 재시도 유지

자동 재시도 후에도 조회가 실패하면 기존 오류 안내와 수동 재시도를 제공해야 한다(SHALL). 초기 조회의 연결 중단 복구를 사용자 변경 작업의 자동 재실행이나 일반 오류의 무제한 재시도로 확대해서는 안 된다(MUST NOT).

**Source Context:** PROD-1138의 지속 오류·수동 재시도 완료 조건, ADR 0032, 2026-10-22 사용자 선택.

#### Scenario: 자동 재시도도 실패한 뒤 수동 복구

- **WHEN** 잠금 해제 후 자동 재시도가 계속 오프라인 또는 서버 오류로 실패한다.
- **THEN** 기존 오류 안내와 수동 재시도가 남고 자동 복구 시도가 반복되지 않는다.
- **AND** 이후 연결이 정상화되어 사용자가 수동 재시도하면 해당 오류 경계의 기존 복구 경로가 실행된다.

#### Scenario: 정상 로딩 뒤의 요청과 사용자 변경 작업

- **WHEN** 정상 로딩 뒤 일반 요청이나 mutation이 실패한다.
- **THEN** 이 초기 조회 복구 정책이 그 작업의 새 자동 재실행의 근거로 사용되지 않는다.

### Requirement: 인증·프로필과 조회 소유권 보존

일시적인 연결 실패만으로 유효한 credential과 저장된 selected Profile을 제거해서는 안 된다(MUST NOT). 초기 query의 복구는 무관한 Store·내비게이션을 유지하고, 이전 조회의 늦은 결과가 더 최근의 Account·Profile 상태를 덮어쓰지 않도록 해야 한다(SHALL). 서버가 확인한 guest·인증 만료는 기존 계약을 따른다.

**Source Context:** `docs/domain/objects/session.md`, ADR 0019·0032, PROD-1138의 기존 경계 보존 조건.

#### Scenario: 일시적인 transport 실패와 복구

- **WHEN** 유효한 Session·프로필 선택을 가진 초기 조회가 일시적인 transport 실패 후 복구된다.
- **THEN** credential·저장된 프로필 선택이 실패만으로 제거되지 않고 해당 actor의 결과로 초기 로딩을 마친다.

#### Scenario: 복구 중 actor 또는 auth 전환

- **WHEN** 이전 조회가 복구되는 동안 Account나 selected Profile이 변경되고 이전 응답이 늦게 도착한다.
- **THEN** 이전 결과는 더 최근의 선택·화면·Store를 덮어쓰지 않는다.

#### Scenario: 기존 수동 재시도 경계 보존

- **WHEN** 홈 query-local 오류에서 수동 재시도하거나 루트로 전파된 오류에서 앱 다시 불러오기를 선택한다.
- **THEN** 홈은 해당 query를 재평가하고, 루트는 기존 provider runtime 복구를 실행한다.
- **AND** 홈 query-local 재시도를 이유로 무관한 actor Store나 내비게이션을 초기화하지 않는다.
