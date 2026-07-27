## ADDED Requirements

### Requirement: ActivityPub Reaction mapping integrity

**Authority / Provenance:** `docs/domain/objects/reaction.md`, PROD-498. Database는 remote activity URI와 Reaction 사이의 ActivityPub 전용 1:1 mapping을 저장해야 하며(MUST), mapping은
source Reaction 없이 존재할 수 없어야 한다(MUST NOT).

#### Scenario: Mapping row shape

- **WHEN** inbound Reaction mapping을 저장한다
- **THEN** mapping은 고유한 HTTP(S) activity URI와 하나의 non-null Reaction FK를 가진다
- **AND** 하나의 Reaction에는 최대 하나의 ActivityPub mapping만 연결된다

#### Scenario: Reaction lifecycle cascade

- **WHEN** source Reaction이 Undo 또는 다른 canonical cleanup으로 제거된다
- **THEN** 대응 ActivityPub mapping도 같은 transaction 또는 FK lifecycle로 제거된다
- **AND** orphan mapping이 남지 않는다

#### Scenario: Additive migration

- **WHEN** 기존 Post, Reaction과 ActivityPub data가 있는 database에 migration을 적용한다
- **THEN** 새 mapping table과 제약만 추가한다
- **AND** 기존 row를 rewrite하거나 backfill하지 않는다
