## ADDED Requirements

### Requirement: Instance storage

시스템은 local 및 ActivityPub federation instance를 `instance` 행으로 저장해야 한다(MUST).

#### Scenario: Store local instance

- **WHEN** local instance가 초기화된다
- **THEN** 시스템은 정규화 domain, instance kind, 생성 시각, 수정 시각을 저장한다
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
- **THEN** 시스템은 ActivityPub instance의 정규화 domain, `ACTIVITYPUB` instance kind, 생성 시각, 수정 시각을 저장한다
- **AND** ActivityPub instance의 canonical origin은 선택적으로 저장할 수 있다
- **AND** ActivityPub actor fetch/cache 동작은 이 저장 요구사항에 포함되지 않는다

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
- **THEN** 시스템은 ActivityPub actor, key kind, public key JWK, private key JWK, 생성 시각을 저장한다
- **AND** key kind는 RSA-PKCS#1-v1.5와 Ed25519를 구분한다
- **AND** 같은 ActivityPub actor와 key kind의 key row는 중복될 수 없다

#### Scenario: Store remote actor shell

- **WHEN** 시스템이 remote profile의 ActivityPub actor 저장 경계를 마련한다
- **THEN** 시스템은 remote profile, actor URI, actor type을 ActivityPub actor metadata로 저장한다
- **AND** remote actor의 public key metadata가 주어지는 경우 private key 없이 actor key 저장 경계에 둘 수 있어야 한다
- **AND** actor URI는 중복될 수 없다
- **AND** remote profile은 remote ActivityPub actor metadata row를 최대 1개만 가질 수 있다
- **AND** remote actor fetch/cache, key refresh, signature verification 동작은 이번 요구사항에 포함되지 않는다
