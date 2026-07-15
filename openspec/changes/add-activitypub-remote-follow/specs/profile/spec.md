## MODIFIED Requirements

### Requirement: Profile follow graph

API는 local profile과 ActivityPub remote profile이 참여하는 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST). Remote ActivityPub followers/following collection item은 fetch하거나 mirror하지 않고, kosmo DB에 저장된 known `ProfileFollow` 관계만 GraphQL followers/following connection에 반영해야 한다(MUST). Local profile과 ActivityPub remote profile의 followers/following count는 `profile` row에 저장된 count를 사용해야 한다(MUST).

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

#### Scenario: Count stored follows

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `profile` row에 저장된 followers count 또는 following count를 반환한다
- **AND** GraphQL count 조회 중 `ProfileFollow` aggregate query 또는 remote collection fetch를 수행하지 않는다
- **AND** 반환 count는 GraphQL non-null count 계약을 유지한다
- **AND** 조회 대상이 ActivityPub remote profile이면 반환 count는 best-effort 저장 count이며, followers/following connection의 edge 수와 같을 필요가 없다

#### Scenario: Exclude disabled profiles from stored counts

- **WHEN** active profile이 비활성화된다
- **THEN** 시스템은 profile follow row를 삭제하지 않고 남은 active profile들의 저장 followersCount/followingCount에서 해당 비활성 profile과의 관계를 제외한다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 두 프로필의 `followPolicy`가 모두 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from follow graph

- **WHEN** local 또는 ActivityPub remote profile 사이에 pending `ProfileFollowRequest`가 있다
- **THEN** 시스템은 해당 요청을 followers/following connection, followersCount, followingCount, viewerFollow, viewerState.follow 결과에 `ProfileFollow`로 노출하지 않는다
- **AND** pending request는 local profile 또는 ActivityPub remote profile의 저장 count를 변경하지 않는다

#### Scenario: Read viewer follow for local or remote target

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile 또는 활성 ActivityPub remote profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read viewer state

- **WHEN** 클라이언트가 활성 local profile 또는 활성 ActivityPub remote profile의 `viewerState`를 조회한다
- **THEN** 시스템은 현재 요청에 active profile이 선택되어 있으면 viewer-relative 상태를 반환한다
- **AND** 현재 요청에 active profile이 없으면 없음으로 응답한다
- **AND** 조회 대상 프로필이 viewer active profile 자신인지 `isSelf`로 반환한다
- **AND** viewer active profile이 대상 프로필을 follow하는 established `ProfileFollow` 관계가 있으면 `viewerState.follow`로 반환하고, 없으면 없음으로 응답한다
- **AND** pending `ProfileFollowRequest`만 있으면 `viewerState.follow`는 없음으로 응답한다
- **AND** 대상 프로필이 ActivityPub remote profile이어도 remote followers/following collection을 fetch하거나 mirror하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Profile instance kind

API는 같은 `Profile` 타입 안에서 소속 instance의 `kind`를 `Profile.instance.kind`로 노출해야 한다(MUST).

#### Scenario: Instance kind for local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 profile의 `instance.kind`를 조회한다
- **THEN** 시스템은 `LOCAL`을 반환한다

#### Scenario: Instance kind for ActivityPub profile

- **WHEN** 클라이언트가 ActivityPub instance에 속한 활성 profile의 `instance.kind`를 조회한다
- **THEN** 시스템은 `ACTIVITYPUB`을 반환한다

#### Scenario: Use instance kind for UI branching

- **WHEN** 클라이언트가 local-only 또는 ActivityPub-specific UI를 분기해야 한다
- **THEN** 클라이언트는 `relativeHandle` 문자열을 파싱하지 않고 `Profile.instance.kind`를 사용할 수 있어야 한다

#### Scenario: Link to stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 UI를 분기한다
- **AND** remote profile 링크는 `/${relativeHandle}` path로 이동한다
- **AND** `relativeHandle`은 `@handle@domain` 형식이고, route parameter는 `handle@domain`으로 전달되어 `profileByHandle`이 federated handle로 조회할 수 있어야 한다

#### Scenario: Link within stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile page 안에서 하위 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 UI를 분기한다
- **AND** 하위 링크는 `/${relativeHandle}` path 아래에서 route parameter가 `handle@domain`으로 전달되는 federated handle URL을 유지한다

