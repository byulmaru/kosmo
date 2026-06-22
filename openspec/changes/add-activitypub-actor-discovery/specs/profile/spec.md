## ADDED Requirements

### Requirement: Profile relative handle

API는 프로필 표시용 handle 문자열을 local instance 기준 `relativeHandle`로 제공해야 한다(MUST).

#### Scenario: Relative handle for local profile

- **WHEN** 클라이언트가 local instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}` 형식의 문자열을 반환한다

#### Scenario: Relative handle for remote profile

- **WHEN** 클라이언트가 remote instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}@{remoteDomain}` 형식의 문자열을 반환한다

## MODIFIED Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, local profile에 대한 handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active local profile by handle

- **WHEN** 클라이언트가 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 local instance에 속한 활성 프로필을 조회한다
- **AND** 일치하는 활성 local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Do not find remote profile by local handle query

- **WHEN** 클라이언트가 기존 handle 기반 프로필 조회를 요청한다
- **THEN** 시스템은 저장된 remote profile을 이 조회 결과로 반환하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** local instance 안에서 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile object visibility

API는 활성 프로필만 GraphQL profile object로 노출해야 하며, 저장된 remote profile은 Node ID 직접 조회로만 노출해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load도 활성 local profile만 반환한다

#### Scenario: Access active remote profile object by Node ID

- **WHEN** remote profile 상태가 `ACTIVE`이고 클라이언트가 해당 profile의 Node ID를 직접 조회한다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다

#### Scenario: Hide remote profile from local handle query

- **WHEN** remote profile이 저장되어 있고 상태가 `ACTIVE`이다
- **THEN** 시스템은 기존 `profileByHandle(handle:)`, account profile list, local profile 검색 결과로 remote profile을 반환하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다
