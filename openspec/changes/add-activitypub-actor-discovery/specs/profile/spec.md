## ADDED Requirements

### Requirement: Profile relative handle

API는 프로필 표시용 handle 문자열을 configured local instance 기준 `relativeHandle`로 제공해야 한다(MUST).

#### Scenario: Relative handle for configured local profile

- **WHEN** 클라이언트가 configured local instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}` 형식의 문자열을 반환한다

#### Scenario: Relative handle for profile outside configured local instance

- **WHEN** 클라이언트가 configured local instance가 아닌 instance에 속한 활성 프로필의 `relativeHandle`을 조회한다
- **THEN** 시스템은 `@{handle}@{instanceDomain}` 형식의 문자열을 반환한다
- **AND** 해당 instance가 `LOCAL` 타입이어도 configured local instance가 아니면 domain을 포함한다

## MODIFIED Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, configured local profile에 대한 handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active local profile by handle

- **WHEN** 클라이언트가 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 configured local instance에 속한 활성 프로필을 조회한다
- **AND** 일치하는 활성 configured local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Do not find remote profile by local handle query

- **WHEN** 클라이언트가 기존 handle 기반 프로필 조회를 요청한다
- **THEN** 시스템은 저장된 remote profile을 이 조회 결과로 반환하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** configured local instance 안에서 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile creation

로그인한 계정은 유효한 handle로 configured local instance에 자신이 소유한 프로필을 생성할 수 있어야 한다(MUST).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 유효한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 handle과 정규화된 handle을 저장한다
- **AND** 생성된 프로필은 configured local instance에 속한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** 생성된 프로필을 반환한다

#### Scenario: Create profile with duplicate local handle

- **WHEN** 로그인한 계정이 configured local instance에서 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

#### Scenario: Create profile with handle used only by another instance profile

- **WHEN** 로그인한 계정이 configured local instance가 아닌 instance에서만 사용 중인 정규화 handle로 local profile 생성을 요청한다
- **THEN** 시스템은 다른 instance의 handle만을 이유로 `handle` field conflict 오류를 반환하지 않는다

### Requirement: Profile object visibility

API는 활성 local profile과 저장된 활성 remote profile을 GraphQL profile object로 조회할 수 있게 해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object by Node ID

- **WHEN** remote profile 상태가 `ACTIVE`이고 클라이언트가 해당 profile의 Node ID를 직접 조회한다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다

#### Scenario: Existing local profile entry points are not expanded

- **WHEN** remote profile이 저장되어 있고 상태가 `ACTIVE`이다
- **THEN** 이번 capability는 기존 `profileByHandle(handle:)`에 remote profile을 포함하도록 확장하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다

### Requirement: Active profile selection

로그인한 계정은 자신과 연결된 활성 configured local profile만 현재 세션의 active profile로 선택할 수 있어야 한다(MUST).

#### Scenario: Select accessible active local profile

- **WHEN** 로그인한 계정이 자신과 연결된 활성 configured local profile 선택을 요청한다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** 선택된 프로필을 반환한다

#### Scenario: Reject remote profile selection

- **WHEN** 로그인한 계정이 저장된 active remote profile을 현재 세션의 active profile로 선택하려고 한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 remote profile로 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Profile follow graph

API는 local profile 간 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read accepted followers

- **WHEN** 클라이언트가 활성 local profile의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하고 follower 프로필도 활성 local profile인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read accepted following

- **WHEN** 클라이언트가 활성 local profile의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하고 followee 프로필도 활성 local profile인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Count accepted follows

- **WHEN** 클라이언트가 활성 local profile의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `ACCEPTED` follow 관계 중 상대 프로필도 활성 local profile인 관계만 집계한다

#### Scenario: Read public accepted follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `ACCEPTED` follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 local profile이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 local profile이면 follow 정책과 상태에 관계없이 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from unrelated viewer

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `PENDING` 또는 `REJECTED` follow 관계를 조회한다
- **THEN** 시스템은 해당 `ProfileFollow`를 반환하지 않는다

#### Scenario: Read viewer follow for local target

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** 반환된 관계는 `ACCEPTED`, `PENDING`, `REJECTED` 상태를 포함할 수 있다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Do not expose viewer follow for remote target

- **WHEN** active profile이 있는 인증자가 저장된 활성 remote profile에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 follow 관계 없음으로 응답한다
- **AND** 시스템은 remote follow fetch 또는 ActivityPub delivery를 시도하지 않는다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 local profile이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 local profile을 공개 follow할 수 있어야 한다(MUST).

#### Scenario: Follow active local profile

- **WHEN** active profile이 있는 인증자가 다른 활성 local profile follow를 요청한다
- **THEN** 시스템은 `ACCEPTED` follow 관계를 생성한다
- **AND** mutation은 `FollowProfilePayload.profileFollow`로 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow local profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 `ACCEPTED` 상태로 follow 중인 local profile follow를 요청한다
- **THEN** 시스템은 `FollowProfilePayload.profileFollow`로 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 `ConflictError`를 반환한다

#### Scenario: Follow missing or remote profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 저장된 remote profile follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 생성하지 않는다
- **AND** ActivityPub Follow를 발송하지 않는다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 local follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfilePayload`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active local profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow local profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 local profile unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfilePayload`를 반환한다

#### Scenario: Unfollow missing or remote profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필, 비활성인 대상 프로필, 또는 저장된 remote profile unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** local `ProfileFollow` 관계를 제거하지 않는다
- **AND** ActivityPub Undo/Follow를 발송하지 않는다
