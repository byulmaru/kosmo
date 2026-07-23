## ADDED Requirements

### Requirement: Profile relative handle

API는 프로필 표시용 handle 문자열을 configured local instance 기준 `relativeHandle`로 제공해야 한다(MUST).

#### Scenario: Relative handle for configured local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}` 형식의 문자열을 반환한다

#### Scenario: Relative handle for profile outside configured local instance

- **WHEN** 클라이언트가 configured local instance가 아닌 instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}@{instanceDomain}` 형식의 문자열을 반환한다
- **AND** 해당 instance가 `LOCAL` kind여도 configured local instance가 아니면 domain을 포함한다
