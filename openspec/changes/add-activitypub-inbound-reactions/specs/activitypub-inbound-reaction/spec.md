## ADDED Requirements

### Requirement: Typed inbound Reaction activity validation

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-498, PROD-567. 시스템은 중앙 Fedify inbox에서 고유한 HTTP(S) activity URI, 저장된 active Remote Profile actor와 고유한 HTTP(S) object URI를 가진 `Like`와 `EmojiReact`만 처리해야 한다(MUST). Activity의 `to`·`cc` 등 audience 존재 여부, 대상 Post Author 포함 여부와 personal/shared inbox route를 수신 Reaction의 유효성 또는 권한 증거로 사용해서는 안 된다(MUST NOT).

#### Scenario: Local Post 대상 activity

- **WHEN** 저장된 active Remote Profile이 파생 Local Note URI를 object로 한 `Like` 또는 `EmojiReact`를 전달한다
- **THEN** 시스템은 local Post identity를 기존 Post로 해석한다
- **AND** 행동 주체가 Post 조회 정책을 통과하면 Reaction materialization을 계속한다

#### Scenario: Audience와 inbox route에 독립적인 activity

- **WHEN** 유효한 `Like` 또는 `EmojiReact`가 audience를 생략하거나 대상 Post Author를 포함하지 않은 audience를 가진 채 personal inbox 또는 shared inbox로 전달된다
- **THEN** 시스템은 audience와 route만을 이유로 activity를 거부하지 않는다
- **AND** 저장된 actor, 정확한 object identity와 Post 조회 정책을 동일하게 검증한다

#### Scenario: Stored Remote Post 대상 activity

- **WHEN** 저장된 active Remote Profile이 기존 `ActivityPubPosts.uri`를 object로 한 `Like` 또는 `EmojiReact`를 전달한다
- **THEN** 시스템은 mapping의 기존 Remote Post를 대상으로 Reaction materialization을 계속한다
- **AND** Remote Post나 Profile을 새로 fetch, backfill 또는 materialize하지 않는다

#### Scenario: Invalid activity identity or participant

- **WHEN** activity URI, actor URI 또는 object URI가 없거나 고유한 HTTP(S) URI가 아니거나 actor가 저장된 active Remote Profile이 아니다
- **THEN** 시스템은 Reaction과 ActivityPub mapping을 만들지 않는다
- **AND** actor 또는 object를 네트워크에서 새로 materialize하지 않는다

#### Scenario: Unavailable target

- **WHEN** 행동 주체가 대상 Post를 조회할 수 없다
- **THEN** 시스템은 side effect 없이 activity를 거부한다
- **AND** Local·Remote 여부나 거부 원인을 federation 응답으로 구분해 노출하지 않는다

### Requirement: Inbound Reaction Type projection

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-498. 시스템은 `Like(content)`와 `EmojiReact(content)`를 같은 Reaction Type 투영 규칙으로 처리해야 하며(MUST),
custom emoji나 임의 Unicode를 새 Reaction Type으로 저장해서는 안 된다(MUST NOT).

#### Scenario: Supported content

- **WHEN** activity `content`가 `🥹`, `❤️`, `🎉`, `👀`, `☘️`, `🌈` 중 하나와 정확히 일치한다
- **THEN** 시스템은 해당 문자열을 materialized Reaction Type으로 사용한다

#### Scenario: Missing or unsupported content

- **WHEN** `Like` 또는 `EmojiReact`의 `content`가 없거나 허용 목록 밖 Unicode다
- **THEN** 시스템은 Reaction Type을 `❤️`로 투영한다

#### Scenario: Custom emoji content

- **WHEN** activity가 custom emoji shortcode 또는 Emoji tag를 포함한다
- **THEN** 시스템은 Reaction Type을 `❤️`로 투영한다
- **AND** custom emoji identity, shortcode, image 또는 tag를 저장하지 않는다

#### Scenario: Unsupported extensions

- **WHEN** activity가 legacy `EmojiReaction`이거나 Misskey `_misskey_reaction`만으로 Reaction을 표현한다
- **THEN** 시스템은 이를 typed inbound Reaction handler로 처리하지 않는다

### Requirement: Atomic and idempotent inbound Reaction materialization

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-498. 시스템은 검증된 remote activity를 기존 core Reaction 추가 행동으로 materialize하고 activity URI와 Reaction의 ActivityPub mapping을 같은 transaction에서 원자적으로 저장해야 한다(MUST).

#### Scenario: New inbound Reaction

- **WHEN** 검증된 activity URI에 mapping이 없고 같은 actor, Post, Type의 Reaction이 없다
- **THEN** 시스템은 core Reaction과 1:1 ActivityPub mapping을 같은 transaction에서 생성한다

#### Scenario: Existing core Reaction without activity mapping

