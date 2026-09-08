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

### Requirement: Follow-cause Notification cleanup follows durable Profile Block cleanup

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Profile Block의 durable cleanup orchestration이 이번 실행에서 포착해 제거하는 Follow Request 또는 Follow Relationship을 직접 원인으로 가진 Notification은 required cleanup에서 제거해야 한다(MUST). 제거된 Follow 객체가 직접 원인이 아닌 다른 기존 Notification과 Repost·Reaction·Bookmark 관계의 Notification은 이 action에서 동기적으로 삭제하거나 Read State를 바꾸지 않아야 한다(MUST NOT).

#### Scenario: 제거된 Follow Request/Relationship 직접 원인 Notification을 durable하게 정리한다

- **WHEN** Profile Block cleanup orchestration이 이번 실행에서 포착한 양방향 Follow Request 또는 Follow Relationship을 제거한다
- **THEN** 시스템은 각 제거 객체를 직접 원인으로 하는 Notification을 required cleanup에 포함한다
- **AND** orchestration 재시작 뒤에도 미완료된 직접 원인 Notification 정리를 재개한다
- **AND** 해당 Follow 객체와 직접 연결되지 않은 기존 Notification은 저장 상태와 Read State를 유지한다

## Deferred scope

현재 Follow·Follow Request·Reply·Reaction·Repost source 전체에 Profile Block 신규 Notification 생성 policy를 연결하는 일은
`PROD-327`의 후속 범위이며, 이 change의 requirement·task·완료 증거에 포함하지 않는다. 숨겨진 Notification의 비동기 물리
cleanup lifecycle 역시 `PROD-328`의 후속 범위로 남긴다.
