## Purpose

kosmo 프로필 capability의 현재 계약을 문서화한다. 이 스펙은 프로필 identity, 계정-프로필 역할, 조회, 생성, 수정, 비활성화, 활성 프로필 선택을 다룬다.

## Requirements

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

### Requirement: Profile object visibility

API는 활성 local profile과 저장된 활성 ActivityPub remote profile을 GraphQL profile object로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이고 소속 instance가 차단되지 않았다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object

- **WHEN** ActivityPub remote profile 상태가 `ACTIVE`이고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 remote profile을 반환할 수 있다

#### Scenario: Access profile from suspended instance

- **WHEN** 프로필이 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 프로필 object 접근을 허용하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다

### Requirement: Account-profile membership

시스템은 계정과 프로필의 관계를 역할이 있는 membership으로 관리해야 한다(MUST).

#### Scenario: Create owned profile membership

- **WHEN** 로그인한 계정이 프로필을 생성한다
- **THEN** 시스템은 생성된 프로필과 현재 계정을 연결한다
- **AND** 현재 계정의 역할은 `OWNER`이다

#### Scenario: Prevent duplicate membership

- **WHEN** 계정과 프로필의 membership이 이미 존재한다
- **THEN** 시스템은 같은 계정과 프로필 조합의 membership을 중복 저장하지 않는다

### Requirement: Profile creation

로그인한 계정은 유효한 handle로 자신이 소유한 configured local profile을 생성할 수 있어야 한다(MUST).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 유효한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 configured local instance에 속한 local profile로 handle과 정규화된 handle을 저장한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** mutation은 `CreateProfilePayload.profile`로 생성된 `Profile`을 반환한다
- **AND** mutation은 `CreateProfilePayload.account`로 현재 계정과 갱신된 프로필 목록을 반환한다

#### Scenario: Create profile with duplicate local handle

- **WHEN** 로그인한 계정이 configured local instance 안에서 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

#### Scenario: Create profile with remote-only duplicate handle

- **WHEN** 로그인한 계정이 다른 ActivityPub instance에만 존재하는 정규화 handle로 local profile 생성을 요청한다
- **THEN** 시스템은 그 remote profile을 local handle conflict로 취급하지 않는다
- **AND** 다른 local profile 생성 검증을 통과하면 configured local instance에 새 profile을 생성할 수 있다

### Requirement: Profile updates

프로필의 owner 또는 admin은 활성 프로필의 표시 이름, bio, 팔로우 정책을 수정할 수 있어야 한다(MUST).

#### Scenario: Update profile as owner or admin

- **WHEN** 프로필의 `OWNER` 또는 `ADMIN` 계정이 활성 프로필 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`을 반환한다

#### Scenario: Update missing or inaccessible profile

- **WHEN** 수정 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Update profile without admin role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER` 또는 `ADMIN`이 아니다
- **THEN** 시스템은 admin permission required 오류를 반환한다

### Requirement: Profile disabling

프로필 owner는 활성 프로필을 비활성화할 수 있어야 한다(MUST).

#### Scenario: Disable profile as owner

- **WHEN** 프로필의 `OWNER` 계정이 활성 프로필 삭제를 요청한다
- **THEN** 시스템은 프로필 상태를 `DISABLED`로 변경한다
- **AND** 해당 프로필을 활성 프로필로 가진 모든 세션의 active profile을 해제한다
- **AND** mutation은 `DeleteProfilePayload.profileId`로 비활성화된 `Profile` ID를 반환한다

#### Scenario: Disable missing or inaccessible profile

- **WHEN** 삭제 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Disable profile without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다

### Requirement: Active profile selection

로그인한 계정은 자신과 연결되어 있고 active이며 소속 instance가 `SUSPENDED`가 아닌 profile을 instance kind와 무관하게 현재 세션의 active profile로 선택할 수 있어야 한다(MUST).

#### Scenario: Select accessible active local profile

- **WHEN** 로그인한 계정이 자신과 연결되어 있고 active이며 소속 instance가 `SUSPENDED`가 아닌 profile 선택을 요청한다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Select owned active remote profile

- **WHEN** 로그인한 계정이 자신과 연결된 저장된 active remote profile을 현재 세션의 active profile로 선택하려고 한다
- **THEN** 시스템은 선택을 허용하고 현재 세션의 active profile을 해당 remote profile로 변경한다
- **AND** 같은 세션의 후속 요청은 선택된 remote profile을 복원한다

#### Scenario: Reject unowned or invisible profile selection

- **WHEN** 로그인한 계정이 자신과 연결되지 않았거나 active가 아니거나 소속 instance가 `SUSPENDED`인 profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Profile follow graph

