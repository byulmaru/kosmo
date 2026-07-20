## MODIFIED Requirements

### Requirement: Active profile selection

정상 제품 경로에서 `AccountProfile`로 로그인한 계정에 연결되는 profile은 configured local instance에 생성된 local profile이다. 로그인한 계정은 자신과 연결된 profile이 active이고 소속 instance가 `SUSPENDED`가 아닐 때 현재 세션의 active profile로 선택할 수 있어야 한다(MUST). 이 requirement는 제품 경로 밖에서 인위적으로 만든 remote profile membership의 선택 또는 거부 동작을 정의하지 않는다.

#### Scenario: Select accessible active account profile

- **WHEN** 로그인한 계정이 정상 제품 경로에서 자신과 연결된 active profile 선택을 요청하고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Reject unowned or invisible profile selection

- **WHEN** 로그인한 계정이 자신과 연결되지 않았거나 active가 아니거나 소속 instance가 `SUSPENDED`인 profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 profile이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다
