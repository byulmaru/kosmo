## MODIFIED Requirements

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `docs/architecture/core-services.md`, `PROD-489`, `PROD-648`, `PROD-665` 프로필의 Owner는 활성 Local Profile의 표시 이름, bio, 팔로우 정책과 기본 Post Visibility를 수정할 수 있어야 한다(MUST). Member는 Profile 운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT). Core Profile action은 수정 transaction을 직접 소유하고 실제 actor-visible 변경 commit 뒤의 effects Workflow start를 직접 시도해야 하며(MUST), caller database handle이나 caller-side post-commit lifecycle을 공개해서는 안 된다(MUST NOT).

#### Scenario: Update profile as owner

- **WHEN** 프로필의 `OWNER` 계정이 활성 Local Profile 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy, defaultPostVisibility 값을 갱신한다
- **AND** 생략된 값은 변경하지 않는다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`을 반환하며 기본값은 nullable `private` projection의 non-null `defaultPostVisibility`로 조회할 수 있다

#### Scenario: Update missing or inaccessible profile

- **WHEN** 수정 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Reject profile update without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다

#### Scenario: Reject unsupported default visibility

- **WHEN** Owner가 기본 Post Visibility로 `DIRECT` 또는 지원하지 않는 값을 제출한다
- **THEN** 시스템은 field validation 오류로 거부한다
- **AND** 기존 Profile 기본값과 다른 Profile 속성을 부분 변경하지 않는다

#### Scenario: Reject Remote Profile setting update

- **WHEN** Account가 Remote Profile의 기본 Post Visibility 변경을 요청한다
- **THEN** 시스템은 Profile 설정을 만들거나 변경하지 않는다

#### Scenario: Core-owned Profile update transaction

- **WHEN** GraphQL caller가 Profile 수정을 요청한다
- **THEN** Core action은 기본 database로 transaction을 완료한 뒤 Profile 결과를 반환한다
- **AND** caller는 database handle이나 post-commit callback을 전달하거나 실행하지 않는다