API는 활성 상태이고 `SUSPENDED`가 아닌 profile 간 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST). Viewer active profile이 대상 profile을 follow하는 established 관계는 `Profile.viewerState.follow`로만 노출해야 한다(MUST).

#### Scenario: Read followers

- **WHEN** 클라이언트가 활성 profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 profile을 followee로 하고 follower 프로필도 노출 가능한 활성 profile인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read following

- **WHEN** 클라이언트가 활성 profile의 following connection을 조회한다
- **THEN** 시스템은 해당 profile을 follower로 하고 followee 프로필도 노출 가능한 활성 profile인 follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read public follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 노출 가능한 활성 profile이면 해당 `ProfileFollow`를 반환한다

#### Scenario: Read viewer state

- **WHEN** 클라이언트가 활성 프로필의 `viewerState`를 조회한다
- **THEN** 시스템은 현재 요청에 active profile이 선택되어 있으면 viewer-relative 상태를 반환한다
- **AND** 현재 요청에 active profile이 없으면 없음으로 응답한다
- **AND** 조회 대상 프로필이 viewer active profile 자신인지 `isSelf`로 반환한다
- **AND** viewer active profile이 대상 프로필을 follow하는 관계가 있으면 `follow`로 반환하고, 없으면 없음으로 응답한다
- **AND** 동일 관계를 `Profile`의 다른 viewer-relative follow 필드로 중복 노출하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 공개 `LOCAL` profile의 정책에 따라 즉시 follow 관계를 만들거나 pending follow request를 만들 수 있어야 한다(MUST).

#### Scenario: Follow open active local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `OPEN`인 다른 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 follow 관계를 생성한다
- **AND** mutation은 `FollowProfilePayload.result`로 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow open profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 follow 중인 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.result`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다
- **AND** follower/followee 저장 count를 중복 증가시키지 않는다

#### Scenario: Request approval-required local profile

- **WHEN** active profile이 있는 인증자가 `followPolicy`가 `APPROVAL_REQUIRED`인 다른 활성 `LOCAL` profile follow를 요청한다
- **THEN** 시스템은 pending `ProfileFollowRequest`를 생성한다
- **AND** mutation은 `FollowProfilePayload.result`로 생성된 `ProfileFollowRequest`를 반환한다
- **AND** followers/following connection, count와 viewer follow 상태를 변경하지 않는다

#### Scenario: Request approval-required profile idempotently

- **WHEN** active profile이 있는 인증자가 같은 활성 `APPROVAL_REQUIRED` `LOCAL` profile에 이미 pending request를 보유한 상태로 follow를 다시 요청한다
- **THEN** 시스템은 `FollowProfilePayload.result`로 기존 `ProfileFollowRequest`를 반환한다
- **AND** 오류로 처리하거나 request를 중복 생성하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 conflict code를 가진 GraphQL 오류로 요청을 거부한다
- **AND** `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하지 않는다

#### Scenario: Follow missing or unavailable profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성 프로필, 또는 `SUSPENDED` instance 소속 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 또는 `ProfileFollowRequest`를 생성하지 않는다

#### Scenario: Reject remote profile follow before remote follow support

- **WHEN** active profile이 있는 인증자가 저장된 active remote profile follow를 요청한다
- **THEN** 시스템은 remote target follow capability가 구현되기 전까지 profile not found 오류를 반환한다
- **AND** `ProfileFollow` 관계, `ProfileFollowRequest` 요청 또는 ActivityPub activity를 생성하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 visible profile follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active visible profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 visible profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** mutation은 `UnfollowProfilePayload.profileFollowId`로 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 visible profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다

#### Scenario: Unfollow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 `SUSPENDED` instance 소속 프로필 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다

### Requirement: Account profile list query

API는 로그인한 계정이 app-shell 프로필 전환을 위해 해당 계정과 연결된 활성 프로필을 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read accessible active profiles

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 해당 계정과 연결된 활성 프로필을 반환한다
- **AND** 반환된 각 프로필은 profile object가 노출하는 프로필 필드를 포함한다

#### Scenario: Hide inaccessible profiles from account list

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 비활성 프로필이나 해당 계정과 연결되지 않은 프로필을 반환하지 않는다

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
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 local/remote UI를 분기한다
- **AND** remote profile 링크는 `/${relativeHandle}` path로 이동한다
- **AND** `relativeHandle`은 `@handle@domain` 형식이고, route parameter는 `handle@domain`으로 전달되어 `profileByHandle`이 federated handle로 조회할 수 있어야 한다

