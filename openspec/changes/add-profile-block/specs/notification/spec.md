## ADDED Requirements

### Requirement: Profile Block hides unavailable existing Notifications

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0002-pr-review-domain-adjustments.md`, `docs/domain/decisions/0005-domain-boundary-followup-clarifications.md`, `docs/domain/decisions/0007-spec-boundary-and-state-clarifications.md`, `PROD-822`, `PROD-813`. Profile Block 생성으로 Recipient가 Related Profile 또는 Related Post를 조회할 수 없게 된 기존 Notification은 Notification connection, Unread count, Node 조회와 읽음 처리에서 없는 것처럼 취급해야 한다(MUST). 저장 row와 Read State는 후속 cleanup 전까지 남을 수 있다(MAY).

#### Scenario: 차단으로 조회 불가가 된 기존 Notification을 숨긴다

- **WHEN** Profile Block이 생성된 뒤 Recipient가 상대 Profile 또는 상대 Profile의 Post를 원인으로 가진 기존 Notification을 조회한다
- **THEN** 시스템은 해당 item을 목록, Unread count, Node 조회와 읽음 처리 대상에서 제외한다
- **AND** Notification 저장 row와 Read State가 남아 있어도 API 표면에 노출하지 않는다

#### Scenario: 차단 해제 뒤 새 Notification 조회 정책을 사용한다

- **WHEN** Owner가 Profile Block을 해제하고 Notification 목록 또는 Node를 새로 조회한다
- **THEN** 시스템은 새 요청 시점의 Profile Block과 기존 Notification visibility policy를 평가한다
- **AND** Block 동안 숨겨지거나 제거된 과거 Notification을 읽음 상태나 저장 row의 변경만으로 자동 복구하지 않는다

### Requirement: Follow-cause Notification cleanup follows durable Profile Block cleanup

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/notification.md`, `docs/domain/decisions/0003-policy-ownership-clarifications.md`, `docs/domain/decisions/0009-pending-only-follow-request-lifecycle.md`, `PROD-821`. Profile Block의 durable cleanup orchestration이 제거하는 Follow Request 또는 Follow Relationship을 직접 원인으로 가진 Notification은 기존 Follow removal effect-plan 계약에 따라 required cleanup에서 제거해야 한다(MUST). 제거된 Follow 객체가 직접 원인이 아닌 다른 기존 Notification과 Repost·Reaction·Bookmark 관계의 Notification은 이 action에서 동기적으로 삭제하거나 Read State를 바꾸지 않아야 한다(MUST NOT).

#### Scenario: 제거된 Follow Request/Relationship 직접 원인 Notification을 durable하게 정리한다

- **WHEN** Profile Block cleanup orchestration이 양방향 Follow Request 또는 Follow Relationship을 제거한다
- **THEN** 시스템은 각 제거 객체를 직접 원인으로 하는 Notification을 해당 effect-plan으로 required cleanup에 포함한다
- **AND** orchestration 재시작 뒤에도 미완료된 직접 원인 Notification 정리를 재개한다
- **AND** 해당 Follow 객체와 직접 연결되지 않은 기존 Notification은 저장 상태와 Read State를 유지한다

## Deferred scope

현재 Follow·Follow Request·Reply·Reaction·Repost source 전체에 Profile Block 신규 Notification 생성 policy를 연결하는 일은
`PROD-327`의 후속 범위이며, 이 change의 requirement·task·완료 증거에 포함하지 않는다. 숨겨진 Notification의 비동기 물리
cleanup lifecycle 역시 `PROD-328`의 후속 범위로 남긴다.
