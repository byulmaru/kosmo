## ADDED Requirements

### Requirement: Profile origin

API는 같은 `Profile` 타입 안에서 local profile과 ActivityPub remote profile을 구분할 수 있는 origin enum을 제공해야 한다(MUST).

#### Scenario: Origin for local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 profile의 `origin`을 조회한다
- **THEN** 시스템은 `LOCAL`을 반환한다

#### Scenario: Origin for ActivityPub profile

- **WHEN** 클라이언트가 ActivityPub instance에 속한 활성 profile의 `origin`을 조회한다
- **THEN** 시스템은 `ACTIVITYPUB`을 반환한다

#### Scenario: Use origin for UI branching

- **WHEN** 클라이언트가 local-only 또는 ActivityPub-specific UI를 분기해야 한다
- **THEN** 클라이언트는 `relativeHandle` 문자열을 파싱하지 않고 `Profile.origin`을 사용할 수 있어야 한다

## MODIFIED Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, configured local profile과 저장된 ActivityPub remote profile에 대한 DB-only handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active local profile by bare handle

- **WHEN** 클라이언트가 bare handle 또는 configured local domain의 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 configured local instance에 속한 활성 프로필을 조회한다
- **AND** 일치하는 활성 configured local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Find stored active remote profile by federated handle

- **WHEN** 클라이언트가 `@{handle}@{domain}` 형식의 federated handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle과 domain을 정규화한다
- **AND** 시스템은 kosmo DB에서 해당 domain의 instance와 normalized handle에 일치하는 활성 remote `Profile`을 조회한다
- **AND** 일치하는 저장된 활성 remote profile이 있으면 해당 프로필을 반환한다
- **AND** 시스템은 `profileByHandle` 처리 중 WebFinger, actor document fetch, actor refresh, remote profile 저장을 수행하지 않는다

#### Scenario: Missing stored remote profile by handle

- **WHEN** federated handle에 해당하는 저장된 활성 remote profile이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다
- **AND** 시스템은 remote actor materialization을 자동으로 시도하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** configured local instance 안에서 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile object visibility

API는 활성 local profile과 저장된 활성 ActivityPub remote profile을 GraphQL profile object로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이고 소속 instance가 차단되지 않았다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, origin, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object

- **WHEN** ActivityPub remote profile 상태가 `ACTIVE`이고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, origin, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 remote profile을 반환할 수 있다

#### Scenario: Access profile from suspended instance

- **WHEN** 프로필이 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 프로필 object 접근을 허용하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다

### Requirement: Active profile selection

로그인한 계정은 자신과 연결된 활성 configured local profile만 현재 세션의 active profile로 선택할 수 있어야 한다(MUST).

#### Scenario: Select accessible active local profile

- **WHEN** 로그인한 계정이 자신과 연결된 활성 configured local profile 선택을 요청한다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Reject remote profile selection

- **WHEN** 로그인한 계정이 저장된 active remote profile을 현재 세션의 active profile로 선택하려고 한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 remote profile로 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다
