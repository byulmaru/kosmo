## Why

Kosmo의 Local Note는 현재 Reaction을 저장하고 `Like`·`EmojiReact` activity로 표현하지만, 외부 ActivityPub
구현체가 그 Reaction 집합을 조회할 수 있는 FEP-c0e0 `emojiReactions` 링크가 없다. PROD-500은 기존 Local Note와
Reaction identity·권한 계약을 재사용해 현재 표현 가능한 local·remote Reaction을 조회 가능한 collection으로
노출한다.

## What Changes

- Local Note가 `http://fedibird.com/ns#emojiReactions` property로
  `/ap/note/{postId}/emoji-reactions` collection URI를 광고한다.
- ActivityStreams `Collection`과 `totalItems`, 50개 page, `createdAt DESC`와 Reaction UUID DESC를 결합한
  opaque keyset cursor를 제공한다.
- 이미 발급된 cursor의 경계 Reaction이 삭제되었거나 현재 ActivityPub item으로 표현할 수 없게 되면 그 cursor를
  현재 collection 경계로 해석하지 않고 invalid cursor처럼 거부한다.
- 현재 존재하고 ActivityPub identity로 표현 가능한 Local Profile·Remote Profile Reaction을 collection item으로
  투영한다. 각 item의 `object`는 대상 Local Note URI다.
- `❤️`는 정확한 `content: "❤️"`를 가진 `Like`, 나머지 허용 Type(`🥹`, `🎉`, `👀`, `☘️`, `🌈`)은 정확한
  `content`를 가진 `EmojiReact`로 표현한다.
- Local item은 Reaction Profile의 LOCAL Instance canonical origin에서 actor URI와
  `/ap/reaction/{reactionId}` activity URI를 파생하고, Remote item은 저장된 ActivityPub actor/activity URI를
  재사용한다.
- collection 접근은 Local Note와 동일한 Post Visibility, Post Eligibility, Author Profile/Instance availability
  및 Followers Only signed-fetch 조건을 적용하고, 삭제·identity 불가 Reaction과 Tombstone·Content 없음·unavailable·
  조회 불가 Post를 노출하지 않는다.
- Remote Note collection fetch/backfill, custom emoji, legacy `EmojiReaction`, Misskey `_misskey_reaction`, GraphQL
  Reaction 재구현, UI 변경, Reaction schema/DB migration과 outbound delivery·queue·retry 변경은 제외한다.

## Authority / Provenance

- Canonical: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: `PROD-500`
- Linear blockedBy: `PROD-498`, `PROD-499`
- Linear relatedTo: `PROD-390`, `PROD-494`, `PROD-647`

2026-08-04 현재 `PROD-500`은 In Progress·Low priority·estimate 3이며 comments는 없다. Issue body의 wire contract와
exclusions를 현재 authority로 사용하고, 위 blockedBy/relatedTo 관계의 선행 계약을 넘어서 새 범위를 추가하지 않는다.

## Capabilities

### New Capabilities

- `activitypub-emoji-reactions-collection`: Local Note의 FEP-c0e0 `emojiReactions` 광고, collection 조회,
  Reaction item identity/type projection과 접근·제외 조건

### Modified Capabilities

없음. 기존 inbound/outbound Reaction과 Local Note delivery capability의 요구사항을 변경하지 않고, 해당 계약을
새 collection capability에서 재사용한다.

## Impact

- `packages/fedify`: Local Note projection에 `emojiReactions` property를 연결하고 custom collection dispatcher를
  제공한다.
- ActivityPub HTTP 응답: Local Note의 advertised collection URI와 collection/page representation이 추가된다.
- 기존 Reaction 저장·inbound/outbound activity·GraphQL·UI 계약은 변경하지 않는다.
- DB schema/migration, remote collection fetch/backfill, queue/outbox/retry와 신규 delivery side effect는 추가하지
  않는다.
