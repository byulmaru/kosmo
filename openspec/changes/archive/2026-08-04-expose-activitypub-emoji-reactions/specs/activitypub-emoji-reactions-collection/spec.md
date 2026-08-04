## ADDED Requirements

### Requirement: Local Note가 emojiReactions collection을 광고한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-500`, FEP-c0e0 (`http://fedibird.com/ns#emojiReactions`) 시스템은 Content가 있고 조회 가능한 Local Note에 FEP-c0e0 `http://fedibird.com/ns#emojiReactions` property를 제공해야 하며(MUST), property 값은 해당 Post UUID를 사용한 `/ap/note/{postId}/emoji-reactions` collection URI여야
한다(MUST). Collection URI는 Note가 사용하는 Author Profile의 Local Instance canonical origin과 같은 identity
경계를 사용해야 한다(MUST).

#### Scenario: 조회 가능한 Local Note의 collection 광고

- **WHEN** Content가 있고 Post Visibility와 Post Eligibility를 통과한 Local Post의 Note를 직렬화한다
- **THEN** Note는 `http://fedibird.com/ns#emojiReactions` property를 가진다
- **AND** property 값은 Author Profile의 Local Instance canonical origin과 `/ap/note/{postId}/emoji-reactions`
  경로로 구성된 절대 URI다

#### Scenario: 제공하지 않는 Note에는 collection을 광고하지 않는다

- **WHEN** Post가 Tombstone이거나 Content가 없거나 Author/Profile/Instance availability 또는 viewer 접근 조건을
  통과하지 못한다
- **THEN** 시스템은 Note와 `emojiReactions` collection property를 제공하지 않는다

### Requirement: ActivityStreams Collection과 안정적인 keyset page를 제공한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `PROD-500`, FEP-c0e0 시스템은 광고된 URI를 역참조 가능한 ActivityStreams `Collection`으로 응답해야 하며(MUST), collection에 현재
노출 가능한 전체 item 수를 나타내는 `totalItems`를 제공해야 한다(MUST). Page는 최대 50개 item을 포함해야 하며
(MUST), `createdAt DESC`를 우선하고 같은 시각에는 Reaction UUID `DESC`를 적용하는 opaque keyset cursor를
사용해야 한다(MUST). Cursor는 page 사이의 경계를 안정적으로 이어야 하며(MUST), 잘못된 cursor는 collection page로
응답해서는 안 된다(MUST NOT).

#### Scenario: 빈 collection을 반환한다

- **WHEN** Note 접근 조건은 통과하지만 노출 가능한 Reaction이 없다
- **THEN** 시스템은 `Collection`과 `totalItems: 0`을 반환한다
- **AND** item이 없는 첫 page를 반환한다

#### Scenario: 50개 단위로 다음 page를 연결한다

- **WHEN** 노출 가능한 Reaction이 51개 이상이고 첫 page를 요청한다
- **THEN** 첫 page는 최대 50개 item과 다음 page를 가리키는 opaque cursor를 반환한다
- **AND** 다음 page는 첫 page의 마지막 `(createdAt, Reaction UUID)` 경계보다 오래된 item만 반환한다
- **AND** 두 page의 연결은 동일한 collection 정렬 비교기와 cursor 경계를 사용한다

#### Scenario: 동일 시각의 Reaction을 UUID로 정렬한다

- **WHEN** 둘 이상의 Reaction이 같은 `createdAt`을 가진다
- **THEN** 시스템은 Reaction UUID `DESC`를 tie-breaker로 사용한다
- **AND** cursor는 `(createdAt, Reaction UUID)` 경계를 보존해 중복 또는 누락 없이 다음 page를 계산한다

#### Scenario: 잘못된 cursor를 page로 처리하지 않는다

- **WHEN** cursor가 opaque 형식이 아니거나 현재 collection 경계로 해석되지 않는다
- **THEN** 시스템은 해당 값을 정상 page cursor로 사용하지 않는다
- **AND** collection page item을 반환하지 않는다

