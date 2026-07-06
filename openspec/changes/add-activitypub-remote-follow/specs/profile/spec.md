## MODIFIED Requirements

### Requirement: Profile follow graph

API는 local profile과 ActivityPub remote profile이 참여하는 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST). Remote ActivityPub followers/following collection은 fetch하거나 mirror하지 않고, kosmo DB에 저장된 known `ProfileFollow` 관계만 GraphQL follow graph와 count에 반영해야 한다(MUST).

#### Scenario: Read followers for local or remote profile

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하는 established `ProfileFollow` 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** follower profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다
- **AND** 조회 대상이 ActivityPub remote profile이어도 remote followers collection을 fetch하거나 mirror하지 않는다

#### Scenario: Read following for local or remote profile

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하는 established `ProfileFollow` 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** followee profile은 활성 local profile 또는 활성 ActivityPub remote profile일 수 있다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다
- **AND** 조회 대상이 ActivityPub remote profile이어도 remote following collection을 fetch하거나 mirror하지 않는다

#### Scenario: Count follows for local or remote profile

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 established `ProfileFollow` 관계 중 상대 프로필도 노출 가능한 활성 profile인 관계만 집계한다
- **AND** 조회 대상이 ActivityPub remote profile이어도 remote collection count를 fetch하거나 mirror하지 않는다
- **AND** 반환 count는 fediverse 전체 count가 아니라 kosmo DB가 알고 있는 관계 기준이다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 두 프로필의 `followPolicy`가 모두 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from follow graph

- **WHEN** local 또는 ActivityPub remote profile 사이에 pending `ProfileFollowRequest`가 있다
- **THEN** 시스템은 해당 요청을 followers/following connection, followersCount, followingCount, viewerFollow, viewerState.follow 결과에 `ProfileFollow`로 노출하지 않는다

#### Scenario: Read viewer follow for local or remote target

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile 또는 활성 ActivityPub remote profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read viewer state follow for local or remote target

- **WHEN** active profile이 있는 인증자가 활성 local profile 또는 활성 ActivityPub remote profile의 `viewerState`를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 established `ProfileFollow` 관계를 `viewerState.follow`로 반환한다
- **AND** follow 관계가 없거나 pending `ProfileFollowRequest`만 있으면 `viewerState.follow`는 없음으로 응답한다
- **AND** 대상 프로필이 ActivityPub remote profile이어도 remote followers/following collection을 fetch하거나 mirror하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 `followPolicy`가 `OPEN`인 다른 활성 local profile 또는 ActivityPub remote profile을 follow할 수 있어야 한다(MUST).

#### Scenario: Follow open active local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다

#### Scenario: Follow open active remote profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local active profile을 follower, remote profile을 followee로 하는 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성된 경우에만 Fedify `sendActivity`를 통해 remote actor로 ActivityPub `Follow` activity를 발송한다
- **AND** 기존 `ProfileFollow` 관계를 반환하는 idempotent 요청에서는 ActivityPub `Follow` activity를 다시 발송하지 않는다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Follow` activity를 다시 발송하지 않는다

#### Scenario: Reject unsupported approval-required follow

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 활성 local profile 또는 ActivityPub remote profile follow를 요청하고 follow request 생성 플로우가 아직 제공되지 않는다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** `ProfileFollow` 관계와 `ProfileFollowRequest` 요청을 생성하지 않는다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Follow` activity를 발송하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Follow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 `SUSPENDED`/`UNRESPONSIVE` instance의 remote profile follow를 요청한다
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

- **WHEN** active profile이 있는 인증자가 `SUSPENDED` 또는 `UNRESPONSIVE`가 아닌 responsive instance에 속한 활성 ActivityPub remote profile을 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** 시스템은 Fedify `sendActivity`를 통해 기존 Follow에 대한 ActivityPub `Undo` activity를 발송한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 followersCount를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Undo(Follow)` activity를 발송하지 않는다

#### Scenario: Unfollow unresponsive remote profile locally

- **WHEN** active profile이 있는 인증자가 `UNRESPONSIVE` instance에 속한 활성 ActivityPub remote profile을 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 local `ProfileFollow` 관계를 제거한다
- **AND** `UNRESPONSIVE` instance에는 ActivityPub `Undo(Follow)` activity를 발송하지 않는다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 followersCount를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 `SUSPENDED` instance의 remote profile unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다
