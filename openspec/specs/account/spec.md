## Purpose

kosmo 계정 capability의 현재 계약을 문서화한다. 이 스펙은 OIDC subject 기반 계정 식별, 현재 계정 조회, 계정 object 접근 제한을 다룬다.

## Requirements

### Requirement: OIDC-backed account identity

시스템은 OIDC subject를 기준으로 kosmo 계정을 식별하고 계정 표시 이름과 상태를 유지해야 한다(MUST).

#### Scenario: Create account from OIDC identity

- **WHEN** OIDC 로그인 결과에 유효한 subject와 name이 포함된다
- **THEN** 시스템은 subject를 계정의 고유한 OIDC 식별자로 저장한다
- **AND** name을 계정 표시 이름으로 저장한다
- **AND** 신규 계정 상태는 `ACTIVE`이다

#### Scenario: Update existing OIDC account

- **WHEN** 이미 저장된 OIDC subject로 다시 로그인한다
- **THEN** 시스템은 새 name으로 기존 계정 표시 이름을 갱신한다
- **AND** 같은 OIDC subject를 가진 계정을 중복 생성하지 않는다

### Requirement: Current account visibility

API는 로그인한 사용자가 자신의 계정을 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read current account

- **WHEN** 로그인한 사용자가 현재 계정 조회를 요청한다
- **THEN** 시스템은 현재 세션의 계정을 반환한다
- **AND** 계정 표시 이름을 account name으로 노출한다

#### Scenario: Read current account anonymously

- **WHEN** 로그인하지 않은 사용자가 현재 계정 조회를 요청한다
- **THEN** 시스템은 계정 없음으로 응답한다

### Requirement: Account object access control

API는 계정 object를 현재 세션의 계정에게만 노출해야 한다(MUST).

#### Scenario: Access own account object

- **WHEN** 요청한 계정 ID가 현재 세션의 계정 ID와 같다
- **THEN** 시스템은 계정 object 접근을 허용한다
- **AND** Node ID 기반 account load도 현재 세션의 계정만 반환한다

#### Scenario: Access another account object

- **WHEN** 요청한 계정 ID가 현재 세션의 계정 ID와 다르다
- **THEN** 시스템은 계정 object 접근을 허용하지 않는다

#### Scenario: Access account object anonymously

- **WHEN** 세션이 없는 요청이 계정 ID를 load한다
- **THEN** 시스템은 계정 object 접근을 허용하지 않는다
