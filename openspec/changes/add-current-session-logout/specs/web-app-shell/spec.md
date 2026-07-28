## ADDED Requirements

### Requirement: 공용 shell 로그아웃 control 실행

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475` full sidebar, compact rail과 mobile drawer의 기존 로그아웃 control은 같은 공용 Expo logout action을 실행해야 한다(MUST). control의 표면과 관계없이 runtime별 server 경계, credential 정리와 비인증 전환 의미가 같아야 한다(MUST).

#### Scenario: Full sidebar에서 로그아웃

- **WHEN** 사용자가 full sidebar의 `로그아웃` control을 활성화한다
- **THEN** 시스템은 현재 runtime의 공용 logout action을 실행한다

#### Scenario: Compact rail에서 로그아웃

- **WHEN** 사용자가 compact rail의 로그아웃 icon control을 활성화한다
- **THEN** 시스템은 full sidebar와 같은 공용 logout action을 실행한다

#### Scenario: Mobile drawer에서 로그아웃

- **WHEN** 사용자가 mobile drawer의 `로그아웃` control을 활성화한다
- **THEN** 시스템은 같은 공용 logout action을 실행한다
- **AND** server 결과가 확정되기 전에는 drawer navigation만으로 guest 상태를 표시하지 않는다

### Requirement: 로그아웃 control 진행·실패 접근성

**Authority / Provenance:** `docs/domain/objects/session.md`; Linear: `PROD-473`, `PROD-475` 로그아웃 control은 요청 진행 중 중복 입력을 비활성화하고 진행 상태를 보조 기술에 전달해야 한다(MUST). 결과 불명 실패에서는 control을 다시 활성화하고, credential을 유지한 채 실패 안내와 재시도 동작을 제공해야 한다(MUST).

#### Scenario: 진행 상태 표시

- **WHEN** logout 요청이 진행 중이다
- **THEN** 모든 shell 표면의 logout control은 추가 요청을 시작할 수 없는 상태가 된다
- **AND** 보조 기술은 control이 busy 또는 disabled 상태임을 확인할 수 있다

#### Scenario: 실패 상태와 재시도

- **WHEN** logout 요청이 결과 불명 실패로 끝난다
- **THEN** 사용자는 shell 안에서 로그아웃 실패 안내를 인지할 수 있다
- **AND** logout control은 다시 활성화되어 같은 동작을 재시도할 수 있다

#### Scenario: 성공 뒤 shell 이탈

- **WHEN** logout 결과가 확정되고 credential과 Relay 상태 정리가 끝난다
- **THEN** 시스템은 root onboarding route로 replace 이동한다
- **AND** 이전 authenticated shell을 history back으로 다시 표시하지 않는다