- **WHEN** 같은 actor, Post, Type의 Reaction은 이미 있지만 입력 activity URI mapping은 없다
- **THEN** 시스템은 기존 core Reaction을 유지하고 해당 activity URI의 1:1 mapping을 같은 transaction에 연결한다
- **AND** 중복 Reaction을 만들지 않는다

#### Scenario: Exact duplicate delivery

- **WHEN** 같은 activity URI가 같은 actor, Post와 투영 Type으로 다시 전달된다
- **THEN** 시스템은 기존 Reaction과 mapping을 유지한 채 멱등 성공한다
- **AND** 새 Notification을 만들지 않는다

#### Scenario: Conflicting activity URI reuse

- **WHEN** 이미 mapping된 activity URI가 다른 actor, Post 또는 투영 Type으로 다시 전달된다
- **THEN** 시스템은 기존 Reaction과 mapping을 바꾸지 않는다
- **AND** 충돌 payload를 위한 새 Reaction이나 mapping을 만들지 않는다

#### Scenario: Transaction failure

- **WHEN** Reaction 또는 ActivityPub mapping 저장 중 하나가 실패한다
- **THEN** 시스템은 둘 다 commit하지 않는다

### Requirement: Mapping-based inbound Reaction Undo

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-498. 시스템은 `Undo`가 가리키는 저장된 activity URI mapping으로 정확한 Reaction을 찾아야 하며(MUST), 원래
Reaction actor와 일치하는 저장된 active Remote Profile만 이를 제거할 수 있어야 한다(MUST).

#### Scenario: Activity URI Undo

- **WHEN** `Undo.object`가 저장된 `Like` 또는 `EmojiReact` activity URI이고 Undo actor가 원래 actor와 일치한다
- **THEN** 시스템은 mapping된 Reaction과 mapping을 같은 transaction에서 제거한다

#### Scenario: Embedded activity Undo

- **WHEN** `Undo.object`가 저장된 URI를 id로 가진 embedded `Like` 또는 `EmojiReact`이고 embedded actor와 Undo actor가 원래 actor와 일치한다
- **THEN** 시스템은 같은 mapping 기반 제거를 수행한다
- **AND** embedded object와 content를 삭제 대상 identity로 다시 계산하지 않는다

#### Scenario: Missing or repeated Undo

- **WHEN** Undo 대상 activity URI mapping이 없거나 이미 제거됐다
- **THEN** 시스템은 상태를 바꾸지 않은 채 멱등 처리한다

#### Scenario: Different actor Undo

- **WHEN** Undo actor 또는 embedded activity actor가 원래 Reaction actor와 다르다
- **THEN** 시스템은 Reaction과 mapping을 유지한다

#### Scenario: No Undo dereference

- **WHEN** Undo 대상이 embedded activity가 아닌 URI다
- **THEN** 시스템은 저장 mapping만 조회한다
- **AND** 대상 activity를 네트워크에서 역참조하지 않는다

### Requirement: Existing Reaction Notification lifecycle integration

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, PROD-498. 시스템은 inbound activity로 새 Reaction이 실제 생성되거나 Undo로 실제 제거된 경우 기존 Reaction Notification 생성·정리 lifecycle을 적용해야 하며(MUST), Notification 실패로 source 결과를 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Newly created inbound Reaction

- **WHEN** inbound activity가 새 Reaction을 commit한다
- **THEN** 시스템은 commit 뒤 기존 Best Effort Reaction Notification 생성을 호출한다

#### Scenario: Duplicate inbound Reaction

- **WHEN** duplicate delivery가 기존 Reaction과 mapping을 유지한다
- **THEN** 시스템은 중복 Reaction Notification을 생성하지 않는다

#### Scenario: Successful inbound Undo

- **WHEN** Undo가 실제 Reaction과 mapping을 제거한다
- **THEN** 시스템은 기존 Best Effort Reaction Notification cleanup을 적용한다

#### Scenario: Notification failure isolation

- **WHEN** Notification 생성 또는 정리가 실패한다
- **THEN** 시스템은 이미 commit된 Reaction과 ActivityPub mapping 결과를 유지한다

### Requirement: Inbound Reaction scope boundary

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-498. Inbound Reaction capability는 저장된 actor와 Post에 대한 수신 materialization만 소유해야 한다(MUST).

#### Scenario: Deferred federation capabilities

- **WHEN** inbound `Like`, `EmojiReact`와 `Undo` handler가 제공된다
- **THEN** 시스템은 local Reaction outbound delivery와 `emojiReactions` collection을 이 변경에서 추가하지 않는다
- **AND** Remote Post fetch·backfill, custom emoji 저장과 legacy `EmojiReaction` vocabulary를 추가하지 않는다
- **AND** `Create(Note)`의 audience 기반 Public·Unlisted Visibility projection과 unsupported addressing 거부를 변경하지 않는다
