## ADDED Requirements

### Requirement: Built-in Reaction을 호환 Activity로 투영한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-499. 시스템은 실제 생성된 built-in Reaction만 합의한 호환 activity로 투영해야 한다(MUST). Local Profile의 `❤️`는 정확한 `content: "❤️"`를 가진 `Like`로,
`🥹`·`🎉`·`👀`·`☘️`·`🌈`를 각각 정확한 Type을 `content`에 가진 `EmojiReact`로 투영해야 한다(MUST).
`Like`는 별도 domain Like가 아니라 `❤️` Reaction의 호환 표현이어야 한다(MUST).

#### Scenario: 기본 Reaction을 Like로 만든다

- **WHEN** Local Profile이 Remote Post에 `❤️` Reaction을 실제 생성한다
- **THEN** 시스템은 actor, object와 `content: "❤️"`를 가진 `Like` activity를 전달한다

#### Scenario: 나머지 built-in Reaction을 EmojiReact로 만든다

- **WHEN** Local Profile이 Remote Post에 `🥹`, `🎉`, `👀`, `☘️`, `🌈` 중 하나를 실제 생성한다
- **THEN** 시스템은 선택한 Type과 정확히 같은 content를 가진 `EmojiReact` activity를 전달한다

#### Scenario: 지원하지 않는 Type은 발신하지 않는다

- **WHEN** outbound 경계에 여섯 built-in Type 이외의 Reaction Type이 입력된다
- **THEN** 시스템은 ActivityPub delivery를 시도하지 않는다

### Requirement: Reaction activity identity와 object를 안정적으로 구성한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-499. 시스템은 immutable Reaction ID에서 `/ap/reaction/{reactionId}` 형식의 원본 activity URI를 파생해야 한다(MUST).
activity actor는 행동 주체 Local Profile의 actor URI, object는 대상 Post의 canonical ActivityPub URI여야 한다(MUST).
actor, activity URI와 서명 key identity는 행동 주체 Profile이 속한 LOCAL Instance의 canonical origin을
사용해야 하며(MUST), configured instance와 다르다는 이유로 delivery를 제한하지 않아야 한다(MUST NOT).

#### Scenario: 같은 Reaction을 반복 직렬화한다

- **WHEN** 동일한 Reaction을 여러 번 직렬화하거나 delivery helper에 전달한다
- **THEN** 모든 결과는 동일한 원본 activity URI, actor와 object를 사용한다

#### Scenario: 서로 다른 Type이 공존한다

- **WHEN** 같은 Profile과 Post에 서로 다른 Type의 Reaction이 존재한다
- **THEN** 각 Reaction은 자신의 immutable Reaction ID에서 파생한 서로 다른 activity URI를 사용한다

#### Scenario: configured instance와 다른 LOCAL Instance의 Profile이 발신한다

- **WHEN** 행동 주체 Profile이 configured instance와 다른 Active LOCAL Instance에 속한다
- **THEN** actor, activity URI와 서명 key identity는 해당 Profile의 LOCAL Instance canonical origin을 사용한다
- **THEN** 시스템은 configured instance와 다르다는 이유로 delivery를 건너뛰지 않는다

### Requirement: Remote Post Author에게만 직접 전달한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/post.md`, PROD-499. 시스템은 조회 가능한 Remote Post의 저장 author에게만 Reaction activity를 직접 전달해야 한다(MUST). Local Profile이 만든 activity는 Remote Post Author actor를
`to`로 하고, 저장된 shared inbox가 있으면 이를 우선하며 없으면 personal inbox로 직접 전달해야 한다(MUST). 대상
author의 Remote Instance가 Active일 때만 delivery를 시도해야 하며(MUST), 행동 주체의 followers collection에는
fan-out하지 않아야 한다(MUST NOT).

#### Scenario: Active Remote Post Author에게 전달한다

- **WHEN** Local actor identity를 가진 Profile이 Active Remote Instance의 author가 작성한 조회 가능한 Remote Post에 Reaction을 실제 생성한다
- **THEN** 시스템은 저장된 author actor를 `to`로 포함하고 shared inbox가 있으면 이를 우선하며 없으면 personal inbox로 직접 전달한다
- **THEN** 시스템은 행동 주체의 followers collection에는 전달하지 않는다

#### Scenario: Local Post에는 전달하지 않는다

- **WHEN** Local Profile이 Local Post에 Reaction을 생성하거나 삭제한다
- **THEN** 시스템은 outbound Reaction delivery를 시도하지 않는다

#### Scenario: non-local actor에는 전달하지 않는다

- **WHEN** Reaction 행동 주체 Profile이 Kosmo의 Local ActivityPub actor identity를 소유하지 않는다
- **THEN** 시스템은 outbound Reaction delivery를 시도하지 않는다

#### Scenario: Active가 아닌 remote target에는 전달하지 않는다

