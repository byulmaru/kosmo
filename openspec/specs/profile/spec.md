## Purpose

kosmo 프로필 capability의 현재 계약을 문서화한다. 이 스펙은 프로필 identity, 계정-프로필 역할, 조회, 생성, 수정, 비활성화, 활성 프로필 선택을 다룬다.

## Requirements

### Requirement: Profile identity

시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고 handle 기반 조회를 지원해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 상태, 생성 시각을 저장한다
- **AND** 정규화된 handle은 중복될 수 없다
- **AND** 신규 프로필 상태는 `ACTIVE`이다

#### Scenario: Find active profile by handle

- **WHEN** 클라이언트가 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 활성 프로필을 조회한다
- **AND** 일치하는 활성 프로필이 있으면 해당 프로필을 반환한다

#### Scenario: Missing profile by handle

- **WHEN** 정규화된 handle과 일치하는 활성 프로필이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile object visibility

API는 활성 프로필만 GraphQL profile object로 노출해야 한다(MUST).

#### Scenario: Access active profile object

- **WHEN** 프로필 상태가 `ACTIVE`이다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load도 활성 프로필만 반환한다

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

로그인한 계정은 유효한 handle로 자신이 소유한 프로필을 생성할 수 있어야 한다(MUST).

#### Scenario: Create profile with valid handle

- **WHEN** 로그인한 계정이 유효한 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 handle과 정규화된 handle을 저장한다
- **AND** 표시 이름은 handle과 같은 값으로 초기화된다
- **AND** 팔로우 정책은 `OPEN`으로 초기화된다
- **AND** 생성된 프로필을 반환한다

#### Scenario: Create profile with duplicate handle

- **WHEN** 로그인한 계정이 이미 사용 중인 정규화 handle로 프로필 생성을 요청한다
- **THEN** 시스템은 `handle` field의 conflict 오류를 반환한다

### Requirement: Profile updates

프로필의 owner 또는 admin은 활성 프로필의 표시 이름, bio, 팔로우 정책을 수정할 수 있어야 한다(MUST).

#### Scenario: Update profile as owner or admin

- **WHEN** 프로필의 `OWNER` 또는 `ADMIN` 계정이 활성 프로필 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** 갱신된 프로필을 반환한다

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
- **AND** 비활성화된 프로필 ID를 반환한다

#### Scenario: Disable missing or inaccessible profile

- **WHEN** 삭제 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Disable profile without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다

### Requirement: Active profile selection

로그인한 계정은 자신과 연결된 활성 프로필을 현재 세션의 active profile로 선택할 수 있어야 한다(MUST).

#### Scenario: Select accessible active profile

- **WHEN** 로그인한 계정이 자신과 연결된 활성 프로필 선택을 요청한다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** 선택된 프로필을 반환한다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Profile follow graph

API는 프로필 간 visible follow 관계를 GraphQL에서 조회할 수 있어야 한다(MUST).

#### Scenario: Read accepted followers

- **WHEN** 클라이언트가 활성 프로필의 followers connection을 조회한다
- **THEN** 시스템은 해당 프로필을 followee로 하고 follower 프로필도 활성 상태인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Read accepted following

- **WHEN** 클라이언트가 활성 프로필의 following connection을 조회한다
- **THEN** 시스템은 해당 프로필을 follower로 하고 followee 프로필도 활성 상태인 `ACCEPTED` follow 관계 중 viewer가 볼 수 있는 관계를 반환한다
- **AND** 각 edge의 node는 해당 `ProfileFollow`이다

#### Scenario: Count accepted follows

- **WHEN** 클라이언트가 활성 프로필의 followersCount 또는 followingCount를 조회한다
- **THEN** 시스템은 `ACCEPTED` follow 관계 중 상대 프로필도 활성 상태인 관계만 집계한다

#### Scenario: Read public accepted follow

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `ACCEPTED` follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 모두 활성 상태이고 `followPolicy`가 `OPEN`인 경우에만 해당 `ProfileFollow`를 반환한다

#### Scenario: Read own follow relationship

- **WHEN** active profile이 있는 인증자가 자기 active profile이 follower 또는 followee인 follow 관계를 조회한다
- **THEN** 시스템은 follower와 followee 프로필이 활성 상태이면 follow 정책과 상태에 관계없이 해당 `ProfileFollow`를 반환한다

