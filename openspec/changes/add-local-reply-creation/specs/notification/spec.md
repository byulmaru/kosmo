## ADDED Requirements

### Requirement: Reply Notification source correlation

**Authority / Provenance:** `docs/domain/objects/notification.md`, `docs/domain/objects/post.md`, `PROD-426` 시스템은 Local Profile이 다른 Profile의 Post에 새 Reply를 생성하면 결과 Reply를 source로 하는 Profile-scoped Reply Notification을 Best Effort로 생성해야 한다(MUST).

#### Scenario: 다른 Profile의 Post에 Reply

- **WHEN** Local Reply transaction이 commit되고 Reply Author와 Parent Author가 다르며 Recipient가 결과 Reply와 Reply Author를 조회할 수 있다
- **THEN** 시스템은 결과 Reply를 Related Post와 source로, Reply Author를 Related Profile로, Parent Author를 Recipient로 하는 Unread Reply Notification 생성을 시도한다
- **AND** 이름, handle, Profile 또는 Post snapshot을 kind data에 저장하지 않는다

#### Scenario: self-reply

- **WHEN** Reply Author와 Parent Author가 같다
- **THEN** 시스템은 Reply 생성 결과를 유지한다
- **AND** Reply Notification을 생성하지 않는다

#### Scenario: Recipient에게 결과가 보이지 않음

- **WHEN** Parent Author Profile이 결과 Reply 또는 Reply Author Profile을 조회할 수 없다
- **THEN** 시스템은 Reply Notification을 생성하지 않는다

#### Scenario: Recipient Notification 억제 정책

- **WHEN** Recipient의 Profile Mute·Profile Block·Profile Domain Block, Notification scope Word·Hashtag Mute, Root Post thread의 Post Notification Mute 또는 Domain Block Instance 정책이 결과 Reply에 적용된다
- **THEN** 시스템은 Reply Notification을 생성하지 않는다

#### Scenario: 동일 source 재처리

- **WHEN** 같은 결과 Reply source의 Notification 저장 경계가 중복 또는 동시 호출된다
- **THEN** 같은 Recipient, Reply kind와 source ID의 Notification은 하나만 존재한다
- **AND** 재처리는 기존 item을 나타내는 성공 또는 동등한 멱등 no-op으로 끝난다

### Requirement: Reply Notification 실패 격리

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-426` Reply Notification 생성 실패는 Reply transaction이나 성공 결과를 rollback하거나 실패로 바꾸어서는 안 된다(MUST NOT).

#### Scenario: Notification 저장 실패

- **WHEN** Reply commit 뒤 같은 request에서 await한 Notification 저장이 실패한다
- **THEN** 시스템은 Reply와 Reply 생성 성공 결과를 유지한다
- **AND** 누락 item을 retry, outbox, queue 또는 backfill로 자동 복구하지 않는다

### Requirement: Reply Notification GraphQL과 inbox 통합

**Authority / Provenance:** `docs/domain/objects/notification.md`, `PROD-426` API와 클라이언트는 visible Reply Notification을 기존 Notification interface·connection·Unread count·Read·badge/cache·inbox 계약에 통합해야 한다(MUST).

#### Scenario: Reply Notification concrete object·Node

- **WHEN** GraphQL schema가 Reply kind Notification을 노출한다
- **THEN** API는 이를 Notification과 Node를 구현하는 concrete `ReplyNotification` object로 resolve한다
- **AND** object는 Reply Author `profile`과 결과 Reply `post`를 제공한다
- **AND** concrete global ID로 Node를 조회할 때 row kind, Recipient membership과 visible predicate를 검증하고, 실패하면 다른 type으로 재시도하지 않고 `null`을 반환한다

#### Scenario: visible Recipient inbox

- **WHEN** membership이 있는 Account가 Recipient Profile의 Notification inbox를 조회한다
- **THEN** visible Reply Notification은 기존 connection 정렬·pagination과 Unread count에 포함된다
- **AND** inbox item은 Reply Author를 표시하고 결과 Reply 상세로 이동한다

#### Scenario: Read side effect와 이동 분리

- **WHEN** 사용자가 Reply Notification item을 활성화한다
- **THEN** 클라이언트는 결과 Reply 이동을 즉시 시작한다
- **AND** Best Effort Read의 pending, 실패 또는 재시도가 이동을 지연·취소·되돌리지 않는다
- **AND** Read 성공 payload는 item과 Recipient Profile Unread count를 같은 actor Relay Store에서 갱신한다

#### Scenario: selected Profile 격리

- **WHEN** Account가 여러 Profile membership을 가지고 하나의 Recipient Profile inbox를 조회하거나 읽는다
- **THEN** 시스템은 대상 Profile의 Reply Notification, count, Read와 cache만 반환·갱신한다
- **AND** 다른 selected Profile의 item, badge 또는 Relay Store를 변경하지 않는다

#### Scenario: unavailable item

- **WHEN** source Reply가 없거나 Recipient·Parent·Author 관계가 저장계약과 다르거나 Recipient 기준 Related Post 또는 Related Profile을 조회할 수 없다
- **THEN** API는 item을 page limit 전 connection과 Unread count에서 제외한다
- **AND** Node는 `null`, Read는 `NOT_FOUND`로 처리하며 generic Notification으로 대신 노출하지 않는다
