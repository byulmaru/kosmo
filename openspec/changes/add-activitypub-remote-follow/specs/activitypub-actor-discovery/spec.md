## MODIFIED Requirements

### Requirement: Local actor document

시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환하고, 지원되는 ActivityPub inbox delivery는 Fedify inbox listener로 연결해야 한다(MUST).

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `GET /ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** 시스템은 HTTP 200과 `application/activity+json` content type으로 응답한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `endpoints`, `publicKey`, `assertionMethods`를 포함한다
- **AND** `id`는 canonical local actor URI `{localOrigin}/ap/actor/{profile.id}`와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `url`은 기존 웹 프로필 URL `{localOrigin}/@{handle}`이다
- **AND** `inbox`는 actor URI에 `/inbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `outbox`는 actor URI에 `/outbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `endpoints.sharedInbox`는 shared inbox URI `{localOrigin}/inbox`이다

#### Scenario: Missing local actor document

- **WHEN** actor URI의 UUID와 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Advertise inbox endpoints

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** document는 ActivityPub actor 필수 속성인 `inbox`, `outbox` 값을 포함한다
- **AND** document는 shared inbox discovery를 위한 `endpoints.sharedInbox` 값을 포함한다
- **AND** document는 `followers`, `following` 값을 포함하지 않는다

#### Scenario: Expose local actor key wire shape

- **WHEN** 시스템이 local actor document에 포함할 actor key를 필요로 한다
- **THEN** 시스템은 Fedify actor key-pairs dispatcher로 저장된 key pair를 제공한다
- **AND** missing key pair는 `activitypub-actor-discovery` 저장 계약에 따라 actor별 RSA-PKCS#1-v1.5와 Ed25519 row를 lazy-create하고, existing key row가 있으면 새 key pair를 생성하지 않는다
- **AND** RSA-PKCS#1-v1.5 public key는 `publicKey`의 Fedify `CryptographicKey`로 노출된다
- **AND** RSA `CryptographicKey.id`는 `{actorUri}#main-key`이고 `owner`는 `{actorUri}`이다
- **AND** Ed25519 public key는 `assertionMethods`의 Fedify `Multikey`로 노출된다
- **AND** Ed25519 `Multikey.id`는 `{actorUri}#ed25519-key`이고 `controller`는 `{actorUri}`이다
- **AND** 공개 key material은 저장된 `RSA_PKCS1_V1_5` 또는 `ED25519` public JWK에서 import한 `CryptoKey`를 사용한다
- **AND** 시스템은 PEM, Multibase, Multicodec, JSON-LD 직렬화를 직접 구현하지 않고 Fedify `CryptographicKey`/`Multikey` serialization에 맡긴다

#### Scenario: Delegate supported inbox delivery

- **WHEN** 외부 서버가 actor-scoped `/ap/actor/{profile.id}/inbox` 또는 shared `/inbox`로 ActivityPub activity를 전달한다
- **THEN** 시스템은 해당 요청을 unsupported endpoint 404로 종료하지 않고 Fedify inbox listener로 처리한다
- **AND** Fedify가 verified typed activity를 제공하고 해당 activity capability의 handler가 등록되어 있으면 시스템은 그 handler로 위임한다
- **AND** Follow, Undo(Follow), Accept(Follow), Reject(Follow)의 검증과 side effect는 `activitypub-remote-follow` capability를 따른다
- **AND** 다른 activity의 지원 여부와 side effect는 해당 activity capability가 정의하며 local actor discovery는 이를 직접 정의하지 않는다
- **AND** 시스템은 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

#### Scenario: Unsupported ActivityPub endpoint request

- **WHEN** 외부 서버가 `/ap/actor/{profile.id}/outbox`, `/ap/actor/{profile.id}/followers`, `/ap/actor/{profile.id}/following`, `/outbox` 같은 미지원 federation endpoint를 직접 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

### Requirement: ActivityPub discovery scope boundary

local actor discovery 경계는 actor document와 Fedify inbox transport만 열고, activity별 행동은 해당 capability에 위임하며 outbox submission/collection은 별도 capability가 열기 전까지 제공하지 않아야 한다(MUST).

#### Scenario: Follow protocol is handled by follow capability

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 `Follow`, `Undo(Follow)`, `Accept(Follow)`, 또는 `Reject(Follow)` activity를 보낸다
- **THEN** 시스템은 `activitypub-remote-follow` capability의 handler 계약을 따른다
- **AND** 다른 activity는 follow graph side effect를 만들지 않는다

#### Scenario: Other inbox activities are owned by their capabilities

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 follow protocol이 아닌 activity를 보낸다
- **THEN** local actor discovery는 그 activity의 검증, 저장 또는 side effect를 정의하지 않는다
- **AND** 등록된 별도 capability handler가 없으면 시스템은 activity-specific side effect 없이 처리한다

#### Scenario: Outbox behavior remains out of scope

- **WHEN** 외부 서버가 actor document에 광고된 `outbox` URI에 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 시스템은 이번 capability에서 outbox submission 또는 outbox collection 읽기 동작을 제공하지 않는다

#### Scenario: Remote actor fetch is delegated to remote profile federation

- **WHEN** 시스템이 remote actor fetch, cache TTL, retry, signature verification 동작을 필요로 한다
- **THEN** 해당 동작은 `activitypub-remote-profile-federation` 또는 Fedify protocol boundary가 정의한 경계를 따른다
- **AND** local actor discovery endpoint는 remote actor materialization을 직접 수행하지 않는다

#### Scenario: ActivityPub collections are out of scope

- **WHEN** 외부 서버가 followers 또는 following collection을 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 시스템은 이번 capability에서 collection endpoint 동작을 제공하지 않는다