#### Scenario: Hide follow request from unrelated viewer

- **WHEN** 클라이언트가 자기 active profile과 관련되지 않은 `PENDING` 또는 `REJECTED` follow 관계를 조회한다
- **THEN** 시스템은 해당 `ProfileFollow`를 반환하지 않는다

#### Scenario: Read viewer follow

- **WHEN** active profile이 있는 인증자가 다른 활성 프로필에 대한 viewer follow 관계를 조회한다
- **THEN** 시스템은 viewer active profile이 대상 프로필을 follow하는 `ProfileFollow` 관계를 반환한다
- **AND** 반환된 관계는 `ACCEPTED`, `PENDING`, `REJECTED` 상태를 포함할 수 있다
- **AND** follow 관계가 없으면 없음으로 응답한다

#### Scenario: Read ProfileFollow profiles

- **WHEN** 클라이언트가 `ProfileFollow.follower` 또는 `ProfileFollow.followee`를 조회한다
- **THEN** 시스템은 관계의 follower profile 또는 followee profile이 노출 가능한 활성 프로필이면 반환한다
- **AND** 해당 프로필이 노출 가능하지 않으면 없음으로 응답한다

### Requirement: Follow profile mutation

active profile이 있는 인증자는 다른 활성 프로필을 공개 follow할 수 있어야 한다(MUST).

#### Scenario: Follow active profile

- **WHEN** active profile이 있는 인증자가 다른 활성 프로필 follow를 요청한다
- **THEN** 시스템은 `ACCEPTED` follow 관계를 생성한다
- **AND** 생성된 `ProfileFollow`를 반환한다

#### Scenario: Follow profile idempotently

- **WHEN** active profile이 있는 인증자가 이미 `ACCEPTED` 상태로 follow 중인 프로필 follow를 요청한다
- **THEN** 시스템은 기존 `ProfileFollow`를 반환한다
- **AND** 오류로 처리하지 않는다

#### Scenario: Prevent self follow

- **WHEN** active profile이 있는 인증자가 자기 자신 follow를 요청한다
- **THEN** 시스템은 `ConflictError`를 반환한다

#### Scenario: Follow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 follow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Unfollow profile mutation

active profile이 있는 인증자는 기존 follow 관계를 해제할 수 있어야 한다(MUST).
`UnfollowProfileSuccess`는 삭제된 follow ID와 함께, 클라이언트 캐시 갱신을 위해 갱신된 대상 `Profile`을 포함한다.

#### Scenario: Unfollow active profile

- **WHEN** active profile이 있는 인증자가 follow 중인 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 해당 follow 관계를 제거한다
- **AND** 삭제된 `ProfileFollow` ID를 반환한다
- **AND** 갱신된 viewer follow 상태와 팔로워 수를 가진 대상 `Profile`을 함께 반환한다

#### Scenario: Unfollow profile idempotently

- **WHEN** active profile이 있는 인증자가 follow 관계가 없는 활성 프로필 unfollow를 요청한다
- **THEN** 시스템은 오류로 처리하지 않는다
- **AND** `profileFollowId`가 `null`이고 대상 `Profile`을 포함한 `UnfollowProfileSuccess`를 반환한다

#### Scenario: Unfollow missing profile

- **WHEN** active profile이 있는 인증자가 없는 대상 프로필 또는 비활성인 대상 프로필 unfollow를 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다

### Requirement: Account profile list query

API는 로그인한 계정이 app-shell 프로필 전환을 위해 해당 계정과 연결된 활성 프로필을 조회할 수 있게 해야 한다(MUST).

#### Scenario: Read accessible active profiles

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 해당 계정과 연결된 활성 프로필을 반환한다
- **AND** 반환된 각 프로필은 profile object가 노출하는 프로필 필드를 포함한다

#### Scenario: Hide inaccessible profiles from account list

- **WHEN** 로그인한 계정이 접근 가능한 프로필 목록을 요청한다
- **THEN** 시스템은 비활성 프로필이나 해당 계정과 연결되지 않은 프로필을 반환하지 않는다
