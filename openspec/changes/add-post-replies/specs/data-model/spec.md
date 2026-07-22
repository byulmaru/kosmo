## ADDED Requirements

### Requirement: Post Reply Parent 관계 저장

**Authority / Provenance:** `docs/domain/decisions/0014-post-structure-relations.md`, `docs/domain/objects/post.md`, `PROD-388`, `PROD-393` 시스템은 Post가 다른 Post 하나를 nullable 직접 Reply Parent로 참조할 수 있게 저장해야 하며(MUST), Reply Parent와 Repost Source를 서로 독립적인 관계로 유지해야 한다(MUST).

#### Scenario: nullable Reply Parent migration

- **WHEN** 기존 Post, Repost와 Quote 행이 있는 데이터베이스에 Reply Parent migration을 적용한다
- **THEN** 시스템은 기존 행의 Reply Parent를 `null`로 유지한다
- **AND** 기존 Post, Repost와 Quote 행 및 Repost Source 관계를 변경하지 않는다

#### Scenario: Reply Parent와 Repost Source 동시 저장

- **WHEN** Content가 있는 Post가 Reply Parent와 Repost Source를 함께 가진다
- **THEN** 시스템은 두 관계를 각각의 직접 Post self-reference로 저장한다
- **AND** 두 관계가 같은 대상 Post를 참조하는 것도 허용한다

#### Scenario: Reply Parent 직접 self-reference 거부

- **WHEN** Post의 Reply Parent로 같은 Post의 식별자를 저장하려 한다
- **THEN** 데이터베이스는 그 직접 self-reference를 거부한다

#### Scenario: Parent Tombstone 뒤 관계 보존

- **WHEN** Reply Parent가 저장된 뒤 Parent Post가 Tombstone이 된다
- **THEN** 시스템은 Reply에 저장된 직접 Reply Parent 식별자를 유지한다
- **AND** Parent Tombstone을 이유로 Reply 행을 삭제하거나 관계를 `null`로 바꾸지 않는다