#### Scenario: Link within stored remote profile by relative handle

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile의 profile page 안에서 하위 링크를 만든다
- **THEN** 클라이언트는 bare `handle`이 아니라 `relativeHandle`을 사용하고 `Profile.instance.kind`로 local/remote UI를 분기한다
- **AND** 하위 링크는 `/${relativeHandle}` path 아래에서 route parameter가 `handle@domain`으로 전달되는 federated handle URL을 유지한다

#### Scenario: Hide local follow action for remote profile

- **WHEN** 클라이언트가 저장된 ActivityPub remote profile을 표시한다
- **THEN** 클라이언트는 remote follow change가 구현되기 전까지 local follow mutation을 실행하는 follow action을 숨기거나 비활성화한다

### Requirement: Pending follow request lifecycle

시스템은 local 또는 remote profile 사이에 이미 저장된 pending `ProfileFollowRequest`를 같은 core lifecycle로 조회·승인·거절·취소할 수 있어야 한다(MUST).

#### Scenario: Find pending request by participant pair

- **WHEN** 시스템이 follower/followee profile pair로 pending request를 조회한다
- **THEN** 동일 pair의 `ProfileFollowRequest`가 있으면 반환한다
- **AND** 없으면 없음으로 응답한다

#### Scenario: Approve incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 승인을 실행한다
- **THEN** 시스템은 request를 삭제하고 성립된 `ProfileFollow`를 생성하거나 기존 관계를 반환한다
- **AND** 삭제된 request ID와 follower/followee Profile을 반환한다

#### Scenario: Reject incoming request

- **WHEN** active profile이 pending request의 followee이고 요청 거절을 실행한다. 이때 follower가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followeeProfile`을 반환한다
- **AND** unavailable일 수 있는 follower Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Cancel outgoing request

- **WHEN** active profile이 pending request의 follower이고 요청 취소를 실행한다. 이때 followee가 비활성이거나 remote instance가 `SUSPENDED`일 수 있다
- **THEN** 시스템은 request를 삭제한다
- **AND** 삭제된 request ID와 행동자인 non-null `followerProfile`을 반환한다
- **AND** unavailable일 수 있는 followee Profile은 payload에 포함하지 않는다
- **AND** relation과 저장 count를 변경하지 않는다

#### Scenario: Reject unauthorized request transition

- **WHEN** active profile이 request participant가 아니거나 승인·거절 주체인 followee 또는 취소 주체인 follower가 아니다
- **THEN** 시스템은 permission denied 오류를 반환한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Reject approval with unavailable participant

- **WHEN** request participant가 비활성 상태이거나 remote participant의 instance가 `SUSPENDED`인 상태에서 승인을 실행한다
- **THEN** 시스템은 승인을 거부한다
- **AND** request, relation과 저장 count를 변경하지 않는다

#### Scenario: Repeat completed request transition

- **WHEN** 이미 처리되어 존재하지 않는 request ID로 승인·거절·취소를 다시 실행한다
- **THEN** 시스템은 request not found 오류를 반환한다
- **AND** relation과 저장 count를 추가로 변경하지 않는다

### Requirement: Profile-owned follow request connections

API는 현재 active profile이 참여하는 pending follow request를 해당 `Profile`이 소유하는 incoming/outgoing connection으로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read own incoming requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 incoming follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 followee인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Read own outgoing requests

- **WHEN** active profile이 있는 인증자가 같은 active profile의 outgoing follow request connection을 조회한다
- **THEN** 시스템은 해당 profile이 follower인 visible pending request를 안정적이고 결정적인 순서로 반환한다
- **AND** 각 edge의 node는 `ProfileFollowRequest`이다

#### Scenario: Hide another profile's request connections

- **WHEN** 인증자가 현재 active profile과 다른 Profile의 incoming 또는 outgoing follow request connection을 조회한다
- **THEN** 시스템은 connection을 `null`로 반환한다
- **AND** request 존재 여부를 노출하지 않는다

#### Scenario: Keep request visible for participant cleanup

- **WHEN** 현재 active profile이 pending request의 participant이고 다른 participant가 비활성 상태이거나 remote instance가 `SUSPENDED`이다
- **THEN** 시스템은 해당 request를 현재 active profile의 incoming/outgoing connection에서 반환한다
- **AND** unavailable participant의 Profile 필드는 해당 Profile의 visibility 계약에 따라 `null`일 수 있다

#### Scenario: Paginate requests deterministically

- **WHEN** participant가 변경되지 않은 pending request connection을 opaque cursor로 페이지 이동한다
- **THEN** 시스템은 각 visible request를 결정적인 전체 순서에 따라 반환한다
- **AND** before/after 페이지 이동에서 request를 중복하거나 누락하지 않는다
