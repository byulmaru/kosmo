## ADDED Requirements

### Requirement: Profile 기본 Post Visibility 조회

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-648` MUST: API는 현재 Account가 Member인 Local Profile에 nullable `Profile.private` projection과 그 안의 non-null
`defaultPostVisibility`를 제공해야 한다(MUST). 값은 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나여야 하며(MUST),
저장값이 없는 Local Profile은 `UNLISTED`로 반환해야 한다(MUST). Remote Profile이나 현재 Account가 Member가
아닌 Profile에는 `Profile.private`를 `null`로 반환해 Kosmo Local 설정을 노출해서는 안 된다(MUST NOT).

#### Scenario: Local Profile Member가 기본값 조회

- **WHEN** 현재 Account가 Local Profile의 Owner 또는 Member이고 해당 Profile의 `private.defaultPostVisibility`를 조회한다
- **THEN** API는 `Profile.private` projection 안에 저장된 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 non-null로 반환한다
- **AND** 저장값이 없으면 `UNLISTED`를 반환한다

#### Scenario: Remote Profile 기본값 비노출

- **WHEN** 클라이언트가 Remote Profile의 `private` projection을 조회한다
- **THEN** API는 `Profile.private`를 `null`로 반환해 Kosmo Local 기본값이 없음을 나타낸다
- **AND** Remote Profile에 fallback 값을 저장하거나 설정 조회를 허용하지 않는다

#### Scenario: Member가 아닌 Account 기본값 비노출

- **WHEN** 현재 Account가 대상 Local Profile의 Owner 또는 Member가 아니다
- **THEN** API는 대상 Profile의 `private` projection을 `null`로 반환해 기본 Post Visibility를 노출하지 않는다

## MODIFIED Requirements

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `PROD-489`, `PROD-648` MUST: 프로필의 Owner는 활성 Local Profile의 표시 이름, bio, 팔로우 정책과 기본 Post Visibility를 수정할 수 있어야
한다(MUST). Member는 Profile 운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT).

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
