## ADDED Requirements

### Requirement: Reaction Notification source correlation

시스템은 다른 Profile의 Local Post에 새 Reaction이 생성되면 Reaction을 source로 하는 Profile-scoped Notification을 Best Effort로 생성해야 한다(MUST).

#### Scenario: 다른 Profile의 Post Reaction

- **WHEN** Local Profile이 다른 Local Profile의 Post에 새 Reaction을 생성하고 source transaction이 commit된다
- **THEN** 시스템은 `kind = REACTION`, `source_id = Reaction.id`, Recipient를 Post Author Profile로 하는 Notification을 같은 request에서 await한다
- **AND** Related Profile은 Reaction Author Profile, Related Post는 Reaction Target Post, 표시 Type은 source의 Reaction Type에서 파생한다
- **AND** kind별 `data`에는 source에서 파생할 수 있는 Profile, Post, Type snapshot을 저장하지 않는다

#### Scenario: 자기 Post Reaction

- **WHEN** Post Author Profile이 자신의 Post에 Reaction을 생성한다
- **THEN** 시스템은 Reaction 생성 결과를 유지한다
- **AND** Reaction Notification을 생성하지 않는다

#### Scenario: Remote Recipient

- **WHEN** Reaction Target Post의 Author가 Remote Profile이다
- **THEN** 시스템은 Local inbox Notification을 생성하지 않는다
- **AND** ActivityPub delivery를 수행하지 않는다

#### Scenario: 동일 Reaction source 재처리

- **WHEN** 같은 Reaction source의 Notification 저장 경계가 둘 이상 호출된다
- **THEN** `(recipient_profile_id, REACTION, source_id)` Notification은 하나만 존재한다
- **AND** 반복 호출은 기존 item을 나타내는 성공 또는 동등한 idempotent no-op으로 끝난다

### Requirement: Reaction Notification 실패 격리

Reaction Notification 생성 실패는 Reaction 생성 transaction이나 성공 결과를 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Notification 저장 실패

- **WHEN** 새 Reaction commit 뒤 Notification 저장이 실패한다
- **THEN** 시스템은 Reaction과 Reaction 추가 성공 결과를 유지한다
- **AND** 이번 capability는 누락 item을 retry, outbox, queue 또는 backfill로 자동 복구하지 않는다

### Requirement: Reaction Notification GraphQL과 inbox 계약

API와 클라이언트는 visible Reaction Notification을 기존 Notification interface·connection·Unread count·Read 계약에 통합해야 한다(MUST).

#### Scenario: Reaction Notification concrete object

- **WHEN** GraphQL schema가 `kind = REACTION` Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete Reaction Notification object로 resolve한다
- **AND** object는 source에서 파생한 Reaction Author Profile, Target Post와 Reaction Type을 제공한다
- **AND** raw `kind`, `source_id`, 범용 `data` 또는 generic fallback을 노출하지 않는다

#### Scenario: Recipient inbox 표시와 이동

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Reaction Notification은 기존 connection 정렬과 pagination, Unread count와 Read 계약을 따른다
- **AND** client item은 Reaction Author, Type과 Target Post를 표시하고 해당 Post로 이동할 수 있다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 한 Recipient Profile의 inbox를 조회·읽는다
- **THEN** 시스템은 target Recipient Profile 범위의 Reaction Notification과 count만 반환·갱신한다

### Requirement: unavailable Reaction Notification 숨김

시스템은 Reaction source가 없거나 source의 Post·Author·Recipient 관계가 저장 Recipient와 일치하지 않거나 Recipient 기준 Related Profile 또는 Target Post를 조회할 수 없는 Reaction Notification을 모든 API 표면에서 숨겨야 한다(MUST).

#### Scenario: source가 없는 item

- **WHEN** Reaction source가 제거됐지만 Notification row가 남아 있다
- **THEN** API는 item을 connection과 Unread count에서 제외한다
- **AND** Node는 `null`, Read는 `NOT_FOUND`를 반환한다

#### Scenario: source 관계가 일치하지 않는 item

- **WHEN** source의 Target Post Author가 저장 Recipient와 다르거나 source Author·Post가 Recipient 기준으로 unavailable하다
- **THEN** API는 page limit 전에 item을 filtering한다
- **AND** generic Reaction Notification이나 snapshot으로 대신 노출하지 않는다

### Requirement: Reaction 제거 뒤 Best Effort Notification 정리

정상 Reaction 삭제 action은 source transaction commit 뒤 같은 request에서 대응 Notification cleanup을 Best Effort로 시도해야 한다(MUST).

#### Scenario: Reaction 삭제 cleanup

- **WHEN** Reaction 삭제가 commit된다
- **THEN** source action은 `(REACTION, source_id)` Notification delete 경계를 await한다
- **AND** cleanup 성공 뒤 item은 connection, Unread count, Node와 Read에서 사라진다

#### Scenario: 반복 cleanup

- **WHEN** 이미 제거된 Reaction source의 cleanup을 다시 호출한다
- **THEN** Notification delete 경계는 성공한 idempotent no-op을 반환한다

#### Scenario: cleanup 실패

- **WHEN** Reaction 삭제 뒤 Notification cleanup이 실패하거나 process가 종료된다
- **THEN** Reaction 삭제와 성공 응답은 유지된다
- **AND** 남은 Notification row는 source가 없으므로 모든 API 표면에서 숨겨진다
- **AND** retry, cron, queue, backfill 또는 bulk cleanup은 이번 capability에 포함하지 않는다
