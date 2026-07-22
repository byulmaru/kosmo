## ADDED Requirements

### Requirement: Repost Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-412` 시스템은 다른 Local Profile의 Post에 새 Repost가 생성되면 Source Repost Post를 source로 하는 Profile-scoped Repost Notification을 Best Effort로 생성해야 한다(MUST).

#### Scenario: 다른 Profile의 Post Repost

- **WHEN** Local Profile이 다른 Local Profile의 Post에 새 Repost를 생성하고 source transaction이 commit된다
- **THEN** 시스템은 Source Repost Post ID를 source로 하고 Source Post Author Profile을 Recipient로 하는 Repost Notification 생성을 시도한다
- **AND** Related Profile은 Repost Author, Related Post는 Repost Source에서 파생한다
- **AND** kind별 data에는 Profile, Post 또는 이름·handle snapshot을 저장하지 않는다

#### Scenario: 자기 Post Repost

- **WHEN** Post Author Profile이 자신의 Post를 Repost한다
- **THEN** 시스템은 Repost 생성 결과를 유지한다
- **AND** Repost Notification을 생성하지 않는다

#### Scenario: Remote Recipient

- **WHEN** Repost Source Author가 Remote Profile이다
- **THEN** 시스템은 Local inbox Notification을 생성하지 않는다
- **AND** ActivityPub delivery를 수행하지 않는다

#### Scenario: 동일 Repost source 재처리

- **WHEN** 같은 Source Repost의 Notification 저장 경계가 둘 이상 호출된다
- **THEN** 같은 Recipient, Repost kind와 source ID의 Notification은 하나만 존재한다
- **AND** 반복 호출은 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Repost Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-389`, `PROD-412`, `PROD-416` Repost Notification 생성 또는 정리 실패는 Repost 생성·Tombstone transaction이나 성공 결과를 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Notification 저장 실패

- **WHEN** 새 Repost commit 뒤 Notification 저장이 실패한다
- **THEN** 시스템은 Repost와 Repost 생성 성공 결과를 유지한다
- **AND** 이번 capability는 누락 item을 retry, outbox, queue 또는 backfill로 자동 복구하지 않는다

#### Scenario: Notification 정리 실패

- **WHEN** Repost Tombstone commit 뒤 Notification 정리가 실패한다
- **THEN** 시스템은 Tombstone과 삭제 성공 결과를 유지한다
- **AND** 남은 Notification은 visible predicate에 의해 모든 API 표면에서 숨겨진다

### Requirement: Repost Notification GraphQL과 inbox 계약

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-389`, `PROD-412` API와 클라이언트는 visible Repost Notification을 기존 Notification interface·connection·Unread count·Read와 inbox 계약에 통합해야 한다(MUST).

#### Scenario: Repost Notification concrete object

- **WHEN** GraphQL schema가 Repost kind Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete `RepostNotification` object로 resolve한다
- **AND** object는 Repost Author `profile`과 Repost Source `post`를 제공한다
- **AND** raw kind, source ID, 범용 data 또는 Source Repost storage Node를 public fallback으로 노출하지 않는다

#### Scenario: concrete Node 조회

- **WHEN** 클라이언트가 visible Repost Notification의 concrete global ID를 `node(id:)`에 제공한다
- **THEN** API는 global ID의 concrete typename으로 Repost Notification loader를 선택한다
- **AND** row kind, Recipient membership과 visible predicate를 검증한 뒤 object를 반환한다
- **AND** 조건을 통과하지 못하면 다른 Notification type이나 generic object로 재시도하지 않고 `null`을 반환한다

#### Scenario: Recipient inbox 표시와 이동

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Repost Notification은 기존 connection 정렬·pagination, Unread count와 Read 계약을 따른다
- **AND** client item은 Repost Author와 Source Post를 표시하고 Source Post로 이동할 수 있다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 한 Recipient Profile의 inbox를 조회하거나 읽는다
- **THEN** 시스템은 target Recipient Profile 범위의 Repost Notification과 count만 반환·갱신한다
- **AND** 다른 selected Profile의 Relay Store와 badge를 변경하지 않는다

#### Scenario: Read 뒤 cache 동기화

- **WHEN** 사용자가 visible Repost Notification을 읽음 처리한다
- **THEN** API는 갱신된 Notification과 Recipient Profile의 visible Unread count를 반환한다
- **AND** client는 normalized payload로 item과 shell badge를 같은 actor Store에서 갱신한다

### Requirement: unavailable Repost Notification 숨김

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-389`, `PROD-412`, `PROD-416` 시스템은 Source Repost가 없거나 Tombstone이거나 구조가 Repost가 아니거나, Source 관계가 저장 Recipient와 일치하지 않거나 Recipient 기준 Related Profile 또는 Related Post를 조회할 수 없는 Repost Notification을 모든 API 표면에서 숨겨야 한다(MUST).

#### Scenario: Source Repost가 Tombstone인 item

- **WHEN** Source Repost가 Tombstone이지만 Notification 행이 남아 있다
- **THEN** API는 item을 connection과 Unread count에서 page limit 적용 전에 제외한다
- **AND** Node는 `null`, Read는 `NOT_FOUND` 결과를 반환한다

#### Scenario: source 구조 또는 Recipient가 일치하지 않는 item

- **WHEN** source Post가 Content 또는 Reply Parent를 가지거나 Repost Source가 없거나, 그 Source Author가 저장 Recipient와 다르다
- **THEN** API는 item을 모든 Notification 조회·Read 표면에서 숨긴다
- **AND** generic Notification이나 snapshot으로 대신 노출하지 않는다

#### Scenario: Related 객체를 조회할 수 없는 item

- **WHEN** Recipient Profile 기준으로 Repost Author 또는 Repost Source Post를 조회할 수 없다
- **THEN** API는 item을 page limit 적용 전에 connection과 count에서 제외한다
- **AND** Node와 Read에서도 존재하지 않는 item처럼 처리한다

### Requirement: Repost Tombstone 뒤 Best Effort Notification 정리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/decisions/0010-post-interaction-contracts.md`, `PROD-389`, `PROD-416` 정상 Repost 삭제 action은 Source Repost가 Tombstone으로 commit된 뒤 대응 Repost Notification을 idempotent하게 Best Effort로 정리해야 한다(MUST).

#### Scenario: Repost Tombstone cleanup

- **WHEN** Repost Tombstone transaction이 commit된다
- **THEN** source action은 Repost kind와 Source Repost ID로 대응 Notification 정리를 시도한다
- **AND** cleanup 성공 뒤 item은 connection, Unread count, Node와 Read에서 사라진다

#### Scenario: 반복 cleanup

- **WHEN** 이미 제거됐거나 존재하지 않는 Repost Notification source의 cleanup을 다시 호출한다
- **THEN** Notification delete 경계는 성공한 멱등 no-op을 반환한다

#### Scenario: cleanup 실패와 잔존 행

- **WHEN** Repost Tombstone 뒤 cleanup이 실패하거나 process가 종료된다
- **THEN** Repost Tombstone과 성공 응답은 유지된다
- **AND** 남은 Notification 행은 Source Repost가 Active가 아니므로 모든 API 표면에서 숨겨진다
- **AND** retry, cron, queue, backfill 또는 bulk cleanup은 이번 capability에 포함하지 않는다
