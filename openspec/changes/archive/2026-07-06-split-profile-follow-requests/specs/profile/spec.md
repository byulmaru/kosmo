## MODIFIED Requirements

### Requirement: Profile follow graph

API는 프로필 간 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read followers

- **WHEN** 클라이언트가 활성 프로필의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하고 follower 프로필도 활성 상태인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read following

- **WHEN** 클라이언트가 활성 프로필의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하고 followee 프로필도 활성 상태인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Count follows

- **WHEN** 클라이언트가 활성 프로필의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 상대 프로필도 활성 상태인 follow 관계만 집계한다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 상태이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 활성 상태이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Read viewer follow

- **WHEN** active profile이 있는 인증자가 다른 활성 프로필에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 프로필이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 공개 프로필을 즉시 follow할 수 있어야 한다(MUST).

#### Scenario: Follow open active profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 프로필 follow를 요청한다
- **THEN** 시스템은 follow 관계를 생성한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Reject unsupported approval-required follow

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 활성 프로필 follow를 요청하고 팔로우 요청 생성 플로우가 아직 제공되지 않는다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** `ProfileFollow` 관계를 생성하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Follow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다

#### Scenario: Unfollow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
