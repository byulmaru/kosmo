## MODIFIED Requirements

### Requirement: Local actor document

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/media.md`, `docs/domain/decisions/0018-media-upload-lifecycle-without-file.md`, `PROD-560`, `PROD-628`; Local actor document를 MUST 제공한다.
시스템은 local active profile의 actor URI에서 read-only ActivityPub `Person` document를 반환하고, 현재 확정된
Profile 표현 속성과 Follow Approval Policy를 완전하게 투영하며, 지원되는 ActivityPub inbox delivery를
federation inbox 처리 경계로 연결하는 것을 MUST 보장한다.

#### Scenario: Read local actor document

- **WHEN** 외부 서버가 `GET /ap/actor/{profile.id}`를 ActivityPub JSON으로 요청한다
- **THEN** 시스템은 해당 ID의 local active profile을 조회한다
- **AND** 시스템은 HTTP 200과 `application/activity+json` content type으로 응답한다
- **AND** `Person` document는 `id`, `preferredUsername`, `name`, `url`, `published`, `inbox`, `outbox`,
  `followers`, `following`, `endpoints`, `publicKey`, `assertionMethod`, `manuallyApprovesFollowers`를 포함한다
- **AND** `id`는 canonical local actor URI `{localOrigin}/ap/actor/{profile.id}`와 같다
- **AND** `preferredUsername`은 local profile handle이다
- **AND** `name`은 local profile의 최신 displayName이다
- **AND** local profile에 bio가 있으면 `summary`는 해당 평문 bio이고, 없으면 `summary`를 제공하지 않는다
- **AND** `url`은 기존 웹 프로필 URL `{localOrigin}/@{handle}`이다
- **AND** `inbox`는 actor URI에 `/inbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `outbox`는 actor URI에 `/outbox` path suffix를 붙인 actor-scoped URI이다
- **AND** `followers`는 actor URI에 `/followers` path suffix를 붙인 URI이다
- **AND** `following`은 actor URI에 `/following` path suffix를 붙인 URI이다
- **AND** `endpoints.sharedInbox`는 shared inbox URI `{localOrigin}/inbox`이다
- **AND** Follow Approval Policy가 `APPROVAL_REQUIRED`이면 `manuallyApprovesFollowers`는 `true`이고,
  `OPEN`이면 `false`이다

#### Scenario: Expose local profile avatar and header

- **WHEN** local active profile에 Source가 Local이고 State가 Ready이며 공개 URL과 Media Type이 저장된 avatar
  또는 header Media가 연결되어 있다
- **THEN** 시스템은 avatar를 `icon`, header를 `image` ActivityPub 이미지로 제공한다
- **AND** 각 이미지의 `url`과 `mediaType`은 연결된 Media에 저장된 공개 URL과 Media Type이다
- **AND** 시스템은 저장된 공개 표현을 요청 중 다시 조립하거나 byte와 Media Type을 재검증하지 않는다

#### Scenario: Omit unavailable optional profile representation

- **WHEN** local active profile에 bio, 유효한 Ready Local avatar 또는 유효한 Ready Local header가 없다
- **THEN** 시스템은 존재하지 않는 선택적 값을 위한 `summary`, `icon` 또는 `image`를 제공하지 않는다
- **AND** 이전 관계, placeholder 또는 깨진 URL을 actor document에 남기지 않는다

#### Scenario: Preserve canonical actor identity and security metadata

- **WHEN** local profile의 displayName, bio, avatar, header 또는 Follow Approval Policy가 바뀐 뒤 actor document를
  다시 요청한다
- **THEN** 시스템은 최신 Profile 표현을 반환한다
- **AND** 기존 actor `id`, Web `url`, inbox/outbox, followers/following, shared inbox와 공개 key identity는
  변경하지 않는다

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