### Requirement: 현재 표현 가능한 Local·Remote Reaction만 item으로 투영한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `PROD-500`, `PROD-498`, `PROD-499` 시스템은 대상 Local Note에 현재 존재하는 Reaction 중 ActivityPub identity로 표현 가능한 Local Profile과 Remote Profile의 Reaction을 모두 collection item으로 투영해야 한다(MUST). 삭제되어 현재 존재하지 않는 Reaction,
actor/activity identity를 표현할 수 없는 Reaction 또는 대상 Post가 unavailable이면 item을 노출해서는 안 된다(MUST
NOT). Remote Profile이나 Remote Note를 collection을 채우기 위해 새로 fetch, backfill 또는 materialize해서는 안
된다(MUST NOT).

#### Scenario: Local Reaction을 포함한다

- **WHEN** 대상 Local Note에 actor와 activity identity를 파생할 수 있는 현재 Local Profile Reaction이 존재한다
- **THEN** 시스템은 해당 Reaction을 collection item으로 포함한다

#### Scenario: 저장된 Remote Reaction을 포함한다

- **WHEN** 대상 Local Note에 저장된 ActivityPub actor/activity identity를 가진 현재 Remote Profile Reaction이
  존재한다
- **THEN** 시스템은 해당 Reaction을 collection item으로 포함한다
- **AND** 저장된 identity를 사용하며 새 Remote Profile/Note fetch를 수행하지 않는다

#### Scenario: 삭제 또는 identity 불가 Reaction을 숨긴다

- **WHEN** Reaction이 삭제되었거나 actor/activity identity를 표현할 수 없다
- **THEN** 시스템은 해당 Reaction을 collection item으로 반환하지 않는다

#### Scenario: unavailable Post의 Reaction을 숨긴다

- **WHEN** 대상 Post가 Tombstone이거나 Content가 없거나 Post Eligibility 또는 viewer 조회 조건을 통과하지 못한다
- **THEN** 시스템은 해당 Post의 collection과 item을 반환하지 않는다

### Requirement: Reaction item type, content와 object를 canonical identity로 투영한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `PROD-500`, `PROD-498`, `PROD-499`, FEP-c0e0 시스템은 `❤️` Reaction을 정확한 `content: "❤️"`를 가진 `Like` item으로 투영해야 하며(MUST), 나머지 허용 Reaction Type(`🥹`, `🎉`, `👀`, `☘️`, `🌈`)을 정확한 Type을 `content`에 가진 `EmojiReact` item으로 투영해야
한다(MUST). 모든 item의 `object`는 대상 Local Note URI여야 한다(MUST). Like는 별도 domain 객체가 아니라
`❤️` Reaction의 호환 표현이어야 한다(MUST).

#### Scenario: Heart Reaction을 Like로 투영한다

- **WHEN** collection에 `❤️` Reaction이 포함된다
- **THEN** item type은 `Like`이고 content는 정확히 `"❤️"`다
- **AND** item object는 대상 Local Note URI다

#### Scenario: 나머지 허용 Reaction을 EmojiReact로 투영한다

- **WHEN** collection에 `🥹`, `🎉`, `👀`, `☘️` 또는 `🌈` Reaction이 포함된다
- **THEN** item type은 `EmojiReact`이고 content는 저장된 Reaction Type과 정확히 같다
- **AND** item object는 대상 Local Note URI다

#### Scenario: 지원하지 않는 Reaction 표현을 추가하지 않는다

- **WHEN** Reaction이 허용 목록 밖 Unicode, custom emoji, legacy `EmojiReaction` 또는 Misskey extension으로만
  표현된다
- **THEN** 시스템은 해당 값을 새 collection item type이나 content로 추가하지 않는다

### Requirement: Local·Remote Reaction item identity를 각각 재사용한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-500`, `PROD-498`, `PROD-499` Local Reaction item의 `actor` URI와 `/ap/reaction/{reactionId}` activity URI는 Reaction Profile이 속한 LOCAL Instance의 canonical origin에서 파생해야 한다(MUST). Remote Reaction item은 PROD-498 inbound mapping이 저장한
ActivityPub actor URI와 activity URI를 그대로 재사용해야 한다(MUST). Local·Remote item 모두 object에는 대상 Local
Note URI를 사용해야 한다(MUST).

#### Scenario: Local Reaction identity를 Author Instance가 아닌 Reaction Profile Instance에서 파생한다

