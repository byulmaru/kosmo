## MODIFIED Requirements

### Requirement: Profile object visibility

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — API는 활성 local profile과 저장된 활성 ActivityPub remote profile을 GraphQL profile object로 조회할 수 있게 해야 한다(MUST). Profile object는 연결된 normalized Hashtag Name을 제공하는 non-null `tags: [String!]!` field를 가져야 하며(MUST). 배열의 요소 순서는 API 계약이 아니다. Local 여부는 configured instance ID가 아니라 Profile Origin과 연결된 Instance Kind로 판정해 모든 Local Profile의 유효한 관계를 반환하고 Remote Profile은 빈 목록을 반환해야 하며(MUST), 현재 범위에서 Local Profile Tag만 반환해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** local profile 상태가 `ACTIVE`이고 소속 instance가 차단되지 않았다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드와 연결된 tags를 노출한다
- **AND** Profile Tag가 없으면 tags는 빈 목록이다
- **AND** Local 판정은 Profile Origin과 연결된 Instance Kind를 사용하며 configured Local Instance ID에 제한하지 않는다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object

- **WHEN** ActivityPub remote profile 상태가 `ACTIVE`이고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Remote Profile Tag 수집·표시는 제외되므로 tags는 빈 목록이다
- **AND** Node ID 기반 profile load는 활성 remote profile을 반환할 수 있다

#### Scenario: Access profile from suspended instance

- **WHEN** 프로필이 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 프로필 object 접근을 허용하지 않는다
- **AND** Profile Tag를 별도 경로로 노출하지 않는다

#### Scenario: Access inactive profile object

- **WHEN** 프로필 상태가 `ACTIVE`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용하지 않는다
- **AND** Profile Tag를 별도 경로로 노출하지 않는다

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `PROD-489`, `PROD-523` (PR #394), `PROD-522`, `PROD-526` — Active Account의 Owner는 Origin이 Local이고 Lifecycle State가 `Deleted`가 아니며 Suspension State가 `Normal`인 Profile(Deactivated Profile 포함)의 표시 이름, bio, 팔로우 정책과 전체 Profile Tag 목록을 수정할 수 있어야 한다(MUST). Member는 Profile 운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT). 선택적 `tags: [String!]` input에 목록이 제공되면 기존 Profile Tag 전체 목록을 같은 Profile update transaction에서 교체해야 하며(MUST), input을 생략하거나 `null`로 보내면 기존 목록을 유지해야 한다(MUST).

#### Scenario: Update profile as owner

- **WHEN** Active Account의 프로필 `OWNER`가 Lifecycle State가 `Deleted`가 아니고 Suspension State가 `Normal`인 Local Profile(Deactivated Profile 포함) 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** tags가 제공되면 Hashtag identity로 검증·resolve한 전체 목록과 관계를 같은 transaction에서 교체한다
- **AND** tags가 생략되거나 `null`이면 기존 Profile Tag 관계를 유지한다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`과 tags를 반환하며 배열 순서는 계약하지 않는다

#### Scenario: Clear Profile Tags as owner

- **WHEN** Active Account의 `OWNER`가 Lifecycle State가 `Deleted`가 아니고 Suspension State가 `Normal`인 Local Profile(Deactivated Profile 포함)에 tags 빈 목록을 명시해 수정을 요청한다
- **THEN** 시스템은 해당 Profile의 Profile Tag 관계를 모두 제거한다
- **AND** 다른 제공 값과 빈 tags를 포함한 갱신된 Profile을 반환한다

#### Scenario: Reject an invalid atomic update

- **WHEN** Profile update의 tags가 Hashtag Name syntax·정규화·문자·길이 또는 canonical identity 중복 검증을 통과하지 않는다
- **THEN** 시스템은 tags field와 연결된 validation 오류를 반환한다
- **AND** 같은 요청의 displayName, bio, followPolicy와 기존 Profile Tag 관계를 어느 것도 변경하지 않는다

#### Scenario: Update missing or inaccessible profile

- **WHEN** 수정 대상 프로필이 없거나 Remote Profile이거나 Lifecycle State가 `Deleted`이거나 Suspension State가 `Suspended`이거나 현재 Account가 inactive이거나 Profile과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** Profile Tag 관계를 변경하지 않는다

#### Scenario: Reject profile update without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다
- **AND** Profile Tag 관계를 변경하지 않는다
