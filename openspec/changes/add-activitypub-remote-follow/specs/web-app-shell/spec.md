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

웹 앱은 visible profile의 origin이나 `followPolicy`를 action surface에서 구분하지 않고 local/remote profile에 같은 follow/unfollow UI를 적용해야 한다(MUST). Follow Relationship과 Follow Request 생성 가능 여부는 `followProfile` mutation이 판단해야 하며, pending request 전용 버튼 상태와 취소 UX는 별도 capability가 제공하기 전까지 이 requirement에서 만들지 않아야 한다(MUST NOT).

#### Scenario: Show remote follow action

- **WHEN** active profile이 있는 사용자가 자기 자신이 아닌 활성 ActivityPub remote profile을 `ProfileListItem`, 프로필 페이지, 또는 동등한 follow action surface에서 본다
- **THEN** 시스템은 local profile 대상과 같은 `FollowButton` 표시 정책을 적용한다
- **AND** 대상 profile의 origin이나 `followPolicy`를 클라이언트 버튼 노출 또는 mutation 호출 조건으로 사용하지 않는다
- **AND** follow action은 `followProfile` mutation을 호출하고 mutation 결과의 `viewerState.follow`와 followersCount를 normalized cache에 반영한다
- **AND** 대상이 ActivityPub remote profile이어도 mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 Relay normalized cache에 반영한다
- **AND** mutation 진행 중 별도 `처리 중` 버튼 상태를 표시하지 않고 관계와 양쪽 count를 optimistic하게 반영하며 mutation 오류에서는 이전 상태로 rollback한다
- **AND** follow 성공 시 이미 열린 followers/following connection에 새 relation edge를 직접 삽입하지 않고 다음 connection query 결과에 membership 갱신을 맡긴다

#### Scenario: Defer pending request action state

- **WHEN** local 또는 ActivityPub remote profile의 follow mutation이 pending `ProfileFollowRequest`를 반환하거나 아직 제공되지 않은 remote request flow 때문에 실패한다
- **THEN** 시스템은 profile origin이나 `followPolicy`에 따른 별도 버튼 노출 정책을 만들지 않는다
- **AND** pending request의 `요청됨` 상태, 취소 action과 승인·거절 후 버튼 전환은 PROD-377이 소유한다
- **AND** 자기 자신이거나 API visibility 계약상 노출되지 않는 profile에는 기존 공통 action surface를 적용하지 않는다

#### Scenario: Show remote unfollow action

- **WHEN** active profile이 있는 사용자가 established `ProfileFollow`로 follow 중인 활성 ActivityPub remote profile을 본다
- **THEN** 시스템은 local profile 대상과 같은 unfollow action을 표시한다
- **AND** 대상 remote profile의 origin이나 `followPolicy`를 established follow의 unfollow action 조건으로 사용하지 않는다
- **AND** unfollow action은 `unfollowProfile` mutation을 호출하고 mutation 결과의 `viewerState.follow`와 followersCount를 normalized cache에 반영한다
- **AND** 대상이 ActivityPub remote profile이어도 mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 Relay normalized cache에 반영한다
- **AND** mutation 진행 중 별도 `처리 중` 버튼 상태를 표시하지 않고 관계와 양쪽 count 및 열린 connection의 기존 relation edge 제거를 optimistic하게 반영하며 mutation 오류에서는 이전 상태로 rollback한다
