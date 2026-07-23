## ADDED Requirements

### Requirement: Federation request routing

웹 애플리케이션은 canonical 웹 origin에서 federation 요청을 일반 BFF 요청보다 먼저 처리하고, 처리되지 않은 요청은 기존 BFF 동작으로 이어야 한다(MUST).

#### Scenario: Handle federation request before BFF routes

- **WHEN** 외부 서버가 웹 origin으로 ActivityPub 또는 WebFinger 요청을 보낸다
- **THEN** 시스템은 해당 요청을 일반 BFF route보다 먼저 federation protocol 처리 경계로 전달한다
- **AND** federation 요청 판별, WebFinger parsing과 HTTP 응답 조립은 federation protocol library에 위임한다

#### Scenario: Preserve existing web requests

- **WHEN** 요청이 ActivityPub 또는 WebFinger discovery 요청이 아니다
- **THEN** 시스템은 요청을 기존 Hono BFF 처리로 이어간다
- **AND** `/health`, `/graphql`, `/login`, `/@{handle}`와 SPA route 동작을 유지한다

#### Scenario: Do not fall through handled federation requests

- **WHEN** federation protocol 경계가 ActivityPub 또는 WebFinger 요청을 처리한다
- **THEN** 시스템은 해당 요청을 `/graphql` proxy, API 서버 또는 SPA fallback으로 전달하지 않는다

### Requirement: Local actor WebFinger discovery

시스템은 local active profile을 `acct:{handle}@{localDomain}` WebFinger resource로 발견할 수 있게 해야 한다(MUST).

#### Scenario: Discover local active profile

- **WHEN** 외부 서버가 `GET /.well-known/webfinger?resource=acct:{handle}@{localDomain}`를 요청한다
- **THEN** 시스템은 configured local instance에 속하고 정규화 handle이 일치하는 `ACTIVE` profile을 찾는다
- **AND** 시스템은 HTTP 200과 `application/jrd+json` content type으로 응답한다
- **AND** WebFinger JRD의 `subject`는 canonical `acct:{handle}@{localDomain}`이다
- **AND** `rel = self` link는 `application/activity+json` type과 `{localOrigin}/ap/actor/{profile.id}` href를 포함한다
- **AND** profile-page link는 기존 웹 프로필 URL `{localOrigin}/@{handle}`을 가리킨다

#### Scenario: Missing or malformed WebFinger resource

- **WHEN** WebFinger `resource` parameter가 없거나 URL로 해석할 수 없다
- **THEN** 시스템은 HTTP 400으로 응답한다

#### Scenario: Discover local active profile by canonical actor URI

- **WHEN** 외부 서버가 canonical `{localOrigin}/ap/actor/{profile.id}` URI를 WebFinger resource로 요청한다
- **THEN** 시스템은 해당 local active profile의 WebFinger JRD를 HTTP 200으로 반환한다
- **AND** WebFinger JRD의 `subject`는 요청한 canonical actor URI이다

#### Scenario: Unknown or non-local WebFinger resource

- **WHEN** WebFinger resource의 domain이 configured local instance domain과 다르거나 resource가 local actor를 식별하지 않는다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Missing local profile WebFinger

- **WHEN** WebFinger resource의 handle과 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

### Requirement: Local actor document

시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환하고, 지원되는 ActivityPub inbox delivery는 federation inbox 처리 경계로 연결해야 한다(MUST).

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `GET /ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** 시스템은 HTTP 200과 `application/activity+json` content type으로 응답한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `endpoints`, `publicKey`, `assertionMethod`를 포함한다
- **AND** `id`는 canonical local actor URI `{localOrigin}/ap/actor/{profile.id}`와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `url`은 기존 웹 프로필 URL `{localOrigin}/@{handle}`이다
- **AND** `inbox`는 actor URI에 `/inbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `outbox`는 actor URI에 `/outbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `endpoints.sharedInbox`는 shared inbox URI `{localOrigin}/inbox`이다
- **AND** document는 `followers`, `following`을 포함하지 않는다

#### Scenario: Missing local actor document

- **WHEN** actor URI의 UUID와 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Delegate supported inbox delivery

- **WHEN** 외부 서버가 actor-scoped `/ap/actor/{profile.id}/inbox` 또는 shared `/inbox`로 ActivityPub activity를 전달한다
- **THEN** 시스템은 해당 요청을 federation inbox 처리 경계로 전달한다
- **AND** 검증된 typed activity와 등록된 activity capability handler가 있으면 시스템은 그 handler로 위임한다
- **AND** activity의 검증, 저장과 side effect는 해당 activity capability가 정의하며 local actor discovery는 이를 직접 정의하지 않는다
- **AND** 시스템은 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

### Requirement: Local actor key dispatch

시스템은 local actor document에 포함할 RSA-PKCS#1-v1.5와 Ed25519 공개 key를 profile별로 제공해야 한다(MUST).

#### Scenario: Lazily create missing local actor keys

- **WHEN** local active profile의 actor key가 필요하지만 저장된 key pair가 없다
- **THEN** 시스템은 해당 profile의 ActivityPub actor metadata row를 보장한다
- **AND** 시스템은 해당 ActivityPub actor에 대한 RSA-PKCS#1-v1.5 key pair와 Ed25519 key pair를 생성해 저장한다
- **AND** 같은 ActivityPub actor와 key kind에 대해 중복 key row를 만들지 않는다

#### Scenario: Reuse existing local actor keys

- **WHEN** local active profile의 actor key pair가 이미 저장되어 있다
- **THEN** 시스템은 새 key pair를 생성하지 않고 기존 key pair에서 public key를 dispatch한다

#### Scenario: Expose actor keys in actor document

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** RSA-PKCS#1-v1.5 public key는 `publicKey`로 노출된다
- **AND** Ed25519 public key는 `assertionMethod`로 노출된다
- **AND** 공개 key는 해당 actor가 소유하거나 제어하는 key로 표현된다
- **AND** key 식별자와 JSON-LD 직렬화 형식은 federation protocol library가 생성한다

### Requirement: ActivityPub discovery scope boundary

local actor discovery 경계는 actor document와 federation inbox transport만 열고, activity별 행동은 해당 capability에 위임하며 outbox submission/collection은 별도 capability가 열기 전까지 제공하지 않아야 한다(MUST).

#### Scenario: Inbox activity behavior is owned by activity capabilities

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 ActivityPub activity를 보낸다
- **THEN** local actor discovery는 그 activity의 검증, 저장 또는 side effect를 정의하지 않는다
- **AND** 등록된 capability handler가 있으면 해당 capability 계약에 따라 처리한다
- **AND** 등록된 handler가 없으면 activity-specific side effect를 만들지 않는다

#### Scenario: Remote actor fetch is delegated to remote profile federation

- **WHEN** 시스템이 remote actor fetch, cache TTL, retry, signature verification 동작을 필요로 한다
- **THEN** 해당 동작은 `activitypub-remote-profile-federation` 또는 federation protocol boundary가 정의한 경계를 따른다
- **AND** local actor discovery endpoint는 remote actor materialization을 직접 수행하지 않는다

#### Scenario: Outbox and social graph collections remain out of scope

- **WHEN** 외부 서버가 outbox submission/collection 또는 followers/following collection 동작을 요청한다
- **THEN** 시스템은 이번 capability에서 해당 동작이나 activity-specific side effect를 제공하지 않는다
