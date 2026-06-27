## ADDED Requirements

### Requirement: Instance storage

시스템은 local 및 ActivityPub federation instance를 `instance` 행으로 저장해야 한다(MUST).

#### Scenario: Store local instance

- **WHEN** local instance가 초기화된다
- **THEN** 시스템은 정규화 domain, instance kind, instance state, 생성 시각, 수정 시각을 저장한다
- **AND** local instance는 canonical origin을 저장한다
- **AND** configured local instance의 canonical origin과 domain은 federation identity의 source of truth이다
- **AND** canonical origin은 actor URI, WebFinger self link, profile-page link, key ID 같은 local absolute URL 생성에 사용된다
- **AND** domain은 WebFinger subject와 `Profile.relativeHandle`에 사용된다
- **AND** `PUBLIC_ORIGIN`은 local instance row를 만들거나 현재 deployment가 사용할 local instance row를 검증하는 입력으로만 사용된다

#### Scenario: Resolve canonical local origin

- **WHEN** 시스템이 ActivityPub actor URI, WebFinger subject, local profile 생성의 instance ID를 결정한다
- **THEN** 시스템은 `PUBLIC_ORIGIN`과 일치하는 configured local instance row의 canonical origin을 `localOrigin`으로 사용한다
- **AND** 시스템은 configured local instance row의 정규화 domain을 `localDomain`으로 사용한다
- **AND** request URL origin, Host header, `PUBLIC_API_ORIGIN`을 federation identity의 source of truth로 사용하지 않는다

#### Scenario: Missing or mismatched local instance configuration

- **WHEN** `PUBLIC_ORIGIN`과 일치하는 configured local instance row가 없다
- **THEN** 시스템은 ActivityPub discovery와 local profile 생성에 필요한 설정 오류로 처리한다

#### Scenario: Runtime local instance resolution does not bootstrap

- **WHEN** ActivityPub discovery 또는 local profile 생성 요청 처리 중 configured local instance를 해석한다
- **THEN** 시스템은 setup/migration bootstrap 없이 새 local instance row를 자동 생성하지 않는다
- **AND** 시스템은 `PUBLIC_ORIGIN`과 일치하는 existing row를 읽어 검증하고, 없거나 일치하지 않으면 설정 오류로 처리한다

#### Scenario: Store ActivityPub instance shell

- **WHEN** 시스템이 ActivityPub profile 저장을 위해 ActivityPub instance를 기록한다
- **THEN** 시스템은 ActivityPub instance의 정규화 domain, `ACTIVITYPUB` instance kind, instance state, 생성 시각, 수정 시각을 저장한다
- **AND** ActivityPub instance의 canonical origin은 선택적으로 저장할 수 있다
- **AND** ActivityPub actor fetch/cache 동작은 이 저장 요구사항에 포함되지 않는다

#### Scenario: Active instance

- **WHEN** instance state가 `ACTIVE`이다
- **THEN** 시스템은 해당 instance와 federation discovery, fetch, delivery 같은 outbound 상호작용을 시도할 수 있다

#### Scenario: Unresponsive instance

- **WHEN** 특정 ActivityPub instance가 일정 기간 이상 응답하지 않아 state가 `UNRESPONSIVE`이다
- **THEN** 시스템은 해당 instance에서 다음 inbound 요청이 오기 전까지 그 instance를 대상으로 한 outbound federation 요청을 시도하지 않는다
- **AND** 시스템이 해당 instance에서 inbound 요청을 받으면 후속 정책에 따라 state를 다시 평가할 수 있다
- **AND** 이 상태는 해당 instance와의 연합을 능동적으로 해제했다는 의미가 아니다

#### Scenario: Suspended instance

- **WHEN** 시스템 운영 정책에 따라 instance state가 `SUSPENDED`이다
- **THEN** 시스템은 해당 instance와 능동적으로 연합하지 않는다
- **AND** 시스템은 해당 instance가 inbound 요청을 보낸 것만으로 자동 재활성화하지 않는다

#### Scenario: Prevent duplicate instance domain

- **WHEN** 같은 domain의 instance가 이미 저장되어 있다
- **THEN** 시스템은 같은 정규화 domain을 가진 instance를 중복 저장하지 않는다

