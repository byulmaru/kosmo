## ADDED Requirements

### Requirement: Profile reactivation

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-532 — Active Account의 Local Profile Owner는 suspension이 Normal인 Deactivated Profile을 Active로 재활성화할 수 있어야 한다(MUST). 재활성화는 비활성화 때 보존한 관계를 복원하거나 새로 만들지 않으며, 해당 관계가 참여하는 저장 count를 현재 Active 상대 Profile 기준으로 다시 반영해야 한다(MUST).

#### Scenario: Reactivate deactivated local profile as Owner

- **WHEN** Active Account의 Owner가 suspension이 Normal인 Deactivated Local Profile에 `reactivateProfile`을 요청한다
- **THEN** 시스템은 lifecycle을 Active로 전이한다
- **AND** 비활성화 때 보존한 `ProfileFollow`와 Membership을 유지한다
- **AND** Active 상대 Profile과의 보존된 Follow 관계를 양쪽 저장 count에 중복 없이 다시 반영한다
- **AND** 이전 selected Profile session을 자동으로 복원하지 않는다
- **AND** mutation은 `ReactivateProfilePayload.profile`로 다시 조회 가능한 Profile을 반환한다

#### Scenario: Reject invalid reactivation state

- **WHEN** Owner가 Active, Deleted 또는 suspension이 Suspended인 Profile에 재활성화를 요청한다
- **THEN** 시스템은 lifecycle·suspension과 저장 count를 변경하지 않고 요청을 거부한다

#### Scenario: Reject unauthorized reactivation

- **WHEN** inactive Account, non-Owner Account 또는 Remote Profile에 재활성화를 요청한다
- **THEN** 시스템은 Profile과 관계를 변경하지 않고 요청을 거부한다

### Requirement: Profile terminal deletion

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, PROD-532 — Active Account의 Local Profile Owner는 suspension이 Normal인 Deactivated Profile을 되돌릴 수 없는 Deleted lifecycle로 전이할 수 있어야 한다(MUST). 시스템은 terminal 삭제를 Profile row 물리 삭제와 구분하고, 승인된 downstream cleanup이 같은 transaction에 참여할 수 있는 transport-neutral action 경계를 제공해야 한다(MUST).

#### Scenario: Delete deactivated local profile as Owner

- **WHEN** Active Account의 Owner가 suspension이 Normal인 Deactivated Local Profile에 `deleteDeactivatedProfile`을 요청한다
- **THEN** 시스템은 한 transaction에서 lifecycle을 Deleted로 전이한다
- **AND** Profile row와 Owner Membership을 보존한다
- **AND** 비활성화 때 이미 제외한 Follow 저장 count를 다시 변경하지 않는다
- **AND** Profile Tag 외에 별도 authority가 없는 관계를 임의로 삭제하지 않는다
- **AND** mutation은 `DeleteDeactivatedProfilePayload.profileId`로 Deleted Profile의 ID를 반환한다

#### Scenario: Repeat terminal deletion idempotently

- **WHEN** 같은 Active Account Owner가 이미 Deleted인 같은 Local Profile에 terminal 삭제를 다시 요청한다
- **THEN** 시스템은 cleanup side effect를 다시 실행하거나 다른 row를 변경하지 않는다
- **AND** 첫 성공과 같은 Profile ID를 반환한다

#### Scenario: Reject terminal deletion from invalid state

- **WHEN** Owner가 Active Profile 또는 suspension이 Suspended인 Profile에 terminal 삭제를 요청한다
- **THEN** 시스템은 lifecycle·suspension과 관계를 변경하지 않고 요청을 거부한다

#### Scenario: Reject unauthorized terminal deletion

- **WHEN** inactive Account, non-Owner Account 또는 Remote Profile에 terminal 삭제를 요청한다
- **THEN** 시스템은 대상 존재나 상태를 비인가 caller에게 추가로 노출하지 않고 아무 row도 변경하지 않는다

#### Scenario: Keep deleted profile terminal

- **WHEN** Deleted Profile에 편집, 비활성화, 재활성화, 선택 또는 운영자 suspension 전이를 요청한다
- **THEN** 시스템은 요청을 거부하고 Deleted lifecycle을 유지한다

## MODIFIED Requirements

### Requirement: Profile identity

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532 — 시스템은 프로필을 계정과 분리된 소셜 identity로 저장하고, configured local profile과 저장된 ActivityPub remote profile에 대한 DB-only handle 기반 조회를 지원해야 한다(MUST). Profile Lifecycle State와 Profile Suspension State는 독립적으로 저장하고 판정해야 한다(MUST).

