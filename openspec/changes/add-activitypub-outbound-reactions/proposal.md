## Why

Kosmo는 Local Profile의 Reaction을 domain transaction에 저장하지만 Remote Post Author에게 ActivityPub interaction으로
전달하지 않는다. PROD-499는 여섯 built-in Reaction의 의미를 보존하면서 Like-only 구현체와 호환되는
`Like`·FEP-c0e0 `EmojiReact`·`Undo` 발신 경계를 현재 Fedify post-commit delivery 계약에 추가한다.

## What Changes

- 실제 생성된 `❤️` Reaction은 동일 `content`의 `Like`, 나머지 다섯 Type은 동일 `content`의 `EmojiReact`로
  직렬화한다.
- immutable Reaction ID에서 `/ap/reaction/{reactionId}` activity URI를 파생하고 canonical ActivityPub Post URI를
  object로 사용한다.
- 저장된 Remote Post Author inbox/shared inbox에만 직접 전달하고 행동 주체 followers에는 fan-out하지 않는다.
- 실제 생성·삭제에만 발신하며, 삭제는 원본 activity를 내장한 `{activityUri}#undo` `Undo`를 같은 ordering key로
  전달한다.
- Local Post, non-local actor, unsupported Type과 Active가 아닌 remote target에는 delivery를 시도하지 않는다.
- domain transaction commit 뒤 기존 Fedify 경계로 직접 전달하고 실패를 관측하되 committed application 결과는
  유지한다.
- inbound materialization, custom·legacy emoji, `emojiReactions` collection, queue/outbox와 sibling interaction은
  포함하지 않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/reaction.md`의 ActivityPub 발신 투영,
  `docs/domain/objects/post.md`의 ActivityPub Local Note 표현,
  `docs/domain/decisions/0017-activitypub-local-post-note.md`, `docs/architecture/core-services.md`
- Linear Contract: PROD-499
- Linear Implementations: PROD-499가 이 OpenSpec, application transaction 연결, Fedify 직렬화·직접 전달과
  테스트를 소유한다. 완료된 PROD-494·PROD-447의 identity 및 post-commit failure isolation 계약을 사용하며,
  PROD-448은 queue/outbox 후속 migration이고 PROD-500은 `emojiReactions` collection 후속이다.

## Capabilities

### New Capabilities

- `activitypub-outbound-reaction`: Local Reaction의 `Like`·`EmojiReact` 투영, Remote Post Author 직접 전달,
  멱등 lifecycle, exact `Undo`와 post-commit 실패 격리를 정의한다.

### Modified Capabilities

- 없음.

## Impact

- `packages/core`: 단일 `addReaction`이 origin으로 Local outbound와 ActivityPub materialization을 구분하고 optional
  transaction에는 독립적으로 참여한다. top-level actual create는 commit 뒤 Notification을, Local origin은 Fedify
  lifecycle을 실행한다.
- `packages/fedify`: 저장된 Reaction·Post·actor projection 조회, stable activity identity,
  `Like`·`EmojiReact`·`Undo` 직렬화와 inbox/shared inbox 직접 delivery 경계
- API/Fedify/core 테스트: 여섯 Type 매핑, local/remote·actor/instance eligibility, duplicate add/repeated delete,
  exact Undo, recipient·ordering과 post-commit failure isolation 검증
- PostgreSQL/Drizzle schema, MessageQueue/NATS/transactional outbox 변경 없음
