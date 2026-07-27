## ADDED Requirements

### Requirement: Reply Parent FK future physical-delete action

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/decisions/0017-activitypub-local-post-note.md`, PROD-494. 시스템은 현재 physical delete 행동을 추가하지 않으면서 Reply Parent의 Tombstone 보존 계약과 향후 실제 Post row 삭제에 대한 FK 참조 동작을 서로 다르게 정의해야 한다(MUST).

#### Scenario: Parent Tombstone 뒤 관계 보존

- **WHEN** Reply Parent가 저장된 뒤 Parent Post가 Tombstone으로 전이된다
- **THEN** 시스템은 Reply에 저장된 직접 Reply Parent 식별자를 유지한다
- **AND** Parent Tombstone을 이유로 Reply row를 삭제하거나 관계를 `null`로 바꾸지 않는다

#### Scenario: Future Parent row physical delete constraint

- **WHEN** 향후 또는 관리 작업에서 Reply Parent로 참조되는 Post row가 실제로 삭제된다
- **THEN** 데이터베이스는 살아 있는 Reply Post의 Reply Parent 관계만 `null`로 만든다
- **AND** Reply Post 자체와 그 Content를 cascade 삭제하지 않는다

#### Scenario: No physical delete application flow

- **WHEN** 이번 capability를 구현한다
- **THEN** 시스템은 Parent Post row를 물리 삭제하는 application action, service 또는 API를 추가하지 않는다
- **AND** 기존 Post 삭제는 Tombstone 전이를 계속 사용한다

#### Scenario: FK delete action migration

- **WHEN** 기존 Reply Parent 관계와 Tombstone Parent가 있는 데이터베이스에 변경 migration을 적용한다
- **THEN** 시스템은 기존 Reply Parent ID와 Post lifecycle state를 변경하지 않는다
- **AND** 기존 FK를 실제 Parent row 삭제 시 `SET NULL`하는 참조 동작으로 정렬한다
