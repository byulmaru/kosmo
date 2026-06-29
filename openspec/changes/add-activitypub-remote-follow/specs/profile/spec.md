## MODIFIED Requirements

### Requirement: Profile follow graph

API는 local profile과 ActivityPub remote profile이 참여하는 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read accepted followers for local profile

- **WHEN** 클라이언트가 활성 local profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하는 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** follower profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read accepted following for local profile

- **WHEN** 클라이언트가 활성 local profile의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하는 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** followee profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Remote profile followers connection unsupported

- **WHEN** 클라이언트가 활성 ActivityPub remote profile의 followers connection을 조회한다
- **THEN** 시스템은 remote followers collection을 fetch하거나 mirror하지 않는다
- **AND** 시스템은 followers connection을 지원하지 않음에 가까운 `null`로 응답한다

#### Scenario: Remote profile following connection unsupported

- **WHEN** 클라이언트가 활성 ActivityPub remote profile의 following connection을 조회한다
- **THEN** 시스템은 remote following collection을 fetch하거나 mirror하지 않는다
- **AND** 시스템은 following connection을 지원하지 않음에 가까운 `null`로 응답한다

#### Scenario: Count accepted follows for local profile

- **WHEN** 클라이언트가 활성 local profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `ACCEPTED` follow 관계 중 상대 프로필도 노출 가능한 활성 profile인 관계만 집계한다

#### Scenario: Remote profile follow counts unsupported

- **WHEN** 클라이언트가 활성 ActivityPub remote profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 remote collection count를 fetch하거나 mirror하지 않는다
- **AND** 시스템은 해당 count를 지원하지 않음에 가까운 `null`로 응답한다

#### Scenario: Read public accepted follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `ACCEPTED` follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 followee의 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 follow 정책과 상태에 관계없이 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from unrelated viewer

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `PENDING` 또는 `REJECTED` follow 관계를 조회한다
- **THEN** 시스템은 해당 `ProfileFollow`를 반환하지 않는다

#### Scenario: Read viewer follow for local or remote target

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile 또는 활성 ActivityPub remote profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** 반환된 관계는 `ACCEPTED`, `PENDING`, `REJECTED` 상태를 포함할 수 있다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 local profile 또는 ActivityPub remote profile을 follow할 수 있어야 한다(MUST).

#### Scenario: Follow active local profile

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 기존 local follow 정책에 따라 `ProfileFollow` 관계를 생성하거나 반환한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다

#### Scenario: Follow active remote profile

- **WHEN** active profile이 있는 인증자가 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local active profile을 follower, remote profile을 followee로 하는 `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 시스템은 Fedify `sendActivity`를 통해 remote actor로 ActivityPub `Follow` activity를 발송한다
- **AND** remote actor의 `Accept`를 기다려야 하는 경우 follow 관계 상태는 `PENDING`이 될 수 있다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 `ACCEPTED` 또는 `PENDING` 상태로 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Follow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 suspended instance의 remote profile follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계를 생성하지 않는다
- **AND** ActivityPub Follow를 발송하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 local 또는 ActivityPub remote follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active local profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow active remote profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 ActivityPub remote profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** 시스템은 Fedify `sendActivity`를 통해 기존 Follow에 대한 ActivityPub `Undo` activity를 발송한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다

#### Scenario: Unfollow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 suspended instance의 remote profile unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
- **AND** ActivityPub Undo/Follow를 발송하지 않는다
