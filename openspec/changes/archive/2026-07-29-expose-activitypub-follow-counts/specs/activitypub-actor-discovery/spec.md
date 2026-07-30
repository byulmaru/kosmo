## MODIFIED Requirements

### Requirement: Local actor document

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-560; Local actor document를 MUST 제공한다.
시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환하고, 지원되는
ActivityPub inbox delivery는 federation inbox 처리 경계로 연결하는 것을 MUST 보장한다.

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `GET /ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** 시스템은 HTTP 200과 `application/activity+json` content type으로 응답한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`,
  `followers`, `following`, `endpoints`, `publicKey`, `assertionMethod`를 포함한다
- **AND** `id`는 canonical local actor URI `{localOrigin}/ap/actor/{profile.id}`와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `url`은 기존 웹 프로필 URL `{localOrigin}/@{handle}`이다
- **AND** `inbox`는 actor URI에 `/inbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `outbox`는 actor URI에 `/outbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `followers`는 actor URI에 `/followers` path suffix를 붙인 URI이다
- **AND** `following`은 actor URI에 `/following` path suffix를 붙인 URI이다
- **AND** `endpoints.sharedInbox`는 shared inbox URI `{localOrigin}/inbox`이다

#### Scenario: Missing local actor document

- **WHEN** actor URI의 UUID와 일치하는 local active profile이 없다
- **THEN** 시스템은 HTTP 404로 응답한다

#### Scenario: Delegate supported inbox delivery

- **WHEN** 외부 서버가 actor-scoped `/ap/actor/{profile.id}/inbox` 또는 shared `/inbox`로 ActivityPub activity를
  전달한다
- **THEN** 시스템은 해당 요청을 federation inbox 처리 경계로 전달한다
- **AND** 검증된 typed activity와 등록된 activity capability handler가 있으면 시스템은 그 handler로 위임한다
- **AND** activity의 검증, 저장과 side effect는 해당 activity capability가 정의하며 local actor discovery는
  이를 직접 정의하지 않는다
- **AND** 시스템은 해당 요청을 `/graphql` proxy 또는 API 서버로 전달하지 않는다

### Requirement: ActivityPub discovery scope boundary

**Authority / Provenance:** `docs/domain/objects/profile.md`, PROD-560; count-only social graph 공개 경계를 MUST 지킨다.
local actor discovery 경계는 actor document, count-only followers/following collection과 federation inbox
transport만 열고, activity별 행동은 해당 capability에 위임하며 outbox submission/collection과 social graph
membership은 별도 capability가 열기 전까지 제공하지 않는 것을 MUST 보장한다.

#### Scenario: Inbox activity behavior is owned by activity capabilities

- **WHEN** 원격 서버가 actor-scoped inbox 또는 shared inbox로 ActivityPub activity를 보낸다
- **THEN** local actor discovery는 그 activity의 검증, 저장 또는 side effect를 정의하지 않는다
- **AND** 등록된 capability handler가 있으면 해당 capability 계약에 따라 처리한다
- **AND** 등록된 handler가 없으면 activity-specific side effect를 만들지 않는다

#### Scenario: Remote actor fetch is delegated to remote profile federation

- **WHEN** 시스템이 remote actor fetch, cache TTL, retry, signature verification 동작을 필요로 한다
- **THEN** 해당 동작은 `activitypub-remote-profile-federation` 또는 federation protocol boundary가 정의한 경계를
  따른다
- **AND** local actor discovery endpoint는 remote actor materialization을 직접 수행하지 않는다

#### Scenario: Expose followers count without membership

- **WHEN** 외부 서버가 local active profile의 advertised followers collection을 요청한다
- **THEN** 시스템은 canonical collection URI와 저장된 `followersCount`를 `totalItems`로 제공한다
- **AND** collection은 membership item과 pagination reference를 제공하지 않는다
- **AND** 시스템은 요청 중 `ProfileFollow` aggregate query를 수행하지 않는다

#### Scenario: Expose following count without membership

- **WHEN** 외부 서버가 local active profile의 advertised following collection을 요청한다
- **THEN** 시스템은 canonical collection URI와 저장된 `followingCount`를 `totalItems`로 제공한다
- **AND** collection은 membership item과 pagination reference를 제공하지 않는다
- **AND** 시스템은 요청 중 `ProfileFollow` aggregate query를 수행하지 않는다

#### Scenario: Reject unavailable social graph collections

- **WHEN** 외부 서버가 unknown, non-local, inactive 또는 suspended Profile 식별자의 followers/following
  collection을 요청한다
- **THEN** 시스템은 해당 collection을 제공하지 않는다

#### Scenario: Outbox and social graph membership remain out of scope

- **WHEN** 외부 서버가 outbox submission/collection 또는 followers/following membership 동작을 요청한다
- **THEN** 시스템은 이번 capability에서 해당 동작이나 activity-specific side effect를 제공하지 않는다
