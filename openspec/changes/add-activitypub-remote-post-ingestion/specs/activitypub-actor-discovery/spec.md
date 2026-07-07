## MODIFIED Requirements

### Requirement: Local actor document

시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환하고, follow protocol과 remote Note ingestion에 필요한 inbox delivery는 Fedify inbox listener로 연결해야 한다(MUST).

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

#### Scenario: Advertise supported ActivityPub endpoints

- **WHEN** 시스템이 local actor document를 반환한다
- **THEN** document는 ActivityPub actor 필수 속성인 `inbox`, `outbox` 값을 포함한다
- **AND** document는 shared inbox discovery를 위한 `endpoints.sharedInbox` 값을 포함한다
- **AND** document는 `followers`, `following` 값을 포함하지 않는다

#### Scenario: Handle supported inbox delivery

- **WHEN** 외부 서버가 actor-scoped `/ap/actor/{profile.id}/inbox` 또는 shared `/inbox`로 ActivityPub follow protocol activity 또는 `Create(Note)` activity를 전달한다
- **THEN** 시스템은 해당 요청을 unsupported endpoint 404로 종료하지 않고 Fedify inbox listener로 처리한다
- **AND** Fedify가 verified typed `Follow`, `Undo(Follow)`, `Accept(Follow)`, 또는 `Reject(Follow)`를 제공하면 시스템은 `activitypub-remote-follow` handler로 위임한다
- **AND** Fedify가 verified typed `Create(Note)`를 제공하면 시스템은 `activitypub-remote-post-ingestion` materialization handler로 위임한다
- **AND** 시스템은 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

#### Scenario: Unsupported ActivityPub endpoint request

- **WHEN** 외부 서버가 `/ap/actor/{profile.id}/outbox`, `/ap/actor/{profile.id}/followers`, `/ap/actor/{profile.id}/following`, `/outbox` 같은 미지원 federation endpoint를 직접 요청한다
- **THEN** 시스템은 HTTP 404로 응답한다
- **AND** 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

### Requirement: ActivityPub discovery scope boundary

local actor discovery 경계는 actor document, follow protocol inbox delivery, remote Note inbox delivery만 열고, outbox submission/collection과 그 외 ActivityPub delivery는 별도 capability가 열기 전까지 제공하지 않아야 한다(MUST).

#### Scenario: Remote follow protocol is handled by follow capability

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 `Follow`, `Undo(Follow)`, `Accept(Follow)`, 또는 `Reject(Follow)` activity를 보낸다
- **THEN** 시스템은 discovery-only 404 경계 대신 `activitypub-remote-follow` capability의 Fedify inbox listener와 follow handler 계약을 따른다
- **AND** follow protocol activity가 아닌 inbox delivery는 이번 capability에서 follow graph side effect를 만들지 않는다

#### Scenario: Remote Note delivery is handled by post ingestion capability

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 `Create(Note)` activity를 보낸다
- **THEN** 시스템은 discovery-only 404 경계 대신 `activitypub-remote-post-ingestion` capability의 Fedify inbox listener와 post materialization handler 계약을 따른다
- **AND** public top-level Note로 materialize되지 않는 inbox delivery는 이번 capability에서 post side effect를 만들지 않는다

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