- **WHEN** Reaction Profile이 현재 deployment의 configured instance와 다른 Active LOCAL Instance에 속한다
- **THEN** item actor URI와 `/ap/reaction/{reactionId}` URI는 Reaction Profile의 LOCAL Instance canonical origin을
  사용한다
- **AND** configured instance와 다르다는 이유로 item을 생략하지 않는다

#### Scenario: Remote Reaction의 저장 identity를 재사용한다

- **WHEN** Remote Reaction에 inbound mapping으로 저장된 actor URI와 activity URI가 있다
- **THEN** collection item은 두 URI를 그대로 사용한다
- **AND** Reaction UUID에서 새 local activity URI를 만들지 않는다

### Requirement: collection 접근은 Local Note 조회 조건을 그대로 적용한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, `PROD-500` 시스템은 `emojiReactions` collection에 대상 Local Note와 동일한 Post Visibility, Post Eligibility, Author Profile/Instance availability 및 signed-fetch 조건을 적용해야 한다(MUST). Public과 Unlisted Note는 허용된 guest
조회 조건을 유지해야 하며(MUST), Followers Only Note는 Author 또는 established Follower의 signed fetch에서만
collection을 제공해야 한다(MUST). Mentioned Profiles처럼 현재 Local Note를 제공하지 않는 Visibility는 collection도
제공해서는 안 된다(MUST NOT). Collection endpoint가 존재한다는 사실만으로 Post 또는 Reaction 조회 범위를 넓혀서는
안 된다(MUST NOT).

#### Scenario: Public·Unlisted Note는 Note와 같은 guest 범위를 사용한다

- **WHEN** guest가 Public 또는 Unlisted Local Note와 그 `emojiReactions` URI를 요청한다
- **THEN** Note에 허용된 경우 collection을 반환한다
- **AND** Note 조회 정책을 통과하지 못한 Reaction/Post를 collection에 추가하지 않는다

#### Scenario: Followers Only Note는 서명된 Author/Follower만 조회한다

- **WHEN** 요청자가 Followers Only Note의 Author 또는 established Follower인 signed fetch requester다
- **THEN** 시스템은 Note와 같은 조건으로 collection을 반환한다

#### Scenario: 권한 없는 Followers Only 요청은 숨긴다

- **WHEN** 요청이 인증되지 않았거나 Author/Follower가 아닌 requester가 Followers Only collection URI를 요청한다
- **THEN** 시스템은 Note와 collection을 없는 것처럼 응답한다

#### Scenario: Mentioned Profiles Visibility는 collection을 제공하지 않는다

- **WHEN** 대상 Post Visibility가 Mentioned Profiles다
- **THEN** 시스템은 Local Note와 `emojiReactions` collection을 제공하지 않는다

### Requirement: collection capability 범위를 Reaction·Note 계약과 분리한다

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `PROD-500`, `PROD-498`, `PROD-499` 이 capability는 Local Note의 collection 광고·조회와 Reaction item projection만 소유해야 한다(MUST). 시스템은
기존 inbound Reaction materialization, local outbound Reaction delivery, GraphQL Reaction 조회, 앱 UI 또는 Reaction
저장 schema를 이 capability에서 재구현하거나 변경해서는 안 된다(MUST NOT). Remote Note collection fetch/backfill,
custom emoji, legacy `EmojiReaction`, Misskey `_misskey_reaction`, queue/outbox, durable retry와 별도 delivery
변경도 추가해서는 안 된다(MUST NOT).

#### Scenario: 기존 Reaction 송수신 lifecycle을 재사용한다

- **WHEN** collection item을 구성한다
- **THEN** 시스템은 기존 Reaction의 저장 row와 PROD-498/PROD-499 identity·type/content mapping을 사용한다
- **AND** inbound/outbound Reaction lifecycle을 새로 호출하거나 재구현하지 않는다

#### Scenario: GraphQL·UI·schema 범위를 변경하지 않는다

- **WHEN** 이 capability의 구현을 배포한다
- **THEN** GraphQL Reaction contract와 앱 UI 동작은 변경되지 않는다
- **AND** Reaction schema/migration, queue/outbox와 retry behavior는 추가되지 않는다