#### Scenario: Allow multiple local instance domains

- **WHEN** 서로 다른 domain의 local instance rows가 저장된다
- **THEN** 시스템은 instance kind가 `LOCAL`이라는 이유만으로 중복으로 처리하지 않는다
- **AND** 현재 deployment의 federation identity는 `PUBLIC_ORIGIN`과 일치하는 configured local instance row에서 결정한다

### Requirement: ActivityPub actor storage

시스템은 profile에 연결되는 ActivityPub actor metadata를 별도 행으로 저장하고, actor key material은 actor에 연결된 별도 행으로 저장해야 한다(MUST).

#### Scenario: Store local actor metadata

- **WHEN** local profile이 ActivityPub actor로 공개된다
- **THEN** 시스템은 profile, actor URI, actor type, 생성 시각, 수정 시각을 ActivityPub actor metadata로 저장한다
- **AND** actor URI는 `{localOrigin}/ap/actor/{profile.id}` 형식이다
- **AND** actor URI는 중복될 수 없다
- **AND** local profile은 local ActivityPub actor metadata row를 최대 1개만 가질 수 있다

#### Scenario: Store local actor keys

- **WHEN** local actor key pair가 생성된다
- **THEN** 시스템은 ActivityPub actor, key type, public key JWK, private key JWK, 생성 시각을 저장한다
- **AND** key type은 RSA-PKCS#1-v1.5와 Ed25519를 구분한다
- **AND** 같은 ActivityPub actor와 key type의 key row는 중복될 수 없다

#### Scenario: Store remote actor shell

- **WHEN** 시스템이 remote profile의 ActivityPub actor 저장 경계를 마련한다
- **THEN** 시스템은 remote profile, actor URI, actor type을 ActivityPub actor metadata로 저장한다
- **AND** remote actor의 public key metadata가 주어지는 경우 private key 없이 actor key 저장 경계에 둘 수 있어야 한다
- **AND** actor URI는 중복될 수 없다
- **AND** remote profile은 remote ActivityPub actor metadata row를 최대 1개만 가질 수 있다
- **AND** remote actor fetch/cache, key refresh, signature verification 동작은 이번 요구사항에 포함되지 않는다

### Requirement: Federation storage identifiers and enums

시스템은 이번 change에서 추가하는 federation 저장 행에 기존 data-model의 ID 생성 규칙과 enum 저장 규칙을 적용해야 한다(MUST).

#### Scenario: Generate IDs for federation storage rows

- **WHEN** `instance`, `activitypub_actor`, `activitypub_actor_key` 행이 생성된다
- **THEN** 시스템은 해당 테이블의 `TableDiscriminator` 값을 포함한 UUID 문자열을 기본 키로 생성한다
- **AND** 테이블 식별자는 12비트 범위 안에 있어야 한다

#### Scenario: Store federation enum values

- **WHEN** 인스턴스, ActivityPub actor, ActivityPub actor key가 저장된다
- **THEN** 시스템은 core enum에 정의된 값만 저장해야 한다
- **AND** 지원 값은 `InstanceKind`, `InstanceState`, `ActivityPubActorType`, `ActivityPubActorKeyType`에 정의된 값으로 제한된다

## MODIFIED Requirements

### Requirement: 프로필과 계정-프로필 관계 저장

시스템은 소셜 프로필을 계정과 분리하여 저장하고, 계정과 프로필의 다대다 관계를 역할과 함께 저장해야 한다(MUST).

#### Scenario: 프로필 저장

- **WHEN** 프로필이 생성된다
- **THEN** 시스템은 소속 instance, 상태, 원본 handle, 정규화된 handle, 표시 이름, 선택적 bio, 팔로우 정책, 생성 시각을 저장한다
- **AND** 소속 instance와 정규화된 handle 조합은 중복될 수 없다
- **AND** 프로필 상태 기본값은 `ACTIVE`이다

#### Scenario: 로컬 프로필 저장

- **WHEN** local profile이 생성된다
- **THEN** 시스템은 configured local instance ID를 profile의 소속 instance로 저장한다
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