#### Scenario: Store profile identity

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, lifecycle, suspension과 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 신규 Profile Lifecycle State는 `ACTIVE`이다
- **AND** 신규 Profile Suspension State는 `NORMAL`이다

#### Scenario: Find active local profile by bare or local-domain handle

- **WHEN** 클라이언트가 bare handle 또는 configured local domain의 `handle@domain`/`@handle@domain` 형식 handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle을 정규화하여 configured local instance에 속하고 lifecycle이 `ACTIVE`이며 suspension이 `NORMAL`인 Profile을 조회한다
- **AND** 일치하는 활성 configured local profile이 있으면 해당 프로필을 반환한다

#### Scenario: Find stored active remote profile by federated handle

- **WHEN** 클라이언트가 configured local domain이 아닌 `handle@domain` 또는 `@handle@domain` 형식의 federated handle로 프로필 조회를 요청한다
- **THEN** 시스템은 handle과 domain을 정규화한다
- **AND** 시스템은 kosmo DB에서 해당 domain의 suspended 상태가 아닌 instance와 normalized handle에 일치하고 lifecycle이 `ACTIVE`이며 suspension이 `NORMAL`인 remote `Profile`을 조회한다
- **AND** 일치하는 저장된 활성 remote profile이 있으면 해당 프로필을 반환한다
- **AND** 시스템은 `profileByHandle` 처리 중 WebFinger, actor document fetch, actor refresh, remote profile 저장을 수행하지 않는다

#### Scenario: Missing stored remote profile by handle

- **WHEN** federated handle에 해당하는 저장된 활성 remote profile이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다
- **AND** 시스템은 remote actor materialization을 자동으로 시도하지 않는다

#### Scenario: Missing profile by handle

- **WHEN** configured local instance 안에서 정규화된 handle과 일치하고 lifecycle이 `ACTIVE`이며 suspension이 `NORMAL`인 Profile이 없다
- **THEN** 시스템은 프로필 없음으로 응답한다

### Requirement: Profile handle partial search

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0004-review-consistency-clarifications.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, PROD-504, PROD-532 — 시스템은 기존 exact handle 조회 계약을 유지하면서, 입력 query를 기존 handle 정책으로 정규화한 뒤 DB에 저장된 Local/Remote Profile의 정규화 handle을 SQL `LIKE`로 부분 일치 조회하는 `searchProfiles(query:, first:, after:): ProfileConnection!`을 제공해야 한다(MUST). connection은 immutable하고 유일한 `Profile.id ASC`를 cursor 순서로 사용해 페이지 사이 중복·누락 없이 결과 비용을 제한해야 한다(MUST). exact `profileByHandle`과 partial `searchProfiles`는 모두 configured local Instance에서 lifecycle이 `ACTIVE`이고 suspension이 `NORMAL`인 Profile과, 입력 domain의 ActivityPub Instance에 저장되어 같은 Profile 상태 조건을 통과하고 `InstanceState.SUSPENDED`가 아닌 Remote Profile만 반환하는 ADR 0017 staged visibility를 사용해야 한다(MUST). 검색은 기존 local/remote handle 해석 경계를 계승해야 하며(MUST), 새로운 visibility 정책이나 데이터 모델을 추가하거나 Domain Limit·viewer Profile Domain Block 공통 predicate를 현재 구현의 선행 조건으로 요구하지 않아야 한다(MUST NOT). 최종 moderation 정책은 유지되며, 해당 두 정책은 저장 모델과 공통 predicate가 도입될 때 exact·partial lookup을 함께 전환하는 후속 rollout으로 남는다.

#### Scenario: Search configured local profiles by partial handle

- **WHEN** 클라이언트가 bare handle 일부 또는 configured local domain이 붙은 handle 일부로 검색한다
- **THEN** 시스템은 입력 handle을 기존 정책으로 정규화한다
- **AND** configured local instance에 저장되고 lifecycle이 `ACTIVE`이며 suspension이 `NORMAL`인 Profile 중 정규화 handle이 입력 문자열을 포함하는 결과를 `Profile.id ASC` cursor page로 반환한다

#### Scenario: Search stored remote profiles by partial federated handle

