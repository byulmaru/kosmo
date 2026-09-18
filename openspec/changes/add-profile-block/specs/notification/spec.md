## ADDED Requirements

### Requirement: Profile Block hides paired existing Notifications

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0002-pr-review-domain-adjustments.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0007-spec-boundary-and-state-clarifications.md`, `PROD-822`, `PROD-813`. Recipient Profile과 Related Profile 사이에 Profile Block pair가 있으면 기존 Notification을 Notification connection, Unread count, Node 조회와 읽음 처리에서 숨겨야 한다(MUST). 이 Notification pair 정책은 Recipient가 Related Post를 직접 조회할 수 있는 방향의 Post·Media 정책과 독립적으로 적용해야 한다(MUST). 저장 row와 Read State는 후속 cleanup 전까지 남을 수 있다(MAY).

#### Scenario: Profile Block pair의 기존 Notification을 숨긴다

- **WHEN** Recipient Profile과 Related Profile 사이에 Profile Block pair가 있고 Recipient가 해당 Notification을 조회한다
- **THEN** 시스템은 해당 item을 목록, Unread count, Node 조회와 읽음 처리 대상에서 제외한다
- **AND** Notification 저장 row와 Read State가 남아 있어도 API 표면에 노출하지 않는다

#### Scenario: Notification pair policy와 직접 Post 조회 policy를 분리한다

- **WHEN** Recipient가 Related Post를 직접 조회할 수 있는 방향의 Profile Block pair에 연결된 기존 Notification을 조회한다
- **THEN** 시스템은 Notification pair policy에 따라 해당 item을 숨긴다
- **AND** Related Post·Media 직접 조회 결과는 Post·Media의 viewer 방향 정책으로 별도 판정한다

### Requirement: Follow-cause Notification cleanup follows the Profile Block transaction

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. 새 Profile Block 관계를 저장하는 Profile Block transaction에서 제거하는 Follow Request 또는 Follow Relationship을 직접 원인으로 가진 Notification은 같은 transaction에서 제거해야 한다(MUST). 이미 Profile Block 관계가 존재한 뒤 동시성이나 후속 경로로 뒤늦게 관찰되는 Notification은 Active Block pair 정책으로 처리해야 하며(MUST), duplicate Block이나 Unblock의 보상 cleanup으로 처리해서는 안 된다(MUST NOT). 제거된 Follow 객체가 직접 원인이 아닌 다른 기존 Notification과 Repost·Reaction·Bookmark 관계의 Notification은 이 action에서 동기적으로 삭제하거나 Read State를 바꾸지 않아야 한다(MUST NOT). commit 뒤 별도 effect의 성공·실패는 Profile Block 관계 성공을 바꾸지 않아야 한다(MUST NOT).

#### Scenario: 제거된 Follow Request/Relationship 직접 원인 Notification을 transaction에서 정리한다

- **WHEN** Profile Block transaction이 현재 양방향 Follow Request 또는 Follow Relationship을 제거한다
- **THEN** 시스템은 각 제거 객체를 직접 원인으로 하는 Notification도 같은 transaction에서 제거한다
- **AND** 해당 Follow 객체와 직접 연결되지 않은 기존 Notification은 저장 상태와 Read State를 유지한다

#### Scenario: commit 뒤 effect 실패는 Notification cleanup 결과와 관계 성공을 바꾸지 않는다

- **WHEN** Profile Block transaction이 commit된 뒤 별도 effect가 실패하거나 재시도된다
- **THEN** 시스템은 commit된 Profile Block 관계와 transaction에서 제거한 직접 원인 Notification 결과를 유지한다
- **AND** effect의 실패·재시도 결과를 Profile Block relation success/failure로 다시 판정하지 않는다

## Deferred scope

현재 Follow·Follow Request·Reply·Reaction·Repost source 전체에 Profile Block 신규 Notification 생성 policy를 연결하는 일은
`PROD-327`의 후속 범위이며, 이 change의 requirement·task·완료 증거에 포함하지 않는다. 숨겨진 Notification의 비동기 물리
cleanup lifecycle 역시 `PROD-328`의 후속 범위로 남긴다.
