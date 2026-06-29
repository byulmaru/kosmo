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

#### Scenario: Link to stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`과 `origin`을 사용한다
- **AND** remote profile 링크는 route parameter가 `handle@domain`으로 전달되어 `profileByHandle`이 federated handle로 조회할 수 있는 URL로 이동한다

#### Scenario: Link within stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile page 안에서 하위 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`과 `origin`을 사용한다
- **AND** 하위 링크는 route parameter가 `handle@domain`으로 전달되는 federated handle URL을 유지한다

#### Scenario: Hide local follow action for remote profile

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile을 표시한다
- **THEN** 클라이언트는 remote follow change가 구현되기 전까지 local follow mutation을 실행하는 follow action을 숨기거나 비활성화한다

## MODIFIED Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, configured local profile과 저장된 ActivityPub remote profile에 대한 DB-only handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active local profile by bare or local-domain handle

- **WHEN** 클라이언트가 bare handle 또는 configured local domain의 `handle@domain`/`@handle@domain` 형식 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 configured local instance에 속한 활성 프로필을 조회한다
- **AND** 일치하는 활성 configured local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Find stored active remote profile by federated handle

- **WHEN** 클라이언트가 configured local domain이 아닌 `handle@domain` 또는 `@handle@domain` 형식의 federated handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle과 domain을 정규화한다
- **AND** 시스템은 kosmo DB에서 해당 domain의 suspended 상태가 아닌 instance와 normalized handle에 일치하는 활성 remote `Profile`을 조회한다
- **AND** 일치하는 저장된 활성 remote profile이 있으면 해당 프로필을 반환한다
- **AND** 시스템은 `profileByHandle` 처리 중 WebFinger, actor document fetch, actor refresh, remote profile 저장을 수행하지 않는다

#### Scenario: Missing stored remote profile by handle

- **WHEN** federated handle에 해당하는 저장된 활성 remote profile이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다
- **AND** 시스템은 remote actor materialization을 자동으로 시도하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** configured local instance 안에서 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile creation

로그인한 계정은 유효한 handle로 자신이 소유한 configured local profile을 생성할 수 있어야 한다(MUST).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 유효한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 configured local instance에 속한 local profile로 handle과 정규화된 handle을 저장한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** mutation은 `CreateProfilePayload.profile`로 생성된 `Profile`을 반환한다

#### Scenario: Create profile with duplicate local handle

- **WHEN** 로그인한 계정이 configured local instance 안에서 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

#### Scenario: Create profile with remote-only duplicate handle

- **WHEN** 로그인한 계정이 다른 ActivityPub instance에만 존재하는 정규화 handle로 local profile 생성을 요청한다
- **THEN** 시스템은 그 remote profile을 local handle conflict로 취급하지 않는다
- **AND** 다른 local profile 생성 검증을 통과하면 configured local instance에 새 profile을 생성할 수 있다

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

### Requirement: Profile follow graph

API는 remote follow change 전까지 활성 local profile 간 visible follow 관계만 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read accepted followers

- **WHEN** 클라이언트가 활성 local profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 local profile을 followee로 하고 follower 프로필도 활성 local profile인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read accepted following

- **WHEN** 클라이언트가 활성 local profile의 following connection을 조회한다
- **THEN** 시스템은 해당 local profile을 follower로 하고 followee 프로필도 활성 local profile인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Count accepted follows

- **WHEN** 클라이언트가 활성 프로필의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `ACCEPTED` follow 관계 중 양쪽 프로필이 모두 활성 local profile인 관계만 집계한다

#### Scenario: Read public accepted follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `ACCEPTED` follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 local profile이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 local profile이면 follow 정책과 상태에 관계없이 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from unrelated viewer

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `PENDING` 또는 `REJECTED` follow 관계를 조회한다
- **THEN** 시스템은 해당 `ProfileFollow`를 반환하지 않는다

#### Scenario: Hide remote follow graph before remote follow support

- **WHEN** 클라이언트가 저장된 active remote profile의 followers/following connection 또는 followersCount/followingCount를 조회한다
- **THEN** 시스템은 remote follow change가 구현되기 전까지 빈 connection과 0 count로 응답한다
- **AND** remote profile이 포함된 local `ProfileFollow` row가 있더라도 GraphQL follow graph 결과로 노출하지 않는다

#### Scenario: Read viewer follow

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** 반환된 관계는 `ACCEPTED`, `PENDING`, `REJECTED` 상태를 포함할 수 있다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Hide viewer follow for remote profile before remote follow support

- **WHEN** active profile이 있는 인증자가 저장된 active remote profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 remote follow change가 구현되기 전까지 follow 관계 없음으로 응답한다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 local profile이면 반환한다
- **AND** 해당 프로필이 local profile이 아니거나 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 local profile을 공개 follow할 수 있어야 한다(MUST).

#### Scenario: Follow active local profile

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 `ACCEPTED` follow 관계를 생성한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 `ACCEPTED` 상태로 follow 중인 local profile follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다

#### Scenario: Follow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Reject remote profile follow before remote follow support

- **WHEN** active profile이 있는 인증자가 저장된 active remote profile follow를 요청한다
- **THEN** 시스템은 remote follow change가 구현되기 전까지 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계를 생성하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 local follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active local profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다

#### Scenario: Unfollow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Reject remote profile unfollow before remote follow support

- **WHEN** active profile이 있는 인증자가 저장된 active remote profile unfollow를 요청한다
- **THEN** 시스템은 remote follow change가 구현되기 전까지 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