- **WHEN** 대상 Remote Post Author의 Instance가 Unresponsive이거나 기존 Post 조회 정책상 unavailable하다
- **THEN** 시스템은 outbound Reaction delivery를 시도하지 않고 application의 committed Reaction 결과를 유지한다

#### Scenario: FOLLOWERS Post 접근이 delivery 전에 사라진다

- **WHEN** FOLLOWERS Remote Post의 Reaction 생성은 commit됐지만 delivery 전에 행동 주체의 Follow 관계가 사라진다
- **THEN** 시스템은 새 `Like` 또는 `EmojiReact`를 전달하지 않고 committed Reaction 결과를 유지한다
- **THEN** 이전에 전달된 Reaction을 실제 삭제한 `Undo`는 원격 상태를 철회하기 위해 전달한다

### Requirement: 실제 lifecycle 변화에만 activity와 exact Undo를 전달한다

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-499. 시스템은 실제 Reaction lifecycle 변화에만 activity를 전달해야 한다(MUST). Reaction이 실제 생성된 경우에만 원본 `Like` 또는 `EmojiReact`를 전달하고, 실제 삭제된 경우에만 삭제한
Reaction의 원본 activity를 내장한 `Undo`를 전달해야 한다(MUST). `Undo` URI는 원본 activity URI에 `#undo`를
결합해야 하며(MUST), 원본 activity와 `Undo` delivery는 모두 원본 activity URI를 ordering key로 사용해야 한다(MUST).

#### Scenario: 멱등 add는 다시 전달하지 않는다

- **WHEN** 같은 Profile, Post와 Type의 기존 Reaction에 add가 반복된다
- **THEN** application은 기존 Reaction을 반환하고 새 ActivityPub delivery를 만들지 않는다

#### Scenario: 삭제한 Reaction만 Undo한다

- **WHEN** Reaction이 실제 삭제된다
- **THEN** 시스템은 삭제한 Reaction ID로 식별되는 정확한 원본 `Like` 또는 `EmojiReact`를 object에 내장한 `Undo`를 만든다
- **THEN** `Undo`는 `{originalActivityUri}#undo` URI와 originalActivityUri ordering key를 사용한다

#### Scenario: 반복 delete는 다시 전달하지 않는다

- **WHEN** 이미 삭제된 Reaction에 delete가 반복된다
- **THEN** application은 no-op 결과를 반환하고 새 `Undo` delivery를 만들지 않는다

#### Scenario: 다른 Type은 영향받지 않는다

- **WHEN** 같은 Profile과 Post의 한 Reaction Type을 삭제한다
- **THEN** `Undo`는 삭제한 Type의 원본 activity만 가리키며 다른 Type의 activity를 가리키지 않는다

### Requirement: delivery를 commit 이후 실패 격리 경계에서 실행한다

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-499. 시스템은 Reaction domain transaction이 commit된 뒤 기존 Fedify 경계로 직접 delivery를 시도해야 한다(MUST).
delivery 실패는 관측 가능하게 기록해야 하지만(MUST), 이미 commit된 Reaction 추가·삭제나 application 응답을
실패로 바꾸지 않아야 한다(MUST NOT).

#### Scenario: 원본 activity delivery가 실패한다

- **WHEN** Reaction 생성 transaction이 commit된 뒤 remote HTTP delivery가 실패한다
- **THEN** 시스템은 실패를 기록하고 committed Reaction과 성공 application 결과를 유지한다

#### Scenario: Undo delivery가 실패한다

- **WHEN** Reaction 삭제 transaction이 commit된 뒤 remote HTTP delivery가 실패한다
- **THEN** 시스템은 실패를 기록하고 committed 삭제와 성공 application 결과를 유지한다

#### Scenario: commit 전에는 전달하지 않는다

- **WHEN** Reaction domain transaction이 실패하거나 rollback된다
- **THEN** 시스템은 Reaction activity 또는 `Undo` delivery를 시도하지 않는다

### Requirement: 현재 직접 delivery 제한을 유지한다

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-499. 시스템은 PROD-499에서 기존 Fedify 직접 delivery 경계를 사용해야 하며(MUST), transactional outbox, NATS/Fedify
MessageQueue, durable retry, delivery history 또는 사용자용 delivery status를 선행 조건으로 추가하지 않아야 한다
(MUST NOT).

#### Scenario: application process가 commit 뒤 delivery 전에 종료된다

- **WHEN** domain transaction commit 후 direct delivery 시도 전에 process가 종료된다
- **THEN** 시스템은 이 변경에서 durable 복구를 보장하지 않으며 committed Reaction 결과는 그대로 유지된다

#### Scenario: 후속 migration과 분리한다

- **WHEN** PROD-499 구현 범위를 평가한다
- **THEN** queue/outbox migration은 PROD-448 후속 범위로 남고 이 변경의 완료 조건이 아니다
