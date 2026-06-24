## ADDED Requirements

### Requirement: Fedify SvelteKit integration

웹 애플리케이션은 canonical 웹 origin에서 ActivityPub discovery 요청을 받을 수 있도록 `packages/fedify`가 제공하는 framework-neutral Fedify federation instance/request handler 구성요소를 `@fedify/sveltekit` hook adapter로 SvelteKit hook에 연결해야 한다(MUST).

#### Scenario: Handle federation request in web hook

- **WHEN** 외부 서버가 웹 origin으로 ActivityPub 또는 WebFinger 요청을 보낸다
- **THEN** `apps/web` SvelteKit hook은 요청을 `packages/fedify`가 제공하는 Fedify handler로 위임한다
- **AND** federation 요청 판별, WebFinger parsing, actor document assembly, key dispatch, HTTP 응답 조립은 `packages/fedify`에서 제공한다

#### Scenario: Preserve existing web requests

- **WHEN** 요청이 ActivityPub 또는 WebFinger discovery 요청이 아니다
- **THEN** 시스템은 기존 SvelteKit 라우트와 `/graphql` proxy 동작을 유지한다
- **AND** `/health`, `/graphql`, `/login`, `/@{handle}` 요청은 ActivityPub handler로 가로채지 않는다

### Requirement: Local actor WebFinger discovery

시스템은 local active profile을 `acct:{handle}@{localInstanceHost}` WebFinger resource로 발견할 수 있게 해야 한다(MUST).

#### Scenario: Discover local active profile

- **WHEN** 외부 서버가 `GET /.well-known/webfinger?resource=acct:{handle}@{localInstanceHost}`를 요청한다
- **THEN** 시스템은 configured local instance에 속하고 정규화 handle이 일치하는 `ACTIVE` profile을 찾는다
- **AND** 시스템은 HTTP 200과 `application/jrd+json` content type으로 응답한다
- **AND** WebFinger JRD의 `subject`는 canonical `acct:{handle}@{localInstanceHost}`이다
- **AND** `rel = self` link는 `application/activity+json` type과 `{localOrigin}/ap/actor/{profile.id}` href를 포함한다
- **AND** profile-page link는 기존 웹 프로필 URL `{localOrigin}/@{handle}`을 가리킨다

#### Scenario: Invalid WebFinger resource

- **WHEN** WebFinger resource가 없거나 `acct:{handle}@{localInstanceHost}` 형식이 아니거나 host가 configured local instance host와 다르다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Missing local profile WebFinger

- **WHEN** WebFinger resource의 handle과 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

### Requirement: Local actor document

시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환해야 한다(MUST).

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `GET /ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** 시스템은 HTTP 200과 `application/activity+json` content type으로 응답한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`, `publicKey`, `assertionMethods`를 포함한다
- **AND** `id`는 canonical local actor URI `{localOrigin}/ap/actor/{profile.id}`와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `url`은 기존 웹 프로필 URL `{localOrigin}/@{handle}`이다
- **AND** `inbox`는 actor URI에 `/inbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `outbox`는 actor URI에 `/outbox` path suffix를 붙인 actor-scoped URI이다

#### Scenario: Missing local actor document

- **WHEN** actor URI의 UUID와 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Advertise only required ActivityPub endpoints

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** document는 ActivityPub actor 필수 속성인 `inbox`, `outbox` 값을 포함한다
- **AND** document는 `followers`, `following`, `endpoints.sharedInbox` 값을 포함하지 않는다

#### Scenario: Unsupported ActivityPub endpoint request

- **WHEN** 외부 서버가 `/ap/actor/{profile.id}/inbox`, `/ap/actor/{profile.id}/outbox`, `/ap/actor/{profile.id}/followers`, `/ap/actor/{profile.id}/following`, `/inbox`, `/outbox` 같은 미지원 federation endpoint를 직접 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

### Requirement: Local actor key dispatch

시스템은 local actor document에 포함할 RSA-PKCS#1-v1.5와 Ed25519 공개 key를 profile별로 제공해야 한다(MUST).

#### Scenario: Lazily create missing local actor keys

- **WHEN** local active profile의 actor key가 필요하지만 저장된 key pair가 없다
- **THEN** 시스템은 해당 profile의 ActivityPub actor metadata row를 보장한다
- **AND** 시스템은 해당 ActivityPub actor에 대한 RSA-PKCS#1-v1.5 key pair와 Ed25519 key pair를 생성해 저장한다
- **AND** 같은 ActivityPub actor와 key type에 대해 중복 key row를 만들지 않는다

#### Scenario: Reuse existing local actor keys

- **WHEN** local active profile의 actor key pair가 이미 저장되어 있다
- **THEN** 시스템은 새 key pair를 생성하지 않고 기존 key pair에서 public key를 dispatch한다

#### Scenario: Expose actor keys in actor document

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** RSA-PKCS#1-v1.5 public key는 `publicKey`로 노출된다
- **AND** Ed25519 public key는 `assertionMethods`로 노출된다

### Requirement: ActivityPub discovery scope boundary

이번 discovery 범위는 local actor 발견과 actor document 읽기로 제한되어야 한다(MUST).

#### Scenario: Remote follow is out of scope

- **WHEN** 원격 서버가 follow, accept, undo, delivery 같은 ActivityPub 상호작용을 기대한다
- **THEN** 시스템은 이번 capability에서 해당 동작을 제공하지 않는다

#### Scenario: Inbox and outbox behavior is out of scope

- **WHEN** 외부 서버가 actor document에 광고된 `inbox` 또는 `outbox` URI에 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 시스템은 이번 capability에서 inbox delivery, outbox submission, outbox collection 읽기 동작을 제공하지 않는다

#### Scenario: Remote actor fetch is out of scope

- **WHEN** 시스템이 remote instance와 remote profile 저장 경계를 가진다
- **THEN** 시스템은 이번 capability에서 remote actor fetch, cache TTL, retry, signature verification 동작을 정의하지 않는다

#### Scenario: ActivityPub collections are out of scope

- **WHEN** 외부 서버가 followers 또는 following collection을 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 시스템은 이번 capability에서 collection endpoint 동작을 제공하지 않는다
