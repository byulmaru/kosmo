## ADDED Requirements

### Requirement: Profile follow graph

API는 프로필 간 accepted follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read accepted followers

- **WHEN** 클라이언트가 활성 프로필의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하고 follower 프로필도 활성 상태인 `ACCEPTED` follow 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read accepted following

- **WHEN** 클라이언트가 활성 프로필의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하고 followee 프로필도 활성 상태인 `ACCEPTED` follow 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Count accepted follows

- **WHEN** 클라이언트가 활성 프로필의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `ACCEPTED` follow 관계 중 상대 프로필도 활성 상태인 관계만 집계한다

#### Scenario: Read viewer follow state

- **WHEN** active profile이 있는 인증자가 다른 활성 프로필에 대한 viewer follow 상태를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 관계의 상태를 반환한다
- **AND** 해당 상태는 `ACCEPTED`, `PENDING`, `REJECTED`를 포함할 수 있다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 프로필이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 프로필을 공개 follow할 수 있어야 한다(MUST).

#### Scenario: Follow active profile

- **WHEN** active profile이 있는 인증자가 다른 활성 프로필 follow를 요청한다
- **THEN** 시스템은 `ACCEPTED` follow 관계를 생성한다
- **AND** 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 `ACCEPTED` 상태로 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 `ConflictError`를 반환한다

#### Scenario: Follow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 follow 관계를 해제할 수 있어야 한다(MUST).

#### Scenario: Unfollow active profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** unfollow 대상 프로필 ID를 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** unfollow 대상 프로필 ID를 반환한다

#### Scenario: Unfollow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
