## ADDED Requirements

### Requirement: Fedify SvelteKit integration

웹 애플리케이션은 canonical 웹 origin에서 ActivityPub discovery 요청을 처리하기 위해 Fedify federation instance를 SvelteKit hook에 연결해야 한다(MUST).

#### Scenario: Handle federation request in web hook

- **WHEN** 외부 서버가 웹 origin으로 ActivityPub 또는 WebFinger 요청을 보낸다
- **THEN** 시스템은 `apps/web` SvelteKit hook에서 Fedify federation instance로 해당 요청을 처리한다
- **AND** federation 도메인 로직은 `packages/fedify`에서 제공한다

#### Scenario: Preserve existing web requests

- **WHEN** 요청이 ActivityPub 또는 WebFinger discovery 요청이 아니다
- **THEN** 시스템은 기존 SvelteKit 라우트와 `/graphql` proxy 동작을 유지한다

### Requirement: Local actor WebFinger discovery

시스템은 local active profile을 `acct:{handle}@{localDomain}` WebFinger resource로 발견할 수 있게 해야 한다(MUST).

#### Scenario: Discover local active profile

- **WHEN** 외부 서버가 local instance domain에 `acct:{handle}@{localDomain}` WebFinger resource를 조회한다
- **THEN** 시스템은 local instance에 속하고 정규화 handle이 일치하는 `ACTIVE` profile을 찾는다
- **AND** WebFinger JRD의 `self` link는 `application/activity+json` type과 `https://{localOrigin}/ap/actor/{profile.id}` href를 포함한다
- **AND** profile-page link는 기존 웹 프로필 URL `https://{localOrigin}/@{handle}`을 가리킨다

#### Scenario: Missing local profile WebFinger

- **WHEN** WebFinger resource의 handle과 일치하는 local active profile이 없다
- **THEN** 시스템은 actor를 발견할 수 없음으로 응답한다

#### Scenario: Ignore remote profile WebFinger on local domain

- **WHEN** 저장된 remote profile의 handle이 local domain WebFinger resource와 일치한다
- **THEN** 시스템은 remote profile을 local WebFinger 결과로 반환하지 않는다

### Requirement: Local actor document

시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환해야 한다(MUST).

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `https://{localOrigin}/ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `summary`, `url`, `published`, `publicKey`, `assertionMethods`를 포함한다
- **AND** `id`는 요청된 actor URI와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `url`은 기존 웹 프로필 URL `https://{localOrigin}/@{handle}`이다

#### Scenario: Missing local actor document

- **WHEN** actor URI의 UUID와 일치하는 local active profile이 없다
- **THEN** 시스템은 actor document를 반환하지 않는다

#### Scenario: Do not advertise unsupported ActivityPub endpoints

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** document는 `inbox`, `outbox`, `followers`, `following`, `endpoints.sharedInbox` 값을 포함하지 않는다

### Requirement: Local actor key dispatch

시스템은 local actor document에 포함할 RSA-PKCS#1-v1.5와 Ed25519 공개 key를 profile별로 제공해야 한다(MUST).

#### Scenario: Lazily create missing local actor keys

- **WHEN** local active profile의 actor key가 필요하지만 저장된 key pair가 없다
- **THEN** 시스템은 해당 profile에 대한 RSA-PKCS#1-v1.5 key pair와 Ed25519 key pair를 생성해 저장한다
- **AND** 같은 profile과 key type에 대해 중복 key row를 만들지 않는다

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

#### Scenario: Remote actor fetch is out of scope

- **WHEN** 시스템이 remote instance와 remote profile 저장 경계를 가진다
- **THEN** 시스템은 이번 capability에서 remote actor fetch, cache TTL, retry, signature verification 동작을 정의하지 않는다

#### Scenario: ActivityPub collections are out of scope

- **WHEN** 외부 서버가 followers 또는 following collection을 요청한다
- **THEN** 시스템은 이번 capability에서 collection endpoint 동작을 제공하지 않는다
