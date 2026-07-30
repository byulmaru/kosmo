## Why

Kosmo는 Remote Profile과 Post를 materialize하고 Local Note identity를 제공하지만, remote `Like`와
`EmojiReact`를 기존 Reaction lifecycle에 연결하지 않는다. PROD-498은 FEP-c0e0 호환 activity를 local·remote
Post에 대한 동일한 Reaction 관계로 안전하고 멱등하게 수신한다.

## What Changes

- 중앙 Fedify inbox에서 typed `Like`, `EmojiReact`와 대응 `Undo`를 처리한다.
- 저장된 active Remote Profile actor, 대상 Post Author recipient, Post 조회 가능성과 local·remote ActivityPub Post
  identity를 검증한다. audience가 없는 Local Post personal inbox delivery는 route recipient를 대상 Author 증거로
  사용하되 shared inbox와 Remote Post의 activity audience 요구사항은 유지한다.
- 허용된 Unicode `content`는 그대로 사용하고 missing·unsupported·custom emoji content는 `❤️`로 투영한다.
- Remote activity URI와 Reaction의 ActivityPub 전용 1:1 mapping을 같은 transaction에 저장한다.
- 같은 activity URI 재전달은 멱등 처리하고 충돌 payload는 기존 상태를 바꾸지 않는다.
- IRI 또는 embedded activity를 가리키는 `Undo`를 네트워크 역참조 없이 mapping으로 검증·제거한다.
- 실제 생성·제거에만 기존 Reaction Notification의 Best Effort lifecycle을 적용한다.
- outbound Reaction activity, `emojiReactions` collection, remote Post 신규 ingestion과 custom emoji 저장은 포함하지
  않는다.

## Authority / Provenance

- Canonical: `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`,
  `docs/domain/objects/notification.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`
- Linear Contract: PROD-498, PROD-567
- Linear Implementations: PROD-498이 OpenSpec, schema, core action, Fedify handler, 테스트와 PR을 직접 소유한다.
  PROD-567은 active change에서 audience 없는 personal inbox 호환성 보정을 소유한다. PROD-494는 완료된 Post
  identity 기반이며 PROD-500은 후속 `emojiReactions` collection만 소유한다.

## Capabilities

### New Capabilities

- `activitypub-inbound-reaction`: Remote `Like`·`EmojiReact`·`Undo`의 검증, Type 투영, local·remote Post
  materialization, 중복·충돌 처리와 Notification 연결을 정의한다.

### Modified Capabilities

- `data-model`: Remote reaction activity URI와 Reaction의 ActivityPub 전용 1:1 mapping 및 lifecycle 무결성을
  추가한다.

## Impact

- `packages/fedify`: typed inbox listener, local·remote Post URI lookup, recipient·actor 검증과 Undo parsing
- `packages/core`: ActivityPub inbound Reaction transaction, mapping lookup·삭제와 기존 Notification 경계 재사용
- PostgreSQL/Drizzle: additive ActivityPub Reaction mapping table, unique/FK 제약과 migration 검증
- Fedify·core DB-backed 테스트: local/remote target, content projection, duplicate/conflict, Undo와 실패 격리 검증
