## ADDED Requirements

### Requirement: Active Profile Block rejects inbound Follow transitions

**Authority / Provenance:** `docs/domain/objects/profile-block.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`, `PROD-822`. Active Profile Block 관계의 두 Profile 사이에 검증된 ActivityPub inbound Follow 또는 Accept가 유입되면 새 Follow Request·Follow Relationship을 만들기 전에 공통 pair admission으로 거부해야 한다(MUST). 이 거부는 예상 가능한 도메인 정책 결과로 관찰해야 하며(MUST), 내부 오류로 보고하거나 다시 던져서는 안 된다(MUST NOT). 기존 inbound identity 검증과 ActivityPub no-echo 경계는 유지해야 한다(MUST).

#### Scenario: Active Block 중 inbound Follow를 거부한다

- **WHEN** Active Profile Block 관계의 Remote Profile이 상대 Local Profile을 향한 검증된 inbound Follow를 보낸다
- **THEN** 시스템은 새 Follow Request·Follow Relationship을 저장하지 않는다
- **AND** ingress는 결과를 예상 가능한 정책 거절로 관찰하고 내부 오류로 보고하거나 다시 던지지 않는다
- **AND** outbound Follow·Undo echo를 만들지 않는다

#### Scenario: Active Block 중 inbound Accept를 거부한다

- **WHEN** Active Profile Block 관계의 Remote Profile이 상대 Local Profile의 기존 pending Follow를 향한 검증된 inbound Accept를 보낸다
- **THEN** 시스템은 pending Follow Request를 Follow Relationship으로 전이하지 않는다
- **AND** ingress는 결과를 예상 가능한 정책 거절로 관찰하고 내부 오류로 보고하거나 다시 던지지 않는다
- **AND** 다른 Follow generation이나 관계를 변경하지 않고 outbound Follow·Undo echo를 만들지 않는다
