## ADDED Requirements

### Requirement: Instance storage

시스템은 local 및 remote federation instance를 `instance` 행으로 저장해야 한다(MUST).

#### Scenario: Store local instance

- **WHEN** local instance가 초기화된다
- **THEN** 시스템은 canonical origin, domain, instance type, 생성 시각, 수정 시각을 저장한다
- **AND** local instance의 canonical origin과 domain은 federation identity의 source of truth이다
- **AND** `PUBLIC_ORIGIN`은 local instance row를 만들거나 검증하는 입력으로만 사용된다

#### Scenario: Store remote instance shell

- **WHEN** 시스템이 remote profile 저장을 위해 remote instance를 기록한다
- **THEN** 시스템은 remote instance의 domain, 선택적 canonical origin, instance type, 생성 시각, 수정 시각을 저장한다
- **AND** remote actor fetch/cache 동작은 이 저장 요구사항에 포함되지 않는다

#### Scenario: Prevent duplicate instance domain

- **WHEN** 같은 domain의 instance가 이미 저장되어 있다
- **THEN** 시스템은 같은 domain을 가진 instance를 중복 저장하지 않는다

### Requirement: ActivityPub actor storage

시스템은 profile에 연결되는 ActivityPub actor metadata와 key material을 별도 행으로 저장해야 한다(MUST).

#### Scenario: Store local actor metadata

- **WHEN** local profile이 ActivityPub actor로 공개된다
- **THEN** 시스템은 profile, actor URI, actor type, 생성 시각, 수정 시각을 ActivityPub actor metadata로 저장할 수 있다
- **AND** actor URI는 `https://{localOrigin}/ap/actor/{profile.id}` 형식이다

#### Scenario: Store local actor keys

- **WHEN** local actor key pair가 생성된다
- **THEN** 시스템은 profile, key type, public key JWK, private key JWK, 생성 시각을 저장한다
- **AND** key type은 RSA-PKCS#1-v1.5와 Ed25519를 구분한다
- **AND** 같은 profile과 key type의 key row는 중복될 수 없다

#### Scenario: Store remote actor shell

- **WHEN** 시스템이 remote profile의 ActivityPub actor 저장 경계를 마련한다
- **THEN** 시스템은 remote profile, actor URI, actor type, 선택적 public key metadata를 저장할 수 있다
- **AND** remote actor fetch/cache, key refresh, signature verification 동작은 이번 요구사항에 포함되지 않는다

## MODIFIED Requirements

### Requirement: UUID 기반 테이블 식별자

시스템은 주요 도메인 테이블의 기본 키를 PostgreSQL `uuid` 값으로 저장하고, 애플리케이션에서 생성한 시간 정렬 가능 ID에 테이블 식별자를 포함해야 한다(MUST).

#### Scenario: 새 도메인 행 생성

- **WHEN** `account`, `account_profile`, `activitypub_actor`, `activitypub_actor_key`, `application`, `application_authorization`, `file`, `instance`, `media`, `oauth_authorization_code`, `oauth_token`, `post`, `post_content`, `profile`, `profile_follow`, `session` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

### Requirement: 프로필과 계정-프로필 관계 저장

시스템은 소셜 프로필을 계정과 분리하여 저장하고, 계정과 프로필의 다대다 관계를 역할과 함께 저장해야 한다(MUST).

#### Scenario: 프로필 저장

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 상태, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 프로필 상태 기본값은 `ACTIVE`이다

#### Scenario: 로컬 프로필 저장

- **WHEN** local profile이 생성된다
- **THEN** 시스템은 local instance ID를 profile의 소속 instance로 저장한다
- **AND** local profile의 ActivityPub actor URI는 profile ID 기반 `/ap/actor/{profile.id}`로 파생될 수 있다

#### Scenario: 리모트 프로필 저장

- **WHEN** remote profile shell이 저장된다
- **THEN** 시스템은 remote instance ID를 profile의 소속 instance로 저장한다
- **AND** remote profile 저장은 remote actor fetch/cache 동작을 의미하지 않는다

#### Scenario: 계정-프로필 역할 저장

- **WHEN** 계정이 프로필에 연결된다
- **THEN** 시스템은 계정, 프로필, 역할, 생성 시각을 `account_profile`에 저장한다
- **AND** 동일한 계정과 프로필 조합은 중복될 수 없다
- **AND** 계정 또는 프로필이 삭제되면 관계도 함께 삭제된다
