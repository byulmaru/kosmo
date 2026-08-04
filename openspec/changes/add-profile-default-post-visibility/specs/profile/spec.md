## ADDED Requirements

### Requirement: Profile 기본 Post Visibility 조회

**Authority / Provenance:** `docs/domain/objects/profile.md`, `PROD-648` API는 현재 Account가 Member인 Local Profile에 `defaultPostVisibility`를 제공해야 한다(MUST). 이 값은
`PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나여야 하며(MUST), 저장값이 없는 Local Profile은 `UNLISTED`로
반환해야 한다(MUST). Remote Profile이나 현재 Account가 Member가 아닌 Profile에는 Kosmo Local 설정을
노출해서는 안 된다(MUST NOT).

#### Scenario: Local Profile Member가 기본값 조회

- **WHEN** 현재 Account가 Local Profile의 Owner 또는 Member이고 해당 Profile의 `defaultPostVisibility`를 조회한다
- **THEN** API는 저장된 `PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 반환한다
- **AND** 저장값이 없으면 `UNLISTED`를 반환한다

#### Scenario: Remote Profile 기본값 비노출

- **WHEN** 클라이언트가 Remote Profile의 `defaultPostVisibility`를 조회한다
- **THEN** API는 Kosmo Local 기본값이 없음을 반환한다
- **AND** Remote Profile에 fallback 값을 저장하거나 설정 조회를 허용하지 않는다

#### Scenario: Member가 아닌 Account 기본값 비노출

- **WHEN** 현재 Account가 대상 Local Profile의 Owner 또는 Member가 아니다
- **THEN** API는 대상 Profile의 기본 Post Visibility를 노출하지 않는다

### Requirement: Profile 기본 Post Visibility 설정 control

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/design/accessibility.md`, `PROD-648`; canonical `/settings` route·page shell 통합 책임은 `PROD-653` MUST: 유니버설 앱은 현재 설정 대상 Local Profile과 기본 Post Visibility를 구분해 표시하고, Owner가
`PUBLIC`, `UNLISTED`, `FOLLOWERS` 중 하나를 저장할 수 있는 Profile 설정 control을 제공해야 한다(MUST).
control은 Profile별 dirty·pending·success·error·retry 상태를 소유하고(MUST), Profile 또는 Relay Environment
전환 뒤 이전 문맥의 값이나 늦은 응답을 새 대상에 적용해서는 안 된다(MUST NOT).

#### Scenario: 현재 Profile 설정 표시

- **WHEN** Owner가 설정 가능한 Local Profile의 Profile 설정 control을 연다
- **THEN** 앱은 현재 설정 대상 Profile identity와 저장된 기본 Post Visibility를 함께 표시한다
- **AND** `PUBLIC`, `UNLISTED`, `FOLLOWERS` 각각의 의미를 설명한다
- **AND** 접근성 이름은 Kosmo 내부 Profile 설정과 현재 대상 Profile을 식별한다

#### Scenario: 변경 저장

- **WHEN** Owner가 다른 기본 Post Visibility를 선택하고 저장한다
- **THEN** 앱은 dirty 상태를 표시하고 저장 중 중복 제출을 차단한다
- **AND** 성공하면 반환된 Profile 값으로 Relay record를 수렴시키고 성공을 알린다
- **AND** Composer에서 개별 Visibility를 바꾸는 동작은 이 저장 mutation을 호출하지 않는다

#### Scenario: 저장 실패와 재시도

- **WHEN** 기본 Post Visibility 저장이 실패한다
- **THEN** 앱은 선택한 값과 현재 대상 Profile을 유지한 채 안전한 실패 안내와 재시도 action을 제공한다
- **AND** backend 오류 원문이나 다른 Profile의 값을 fallback으로 표시하지 않는다

#### Scenario: Profile 전환 중 늦은 응답 격리

- **WHEN** 설정 조회 또는 저장이 진행 중인 동안 selected Profile이나 Relay Environment가 바뀐다
- **THEN** 앱은 새 문맥의 Profile identity와 설정값으로 control 상태를 새로 시작한다
- **AND** 이전 문맥의 늦은 조회·mutation completion은 새 Profile의 값, success, error 또는 pending 상태를
  변경하지 않는다

#### Scenario: Owner가 아닌 Member의 변경 금지

- **WHEN** 대상 Profile의 Member이지만 Owner가 아닌 Account가 기본값 변경을 시도한다
- **THEN** 앱과 API는 변경을 허용하지 않는다
- **AND** Member는 서버가 반환한 기본값을 새 Composer 초기값으로 계속 사용할 수 있다

## MODIFIED Requirements

### Requirement: Profile updates

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/account-profile-membership.md`, `docs/domain/decisions/0008-relationship-report-state-exclusions.md`, `PROD-489`, `PROD-648` MUST: 프로필의 Owner는 활성 Local Profile의 표시 이름, bio, 팔로우 정책과 기본 Post Visibility를 수정할 수 있어야
한다(MUST). Member는 Profile 운영 권한을 갖지 않으며 Profile을 수정할 수 없어야 한다(MUST NOT).

#### Scenario: Update profile as owner

- **WHEN** 프로필의 `OWNER` 계정이 활성 Local Profile 수정을 요청한다
- **THEN** 시스템은 제공된 displayName, bio, followPolicy, defaultPostVisibility 값을 갱신한다
- **AND** 생략된 값은 변경하지 않는다
- **AND** mutation은 `UpdateProfilePayload.profile`로 갱신된 `Profile`을 반환한다

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