#### Scenario: Use instance kind for remote follow action

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile을 표시한다
- **THEN** 클라이언트는 `instance.kind = ACTIVITYPUB`이라는 이유만으로 follow/unfollow action을 숨기거나 비활성화하지 않는다
- **AND** remote follow action 표시 여부는 `web-app-shell`의 remote profile follow actions 계약을 따른다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 `followPolicy`가 `OPEN`인 다른 활성 local profile 또는 ActivityPub remote profile을 follow할 수 있어야 한다(MUST).

#### Scenario: Follow open active local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다
- **AND** mutation은 `FollowProfilePayload.followerProfile`과 `FollowProfilePayload.followeeProfile`로 transaction 완료 시점의 양쪽 `Profile`을 반환한다
- **AND** `followerProfile.followingCount`와 `followeeProfile.followersCount`는 생성된 관계가 반영된 저장 count다

#### Scenario: Follow open active remote profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 활성 ActivityPub remote profile follow를 요청한다
- **THEN** 시스템은 local active profile을 follower, remote profile을 followee로 하는 established `ProfileFollow` 관계를 생성하거나 기존 관계를 반환한다
- **AND** 새 `ProfileFollow` 관계가 생성되고 remote instance 상태가 `UNRESPONSIVE`가 아니면 Fedify `sendActivity`를 통해 remote actor로 ActivityPub `Follow` activity를 발송한다
- **AND** Fedify `sendActivity`가 실패하더라도 생성된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** 새 `ProfileFollow` 관계가 생성되었지만 remote instance 상태가 `UNRESPONSIVE`이면 ActivityPub `Follow` activity를 발송하지 않는다
- **AND** 기존 `ProfileFollow` 관계를 반환하는 idempotent 요청에서는 ActivityPub `Follow` activity를 다시 발송하지 않는다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 `ProfileFollow`를 반환한다
- **AND** mutation은 최신 저장 count를 가진 `followerProfile`과 `followeeProfile`을 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** mutation은 count를 중복 증가시키지 않은 최신 `followerProfile`과 `followeeProfile`을 반환한다
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

#### Scenario: Require active profile to follow

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `followProfile` mutation을 요청한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** profile not found 오류로 처리하지 않는다

#### Scenario: Follow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 `SUSPENDED` instance의 remote profile follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계를 생성하지 않는다
- **AND** ActivityPub Follow를 발송하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 local 또는 ActivityPub remote follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 transaction 완료 시점의 `followerProfile`과 `followeeProfile`을 포함한다.

#### Scenario: Unfollow active local profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** mutation은 감소된 `followingCount`를 가진 `followerProfile`과 감소된 `followersCount` 및 갱신된 viewer follow 상태를 가진 `followeeProfile`을 함께 반환한다

#### Scenario: Unfollow active remote profile

- **WHEN** active profile이 있는 인증자가 `SUSPENDED` instance가 아닌 활성 ActivityPub remote profile을 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** remote instance 상태가 `UNRESPONSIVE`가 아니면 시스템은 Fedify `sendActivity`를 통해 기존 Follow에 대한 ActivityPub `Undo` activity를 발송한다
- **AND** Fedify `sendActivity`가 실패하더라도 삭제된 local `ProfileFollow` 관계와 저장 count를 rollback하지 않는다
- **AND** remote instance 상태가 `UNRESPONSIVE`이면 ActivityPub `Undo(Follow)` activity를 발송하지 않는다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** mutation은 감소된 저장 count를 가진 `followerProfile`과 `followeeProfile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 count를 변경하지 않은 최신 `followerProfile`과 `followeeProfile`을 포함한 `UnfollowProfilePayload`를 반환한다
- **AND** 대상이 ActivityPub remote profile이면 ActivityPub `Undo(Follow)` activity를 발송하지 않는다

#### Scenario: Preserve suspended remote follow

- **WHEN** active profile이 있는 인증자가 `SUSPENDED` instance의 ActivityPub remote profile을 이미 follow 중이고 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계와 양쪽 저장 count를 변경하지 않는다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다

#### Scenario: Require active profile to unfollow

- **WHEN** 인증되지 않았거나 active profile이 없는 클라이언트가 `unfollowProfile` mutation을 요청한다
- **THEN** 시스템은 GraphQL active profile 인증 scope 오류로 요청을 거부한다
- **AND** profile not found 오류로 처리하지 않는다

#### Scenario: Unfollow missing or blocked profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 관계 유무와 관계없이 `SUSPENDED` instance의 remote profile unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
- **AND** ActivityPub `Undo(Follow)` activity를 발송하지 않는다