- **WHEN** 클라이언트가 configured local domain이 아닌 `handle-part@domain` 또는 `@handle-part@domain` 형식으로 검색한다
- **THEN** 시스템은 handle 일부와 domain을 기존 정책으로 정규화한다
- **AND** 해당 domain의 ActivityPub instance에 이미 저장되고 lifecycle이 `ACTIVE`이며 suspension이 `NORMAL`인 Remote Profile 중 정규화 handle이 입력 문자열을 포함하는 결과를 `Profile.id ASC` cursor page로 반환한다
- **AND** `InstanceState.SUSPENDED`가 아닌 remote Instance의 Profile만 반환한다
- **AND** 검색은 WebFinger, actor document fetch·refresh 또는 새 Remote Profile materialization을 수행하지 않는다
- **AND** Domain Limit Instance 및 viewer Profile Domain Block 대상 Instance 필터는 ADR 0017에 따른 미래 공통-predicate moderation rollout로 남으며 현재 검색의 선행 조건이 아니다

#### Scenario: Treat LIKE metacharacters as literal search text

- **WHEN** 검색어에 `%`, `_` 또는 SQL `LIKE` escape 문자가 포함된다
- **THEN** 시스템은 사용자 입력 메타문자를 먼저 escape하여 일반 검색 문자로 취급한다
- **AND** escape된 정규화 검색어의 양쪽에만 부분 일치용 `%`를 추가한다
- **AND** 완성된 검색 패턴은 SQL 문자열에 직접 보간하지 않고 parameter binding으로 전달한다
- **AND** 사용자 입력은 의도하지 않은 전체 또는 wildcard 패턴 검색을 만들지 않는다

#### Scenario: Paginate partial matches without duplicates or omissions

- **WHEN** 조회 정책을 통과한 Profile 수가 요청한 `first`보다 많다
- **THEN** 시스템은 immutable한 `Profile.id ASC` 순서의 첫 페이지와 다음 `after` cursor를 반환한다
- **AND** 다음 페이지는 앞 페이지 Profile을 중복하거나 아직 남은 Profile을 누락하지 않는다
- **AND** 페이지 사이에 Profile의 normalized handle이 변경되어도 ID cursor 경계가 바뀌지 않는다
- **AND** 마지막 페이지는 다음 페이지가 없음을 나타낸다

#### Scenario: Keep exact handle lookup compatible

- **WHEN** 프로필 route 또는 기존 소비자가 exact `profileByHandle` 조회를 사용한다
- **THEN** 시스템은 기존 단건 exact lookup의 입력·출력 계약을 유지한다

#### Scenario: Do not materialize remote profiles during search

- **WHEN** 저장된 remote Profile 중 부분 일치 결과가 없거나 입력 domain의 저장된 Instance가 없다
- **THEN** 시스템은 edge가 없는 connection을 반환한다
- **AND** WebFinger lookup, actor document fetch, actor refresh 또는 remote Profile 저장을 수행하지 않는다

### Requirement: Profile object visibility

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-532 — API는 lifecycle이 Active이고 suspension이 Normal인 local Profile과 저장된 ActivityPub remote Profile만 GraphQL Profile object로 공개 조회할 수 있게 해야 한다(MUST).

#### Scenario: Access active local profile object

- **WHEN** Local Profile lifecycle이 `ACTIVE`이고 suspension이 `NORMAL`이며 소속 instance가 차단되지 않았다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 local profile을 반환할 수 있다

#### Scenario: Access active remote profile object

- **WHEN** ActivityPub Remote Profile lifecycle이 `ACTIVE`이고 suspension이 `NORMAL`이며 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 프로필 object 접근을 허용한다
- **AND** handle, relativeHandle, instance.kind, displayName, nullable bio, followPolicy, createdAt 필드를 노출한다
- **AND** Node ID 기반 profile load는 활성 remote profile을 반환할 수 있다

#### Scenario: Access profile from suspended instance

- **WHEN** 프로필이 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 해당 프로필 object 접근을 허용하지 않는다

#### Scenario: Access inactive or suspended profile object

- **WHEN** Profile lifecycle이 `ACTIVE`가 아니거나 Profile suspension이 `NORMAL`이 아니다
- **THEN** 시스템은 해당 Profile object 접근을 허용하지 않는다

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-489, PROD-532 — Active Account의 Profile Owner는 suspension이 Normal이고 lifecycle이 Deleted가 아닌 Local Profile의 표시 이름, bio와 팔로우 정책을 수정할 수 있어야 한다(MUST). Member는 Profile 운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT).

