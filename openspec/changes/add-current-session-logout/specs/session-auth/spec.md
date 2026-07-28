## ADDED Requirements

### Requirement: 현재 Session 폐기 인증 경계

**Authority / Provenance:** `docs/domain/objects/session.md`, `docs/domain/objects/account.md`; Linear: `PROD-473`, `PROD-474` 시스템은 current-session revoke 요청의 credential을 일반 인증 행동과 분리된 폐기 인증 경계에서 확인해야 한다(MUST). GraphQL과 Web transport가 같은 terminal-state 판정을 공유하도록 transport-neutral current-session logout action이 이 경계와 조건부 revoke를 함께 소유해야 한다(MUST). 이 경계는 credential이 가리키는 현재 Active Session과 연결 Account State를 확인하고, 클라이언트가 Session ID를 입력하지 않은 상태에서만 `Session.Self` 대상 identity를 도출해야 한다(MUST). 정상 폐기 가능 상태, 이미 인증 불가능한 확정 상태와 결과 불명 실패를 구분해야 한다(MUST).

#### Scenario: Active Account의 현재 Active Session 식별

- **WHEN** credential이 Active Account에 연결된 Active Session과 일치한다
- **THEN** 시스템은 그 Session을 `Session.Self` current-session revoke 대상으로 식별한다
- **AND** 클라이언트가 Session ID를 제출하지 않아도 된다

#### Scenario: Suspended Account의 현재 Active Session 식별

- **WHEN** credential이 Suspended Account에 연결된 Active Session과 일치한다
- **THEN** 시스템은 `Account.Active`의 명시적 예외로 그 Session을 current-session revoke 대상으로 식별한다
- **AND** 일반 인증 행동을 위한 Active Account session context로는 취급하지 않는다

#### Scenario: 이미 인증 불가능한 credential 확정

- **WHEN** credential이 Deleted Account 또는 Revoked/Expired Session을 가리킨다
- **THEN** 시스템은 조건부 Session revoke 단계에 진입하지 않는다
- **AND** transport가 로그아웃 완료로 처리할 수 있는 이미 인증 불가능한 확정 결과를 반환한다

#### Scenario: credential 확인 결과가 불명확함

- **WHEN** database 오류처럼 credential과 Session의 최종 상태를 확정할 수 없는 실패가 발생한다
- **THEN** 시스템은 revoke 성공이나 이미 인증 불가능한 결과를 반환하지 않는다
- **AND** caller가 credential을 유지하고 재시도할 수 있는 실패를 반환한다

### Requirement: 현재 Session의 멱등 폐기

**Authority / Provenance:** `docs/domain/objects/session.md`, `docs/domain/objects/account.md`; Linear: `PROD-473`, `PROD-474` transport-neutral current-session logout action은 폐기 인증 경계가 식별한 현재 Session만 Active에서 Revoked로 전이해야 한다(MUST). Revoked와 Expired는 terminal 상태로 유지해야 하고(MUST), 같은 Account의 다른 Session을 변경해서는 안 된다(MUST NOT).

#### Scenario: 현재 Active Session 폐기

- **WHEN** current-session logout action이 credential에서 현재 Active Session을 식별한다
- **THEN** 시스템은 그 Session을 Revoked로 전이한다
- **AND** 같은 Account의 다른 Session은 기존 상태를 유지한다

#### Scenario: 중복 폐기 요청

- **WHEN** 같은 현재 Session에 대한 폐기 요청이 중복으로 처리된다
- **THEN** 첫 확정 요청은 Session을 Revoked로 전이한다
- **AND** 후속 요청은 terminal 상태를 Active로 되돌리지 않는다

#### Scenario: 만료와 폐기가 경쟁함

- **WHEN** 인증을 마친 폐기 요청과 Session 만료가 경쟁한다
- **THEN** 먼저 확정된 Revoked 또는 Expired terminal 상태를 유지한다
- **AND** 다른 terminal 상태로 덮어쓰거나 Active로 재활성화하지 않는다

#### Scenario: 폐기된 credential 재사용

- **WHEN** 폐기 완료 뒤 같은 credential로 새 인증 요청을 보낸다
- **THEN** 일반 API 인증 경계는 현재 Session을 도출하지 않는다
- **AND** 인증이 필요한 행동을 거부한다

### Requirement: GraphQL current-session revoke mutation

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-474` Kosmo API는 bearer credential의 현재 Session을 폐기하는 `revokeCurrentSession` GraphQL mutation을 제공해야 한다(MUST). mutation은 Session ID 입력을 정의해서는 안 되며(MUST NOT), 폐기 또는 이미 인증 불가능한 상태가 확정된 경우에만 완료 payload를 반환해야 한다(MUST).

#### Scenario: Native bearer Session 폐기 성공

- **WHEN** Native client가 Active 또는 Suspended Account의 현재 Active Session bearer credential로 `revokeCurrentSession`을 호출한다
- **THEN** API는 같은 transport-neutral current-session logout action을 사용해 현재 Session 폐기를 확정한다
- **AND** `completed: true`인 payload를 반환한다

#### Scenario: 이미 인증 불가능한 bearer credential

- **WHEN** mutation의 bearer credential이 Deleted Account 또는 Revoked/Expired Session을 가리킨다
- **THEN** 공유 action의 조건부 Session revoke 단계에 진입하지 않는다
- **AND** 이미 인증 불가능함이 확정됐으므로 `completed: true`인 payload를 반환한다

#### Scenario: 결과 불명 실패

- **WHEN** mutation 처리 중 Session의 최종 상태를 확정할 수 없는 database 또는 server 실패가 발생한다
- **THEN** API는 완료 payload를 반환하지 않는다
- **AND** 기존 GraphQL internal error 계약으로 실패를 반환한다

#### Scenario: 임의 Session 대상 입력 거부

- **WHEN** client가 다른 Session ID를 mutation 입력으로 제출하려 한다
- **THEN** GraphQL schema에는 해당 입력 필드가 존재하지 않는다
- **AND** 요청 credential이 식별한 현재 Session 외의 Session을 폐기할 수 없다
