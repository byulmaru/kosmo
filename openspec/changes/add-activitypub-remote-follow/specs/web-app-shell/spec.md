## MODIFIED Requirements

### Requirement: People tab exact handle search results

검색 후 사람 탭은 제출된 검색어(`q`)를 정확 handle로 해석해 기존 `profileByHandle` 조회 결과를 표시해야 한다(MUST). 사람 탭이 아니거나 제출된 검색어가 비어 있으면 handle 조회를 실행하지 않아야 한다(MUST NOT). 검색 결과는 실데이터와 팔로우 액션이 연결된 `ProfileListItem`으로 표시해야 한다(MUST). 검색 결과 항목은 해당 프로필의 `relativeHandle`을 path로 사용한 프로필 페이지(`/${relativeHandle}`)로 이동할 수 있어야 한다(MUST). prefix, display name, fediverse 검색은 이 범위에서 제공하지 않는다(MUST NOT).

#### Scenario: Existing handle result

- **WHEN** 사용자가 존재하는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 `profileByHandle` 결과를 `ProfileListItem`으로 표시한다
- **AND** 결과 항목의 프로필 정보 영역은 `/${relativeHandle}` 프로필 페이지로 이동한다
- **AND** stored ActivityPub remote profile의 `relativeHandle`은 bare `@handle`이 아니라 `@handle@domain`이다
- **AND** 결과 항목의 팔로우 액션은 local profile 또는 ActivityPub remote profile 여부와 관계없이 기존 `ProfileListItem`/`FollowButton` 정책에 따라 표시되거나 숨겨진다

#### Scenario: Local-domain handle result

- **WHEN** 사용자가 configured local domain의 `handle@domain` 또는 `@handle@domain` 형식 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 이를 remote profile 검색으로 취급하지 않고 local profile lookup으로 정규화한다
- **AND** 결과 profile의 `relativeHandle`은 `@handle` 형식으로 유지된다

#### Scenario: Stored remote handle result

- **WHEN** 사용자가 remote domain의 `handle@domain` 또는 `@handle@domain` 형식 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 이미 materialized되어 DB에 저장된 ActivityPub remote profile만 반환한다
- **AND** 검색 중 WebFinger lookup, actor document fetch, 또는 remote profile 저장을 수행하지 않는다

#### Scenario: Missing handle result

- **WHEN** 사용자가 존재하지 않는 handle을 사람 탭에서 검색한다
- **THEN** 시스템은 결과 없음 안내를 표시한다

#### Scenario: Skip search without people query

- **WHEN** 사람 탭이 아니거나 제출된 검색어가 비어 있다
- **THEN** 시스템은 `profileByHandle` 조회를 실행하지 않는다

## ADDED Requirements

### Requirement: Remote profile follow actions

웹 앱은 활성 ActivityPub remote profile을 local profile과 같은 follow action 대상으로 취급하고, remote profile이라는 이유만으로 follow/unfollow UI를 숨기거나 비활성화하지 않아야 한다(MUST).

#### Scenario: Show remote follow action

- **WHEN** active profile이 있는 사용자가 자기 자신이 아닌 활성 ActivityPub remote profile을 `ProfileListItem`, 프로필 페이지, 또는 동등한 follow action surface에서 본다
- **THEN** 시스템은 local profile 대상과 같은 `FollowButton` 표시 정책을 적용한다
- **AND** 대상 remote profile의 `followPolicy`가 `OPEN`이면 follow action을 사용할 수 있으며, remote instance 상태 차단은 `followProfile` mutation이 source of truth로 처리한다
- **AND** follow action은 `followProfile` mutation을 호출하고 optimistic UI는 `viewerState.follow`와 followersCount 갱신 정책을 따른다
- **AND** 대상이 ActivityPub remote profile이어도 mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 Relay normalized cache에 반영한다

#### Scenario: Hide or disable unsupported remote follow action

- **WHEN** 대상 ActivityPub remote profile에 대한 established viewer `ProfileFollow`가 없고, 대상이 자기 자신이거나, 비활성 profile이거나, `followPolicy`가 `APPROVAL_REQUIRED`이고 request flow가 아직 제공되지 않는다
- **THEN** 시스템은 local profile 대상의 기존 self/blocked/unsupported 정책과 같은 방식으로 새 follow action을 숨기거나 사용할 수 없게 한다
- **AND** 사용할 수 없는 action은 ActivityPub `Follow` activity를 발송하는 mutation을 호출하지 않는다

#### Scenario: Show remote unfollow action

- **WHEN** active profile이 있는 사용자가 established `ProfileFollow`로 follow 중인 활성 ActivityPub remote profile을 본다
- **THEN** 시스템은 local profile 대상과 같은 unfollow action을 표시한다
- **AND** 대상 remote profile의 `followPolicy`가 `APPROVAL_REQUIRED`로 바뀌어도 established follow의 unfollow action은 숨기지 않는다
- **AND** unfollow action은 `unfollowProfile` mutation을 호출하고 optimistic UI는 `viewerState.follow`와 followersCount 갱신 정책을 따른다
- **AND** 대상이 ActivityPub remote profile이어도 mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 Relay normalized cache에 반영한다
