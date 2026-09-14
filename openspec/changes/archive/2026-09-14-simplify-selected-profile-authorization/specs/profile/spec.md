## MODIFIED Requirements

### Requirement: Active profile selection

**Authority / Provenance:** `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/objects/account-profile-membership.md`, `docs/architecture/core-services.md`, `openspec/specs/profile/spec.md` (existing behavior being corrected), `PROD-962` — 로그인했고 선택 가능한 Profile이 있는 사용자는 Account와 Profile 사이에 Account-Profile Membership이 존재하고 Profile의 공통 조회 가능 상태를 통과할 때 해당 Profile을 현재 세션의 selected Profile로 선택할 수 있어야 한다(MUST). 선택 자격은 Membership 존재로만 결정하며 Profile Origin 또는 Instance Kind, Account Profile Role, Profile 생성자 여부를 별도 선택 조건으로 검사하면 안 된다(MUST NOT). `selectProfile`과 GraphQL `usingProfile` 경계가 Active Account, Membership과 selected Profile의 공통 조회 가능 상태를 확인한 뒤에는 resolver와 application action이 같은 선택 자격을 다시 만들거나 검사하면 안 된다(MUST NOT). 이 requirement는 Remote Profile 선택을 지원하거나 금지하는 제품 capability를 정의하지 않는다.

#### Scenario: Select accessible active account profile

- **WHEN** 로그인한 계정이 자신과 연결된 Membership을 가진 조회 가능한 active profile 선택을 요청하고 소속 instance가 `SUSPENDED`가 아니다
- **THEN** 시스템은 현재 세션의 active profile을 해당 프로필로 변경한다
- **AND** mutation은 `SelectProfilePayload.profile`로 선택된 `Profile`을 반환한다
- **AND** mutation은 `SelectProfilePayload.session`으로 현재 `Session`을 반환한다
- **AND** 반환된 `Session.selectedProfile`은 선택된 프로필을 가리켜 클라이언트 캐시가 active profile 변경을 동기화할 수 있다

#### Scenario: Reject profile without membership or visibility

- **WHEN** 로그인한 계정이 Membership으로 연결되지 않았거나 active가 아니거나 소속 instance가 `SUSPENDED`인 profile 선택을 요청한다
- **THEN** 시스템은 profile not found 오류를 반환한다
- **AND** 현재 세션의 active profile을 변경하지 않는다

#### Scenario: Selection does not add origin, role, or creator checks

- **WHEN** 선택 대상이 현재 계정의 Account-Profile Membership으로 연결되어 있고 공통 조회 가능 상태를 통과한다
- **THEN** 시스템은 Profile Origin 또는 Instance Kind, Account Profile Role, Profile 생성자 여부를 추가 선택 조건으로 검사하지 않고 selected Profile을 설정한다

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/hashtag.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `docs/domain/decisions/0019-selected-profile-authorization-boundary.md`, `docs/domain/decisions/0020-profile-tag-shared-hashtag-identity.md`, `docs/architecture/core-services.md`, `openspec/specs/profile/spec.md` (existing behavior being corrected), `PROD-489` 확정 결정 기록, `PROD-490`, `PROD-523` (PR #394), `PROD-522`, `PROD-526`, `PROD-648`, `PROD-665`, `PROD-962` — Active Account가 현재 선택한 Profile의 Owner이고 Lifecycle State가 `Active`, Suspension State가 `Normal`일 때 표시 이름, bio, 팔로우 정책과 전체 Profile Tag 목록을 수정할 수 있어야 한다(MUST). `defaultPostVisibility`는 Local Profile에만 적용·변경할 수 있고 `PUBLIC`, `UNLISTED`, `FOLLOWERS`만 허용해야 한다(MUST). Profile update input은 대상 Profile ID를 받지 않고 검증된 세션의 selected Profile identity를 사용해야 한다(MUST). Member, selected Profile 없음, Deactivated Profile은 수정할 수 없어야 한다(MUST NOT). 선택적 `tags: [String!]` input에 목록이 제공되면 기존 Profile Tag 전체 목록을 같은 Profile update transaction에서 교체해야 하며(MUST), input을 생략하거나 `null`로 보내면 기존 목록을 유지해야 한다(MUST). Profile Origin 또는 Instance Kind는 `defaultPostVisibility`를 제외한 update field의 selected actor 조건이 아니다. Core Profile action은 수정 transaction을 직접 소유하고 실제 actor-visible 변경 commit 뒤의 Effects Workflow start를 직접 시도해야 하며(MUST), caller database handle이나 caller-side post-commit lifecycle을 공개해서는 안 된다(MUST NOT).

#### Scenario: Update profile as owner

- **WHEN** Active Account가 현재 선택한 Lifecycle State `Active`, Suspension State `Normal`의 Profile `OWNER`로 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** 생략된 displayName, bio, followPolicy 값은 변경하지 않는다
- **AND** tags가 제공되면 Hashtag identity로 검증·resolve한 전체 목록과 관계를 같은 transaction에서 교체한다
- **AND** tags가 생략되거나 `null`이면 기존 Profile Tag 관계를 유지한다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`과 tags를 반환하며 배열 순서는 계약하지 않는다
- **AND** 기본값은 nullable `private` projection의 non-null `defaultPostVisibility`로 조회할 수 있다

#### Scenario: Clear Profile Tags as owner

- **WHEN** Active Account가 현재 선택한 Active Profile의 `OWNER`로 tags 빈 목록을 명시해 수정을 요청한다
- **THEN** 시스템은 해당 Profile의 Profile Tag 관계를 모두 제거한다
- **AND** 다른 제공 값과 빈 tags를 포함한 갱신된 Profile을 반환한다

#### Scenario: Reject an invalid atomic update

- **WHEN** Profile update의 tags가 Hashtag Name syntax·정규화·문자·길이 또는 canonical identity 중복 검증을 통과하지 않는다
- **THEN** 시스템은 tags field와 연결된 validation 오류를 반환한다
- **AND** 같은 요청의 displayName, bio, followPolicy와 기존 Profile Tag 관계를 어느 것도 변경하지 않는다

#### Scenario: Reject unsupported default visibility

- **WHEN** Owner가 기본 Post Visibility로 `DIRECT` 또는 지원하지 않는 값을 제출한다
- **THEN** 시스템은 field validation 오류로 거부한다
- **AND** 기존 Profile 기본값, 다른 Profile 속성과 Profile Tag 관계를 변경하지 않는다

#### Scenario: Reject update without a usable selected Profile

- **WHEN** selected Profile이 없거나 Deactivated·Suspended 상태이거나 현재 Account가 inactive이거나 selected Profile membership이 유효하지 않다
- **THEN** 시스템은 selected Profile authorization 오류로 요청을 거부한다
- **AND** Profile Tag 관계를 변경하지 않는다

#### Scenario: Reject profile update without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다
- **AND** Profile Tag 관계를 변경하지 않는다

#### Scenario: Core-owned Profile update transaction

- **WHEN** GraphQL caller가 Profile 수정을 요청한다
- **THEN** Core action은 기본 database로 transaction을 완료한 뒤 Profile 결과를 반환한다
- **AND** caller는 database handle이나 post-commit callback을 전달하거나 실행하지 않는다
