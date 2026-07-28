## MODIFIED Requirements

### Requirement: Account-profile membership

**Authority / Provenance:** `docs/domain/objects/account-profile-membership.md`, `docs/domain/objects/profile.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `PROD-489` 시스템은 계정과 프로필의 관계를 Owner 또는 Member 역할이 있는 membership으로 관리해야 한다(MUST).

#### Scenario: Represent supported membership roles

- **WHEN** 시스템이 Account Profile Role을 application, GraphQL 또는 PostgreSQL schema에서 표현한다
- **THEN** 지원 역할은 `OWNER`와 `MEMBER`뿐이다
- **AND** `ADMIN` 역할을 노출하거나 저장하지 않는다

#### Scenario: Create owned profile membership

- **WHEN** 로그인한 계정이 프로필을 생성한다
- **THEN** 시스템은 생성된 프로필과 현재 계정을 연결한다
- **AND** 현재 계정의 역할은 `OWNER`이다

#### Scenario: Prevent duplicate membership

- **WHEN** 계정과 프로필의 membership이 이미 존재한다
- **THEN** 시스템은 같은 계정과 프로필 조합의 membership을 중복 저장하지 않는다

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `PROD-489` 프로필의 Owner는 활성 프로필의 표시 이름, bio, 팔로우 정책을 수정할 수 있어야 한다(MUST). Member는 Profile
운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT).

#### Scenario: Update profile as owner

- **WHEN** 프로필의 `OWNER` 계정이 활성 프로필 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy 값을 갱신한다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`을 반환한다

#### Scenario: Update missing or inaccessible profile

- **WHEN** 수정 대상 프로필이 없거나 활성 상태가 아니거나 현재 계정과 연결되어 있지 않다
- **THEN** 시스템은 profile not found 오류를 반환한다

#### Scenario: Reject profile update without owner role

- **WHEN** 현재 계정이 대상 프로필의 `OWNER`가 아니다
- **THEN** 시스템은 owner permission required 오류를 반환한다
