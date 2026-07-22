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

웹 앱은 visible profile의 origin을 action surface 조건으로 사용하지 않고 local/remote profile에 같은 NONE/PENDING/ESTABLISHED FollowButton 상태 머신을 적용해야 한다(MUST). `followProfile.result` union이 established relation과 pending request의 최종 권위여야 하며(MUST), `followPolicy`는 action을 숨기거나 막는 조건이 아니라 예상 optimistic state 선택에만 사용할 수 있다(MAY).

#### Scenario: Show remote follow action

- **WHEN** active profile이 있는 사용자가 자기 자신이 아닌 활성 ActivityPub remote profile을 `ProfileListItem`, 프로필 페이지, 또는 동등한 follow action surface에서 본다
- **THEN** 시스템은 local profile 대상과 같은 `FollowButton` 표시 정책을 적용한다
- **AND** `viewerState.follow`과 `viewerState.followRequest`가 모두 없으면 `팔로우`를 표시하고 클릭 시 `followProfile` mutation을 호출한다
- **AND** 대상 profile의 origin이나 `followPolicy`를 버튼 노출 또는 mutation 호출 조건으로 사용하지 않는다
- **AND** mutation 진행 중 별도 `처리 중` 문구를 표시하지 않고 `followPolicy`로 예상되는 optimistic relation/request 상태를 선택하며 오류에서는 이전 상태로 rollback한다

#### Scenario: Confirm established follow result

- **WHEN** local 또는 ActivityPub remote profile의 `followProfile.result`가 `ProfileFollow`다
- **THEN** 시스템은 `viewerState.follow`에 relation을 반영하고 `viewerState.followRequest`를 없음으로 유지하며 `팔로잉`을 표시한다
- **AND** mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 normalized cache에 반영한다
- **AND** follow 성공 시 이미 열린 followers/following connection에 새 relation edge를 직접 삽입하지 않고 다음 connection query 결과에 membership 갱신을 맡긴다

#### Scenario: Confirm pending follow result

- **WHEN** local 또는 ActivityPub remote profile의 `followProfile.result`가 `ProfileFollowRequest`다
- **THEN** 시스템은 `viewerState.followRequest`에 request를 반영하고 `viewerState.follow`를 없음으로 유지하며 `요청됨`을 표시한다
- **AND** 양쪽 followers/following count를 변경하지 않는다
- **AND** duplicate follow 결과가 같은 request를 반환해도 request 상태와 count를 중복 변경하지 않는다

#### Scenario: Cancel pending follow request

- **WHEN** `viewerState.followRequest`가 있는 profile에서 사용자가 `요청됨`을 누른다
- **THEN** 시스템은 exact request ID로 `cancelProfileFollowRequest`를 호출하고 optimistic하게 `viewerState.followRequest`를 없음으로 전환해 `팔로우`를 표시한다
- **AND** 양쪽 followers/following count를 변경하지 않는다
- **AND** mutation 오류에서는 이전 pending request와 `요청됨` 상태로 rollback한다

#### Scenario: Show remote unfollow action

- **WHEN** active profile이 있는 사용자가 established `ProfileFollow`로 follow 중인 활성 ActivityPub remote profile을 본다
- **THEN** 시스템은 local profile 대상과 같은 unfollow action을 표시한다
- **AND** 대상 remote profile의 origin이나 `followPolicy`를 established follow의 unfollow action 조건으로 사용하지 않는다
- **AND** `팔로잉` 클릭은 `unfollowProfile` mutation을 호출하고 optimistic하게 `viewerState.follow`을 없음으로 전환한다
- **AND** 대상이 ActivityPub remote profile이어도 mutation의 `followerProfile.followingCount`와 `followeeProfile.followersCount`를 Relay normalized cache에 반영한다
- **AND** 양쪽 count 감소는 optimistic하게 반영하되 열린 connection의 기존 relation row는 mutation 진행 중 유지한다
- **AND** mutation 성공 payload의 `profileFollowId`로만 열린 connection edge를 제거한다
- **AND** mutation 오류에서는 relation, 양쪽 count와 버튼 상태를 이전 상태로 rollback하고 유지된 행에서 공통 오류 UI를 표시한다

#### Scenario: Reflect remote Accept or Reject on a later read

- **WHEN** remote Accept 또는 Reject가 pending request를 서버에서 전이한 뒤 profile을 다시 query하거나 navigation한다
- **THEN** Accept 결과는 `viewerState.follow`만 있는 `팔로잉`, Reject 결과는 relation/request가 없는 `팔로우`로 표시한다
- **AND** subscription, push 또는 polling 없이 현재 화면을 refetch 없이 자동 전환하지 않는다

#### Scenario: Hide common unsupported action surface

- **WHEN** 대상이 자기 자신이거나 viewer active profile이 없거나 API visibility 계약상 profile이 노출되지 않는다
- **THEN** 시스템은 local/remote 공통 정책에 따라 FollowButton action surface를 표시하지 않는다
