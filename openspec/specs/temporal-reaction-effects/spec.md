# temporal-reaction-effects Specification

## Purpose

Committed Reaction create/delete 전이 뒤 Temporal Workflow가 Notification lifecycle과 Local-origin
ActivityPub Like·EmojiReact·Undo queue handoff를 독립적으로 수행하는 책임과 실패 경계를 정의한다.

## Requirements

### Requirement: Committed Reaction transition별 Effects Workflow

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-723` — 시스템은 새 Reaction이 실제 commit된 뒤 Reaction Create Effects Workflow 시작을 시도해야 하고(MUST), Reaction이 실제 물리 삭제된 뒤 Reaction Delete Effects Workflow 시작을 시도해야 한다(MUST). 생성과 삭제 Workflow는 같은 완료 Workflow ID를 공유해서는 안 된다(MUST NOT).

#### Scenario: 실제 Reaction 생성

- **WHEN** Core transaction이 새 Reaction을 commit한다
- **THEN** 시스템은 `reaction-create-effects:{reactionId}` identity로 Create Effects Workflow 시작을 시도한다
- **AND** input은 committed Reaction ID와 origin만 포함한다

#### Scenario: 실제 Reaction 삭제

- **WHEN** Core transaction이 Reaction을 물리 삭제하고 commit한다
- **THEN** 시스템은 `reaction-delete-effects:{reactionId}` identity로 Delete Effects Workflow 시작을 시도한다
- **AND** input은 `DELETE ... RETURNING`으로 얻은 Reaction의 ID, Profile ID, Post ID, Type, 생성 시각과 origin만 포함한다

#### Scenario: duplicate, mapped-only 또는 no-op

- **WHEN** Reaction 추가가 기존 row를 유지하거나 inbound activity URI만 기존 Reaction에 mapping하거나 삭제할 Reaction이 없다
- **THEN** 시스템은 Create 또는 Delete Effects Workflow를 시작하지 않는다

#### Scenario: transaction rollback

- **WHEN** Reaction 또는 inbound mapping transaction이 commit 전에 rollback된다
- **THEN** 시스템은 Effects Workflow를 시작하지 않는다

### Requirement: Reaction 효과의 독립 재시도와 실패 격리

**Authority / Provenance:** `docs/domain/objects/reaction.md`, `docs/domain/objects/notification.md`, `docs/architecture/core-services.md`, `PROD-723` — Accepted Reaction Effects Workflow는 Notification 효과와 Local-origin federation queue handoff를 독립 Activity로 실행하고 재시도해야 한다(MUST). 한 효과의 terminal failure가 다른 효과 시도를 막아서는 안 되며(MUST NOT), 효과 실패가 committed Reaction 또는 caller 성공을 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Create Workflow의 독립 효과

- **WHEN** Local-origin Create Effects Workflow가 수락된다
- **THEN** Workflow는 Reaction Notification 생성과 Like 또는 EmojiReact queue handoff를 각각 시도한다
- **AND** 한 Activity가 최종 실패해도 다른 Activity의 실행 결과를 수집한다

#### Scenario: Delete Workflow의 독립 효과

- **WHEN** Local-origin Delete Effects Workflow가 수락된다
- **THEN** Workflow는 Reaction Notification 정리와 Undo queue handoff를 각각 시도한다
- **AND** 한 Activity가 최종 실패해도 다른 Activity의 실행 결과를 수집한다

#### Scenario: ActivityPub-origin transition

- **WHEN** ActivityPub-origin Create 또는 Delete Effects Workflow가 수락된다
- **THEN** Workflow는 해당 Notification lifecycle만 실행한다
- **AND** Like, EmojiReact 또는 Undo outbound queue handoff를 실행하지 않는다

#### Scenario: commit 뒤 Workflow start 실패

- **WHEN** Reaction transaction은 commit됐지만 Workflow start가 수락되지 않거나 start 전에 process가 종료된다
- **THEN** 시스템은 committed Reaction과 caller 성공을 유지한다
- **AND** 감지된 start 실패를 관측하지만 outbox, receipt, relay 또는 backfill로 gap을 복구하지 않는다
