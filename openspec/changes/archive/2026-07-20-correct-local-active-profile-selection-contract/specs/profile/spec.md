## MODIFIED Requirements

### Requirement: Active profile selection

로그인한 계정은 자신과 연결되어 있고 active이며 소속 instance가 `SUSPENDED`가 아닌 local profile만 현재 세션의 active profile로 선택할 수 있어야 한다(MUST).

#### Scenario: Select accessible active local profile

- **WHEN** 로그인한 계정이 자신과 연결되어 있고 active이며 소속 instance가 `SUSPENDED`가 아닌 local profile 선택을 요청한다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Reject unowned or invisible profile selection

- **WHEN** 로그인한 계정이 자신과 연결되지 않았거나 active가 아니거나 소속 instance가 `SUSPENDED`인 local profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 local profile이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다