#### Scenario: Update active or deactivated local profile as Owner

- **WHEN** Active Account의 Owner가 suspension이 Normal인 Active 또는 Deactivated Local Profile 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** mutation은 Owner에게 `UpdateProfilePayload.profile`로 갱신된 Profile을 반환한다

#### Scenario: Reject deleted remote or suspended profile update

- **WHEN** 수정 대상이 Deleted, Remote 또는 suspension이 Suspended인 Profile이다
- **THEN** 시스템은 Profile을 변경하지 않고 요청을 거부한다

#### Scenario: Reject profile update without Owner role or Active Account

- **WHEN** 현재 Account가 Active가 아니거나 대상 Profile의 Owner가 아니다
- **THEN** 시스템은 Profile을 변경하지 않고 요청을 거부한다

### Requirement: Profile disabling

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-532 — Active Account의 Local Profile Owner는 suspension이 Normal인 Active Profile을 Deactivated로 비활성화할 수 있어야 한다(MUST). 비활성화는 terminal 삭제와 다른 action이어야 하며(MUST), 기존 `deleteProfile`을 terminal 삭제 의미로 바꾸지 않아야 한다(MUST NOT).

#### Scenario: Deactivate active local profile as Owner

- **WHEN** Active Account의 Owner가 suspension이 Normal인 Active Local Profile에 `deactivateProfile`을 요청한다
- **THEN** 시스템은 lifecycle을 `DEACTIVATED`로 변경한다
- **AND** 해당 Profile을 selected Profile로 가진 모든 Session의 선택을 해제한다
- **AND** `ProfileFollow`와 Membership을 삭제하지 않는다
- **AND** 남은 Active 상대 Profile의 저장 followersCount/followingCount에서 해당 관계를 중복 없이 제외한다
- **AND** mutation은 `DeactivateProfilePayload.profileId`로 비활성화된 Profile ID를 반환한다

#### Scenario: Reject invalid deactivation state

- **WHEN** Owner가 Deactivated, Deleted 또는 suspension이 Suspended인 Profile에 비활성화를 요청한다
- **THEN** 시스템은 lifecycle·suspension, 관계와 저장 count를 변경하지 않고 요청을 거부한다

#### Scenario: Reject unauthorized deactivation

- **WHEN** inactive Account, non-Owner Account 또는 Remote Profile에 비활성화를 요청한다
- **THEN** 시스템은 Profile과 관계를 변경하지 않고 요청을 거부한다

#### Scenario: Preserve legacy delete mutation meaning during transition

- **WHEN** transition 기간의 구버전 caller가 legacy `deleteProfile`을 호출한다
- **THEN** 시스템은 이를 비활성화 compatibility action으로만 처리한다
- **AND** terminal 삭제를 실행하지 않는다
- **AND** contract release에서 legacy field를 제거하되 terminal 의미로 재사용하지 않는다

### Requirement: Active profile selection

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, PROD-532 — 정상 제품 경로에서 `AccountProfile`로 로그인한 Account에 연결되는 Profile은 configured local instance에 생성된 Local Profile이다. 로그인한 Account는 자신과 연결된 Profile lifecycle이 Active이고 Profile suspension이 Normal이며 소속 Instance가 `SUSPENDED`가 아닐 때 현재 Session의 selected Profile로 선택할 수 있어야 한다(MUST). 이 requirement는 제품 경로 밖에서 인위적으로 만든 Remote Profile Membership의 선택 또는 거부 동작을 정의하지 않는다.

#### Scenario: Select accessible active account profile

- **WHEN** 로그인한 Account가 자신과 연결되고 lifecycle이 `ACTIVE`, suspension이 `NORMAL`인 Profile 선택을 요청하며 소속 Instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 현재 Session의 selected Profile을 해당 Profile로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 Profile을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 Session을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 Profile을 가리켜 클라이언트 cache가 선택 변경을 동기화할 수 있다

#### Scenario: Reject unowned or unavailable profile selection

- **WHEN** 로그인한 Account가 자신과 연결되지 않았거나 lifecycle이 Active가 아니거나 Profile suspension이 Normal이 아니거나 소속 Instance가 `SUSPENDED`인 Profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 Session의 selected Profile을 변경하지 않는다

#### Scenario: Select missing or inaccessible profile

- **WHEN** 선택 대상 Profile이 없거나 공개 선택 조건을 통과하지 않거나 현재 Account와 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다
