## MODIFIED Requirements

### Requirement: delivery를 commit 이후 실패 격리 경계에서 실행한다

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-448, PROD-499. 시스템은 Reaction domain transaction이 commit된 뒤 Fedify PostgreSQL queue에 activity를 handoff해야 한다(MUST). queue handoff 실패는 관측 가능하게 기록해야 하지만(MUST), 이미 commit된 Reaction 추가·삭제나 application 응답을 실패로 바꾸지 않아야 한다(MUST NOT). handoff 이후 remote delivery retry와 최종 실패는 Fedify가 소유해야 한다(MUST).

#### Scenario: 원본 activity queue handoff가 실패한다

- **WHEN** Reaction 생성 transaction이 commit된 뒤 Fedify queue handoff가 실패한다
- **THEN** 시스템은 실패를 기록하고 committed Reaction과 성공 application 결과를 유지한다

#### Scenario: Undo queue handoff가 실패한다

- **WHEN** Reaction 삭제 transaction이 commit된 뒤 Fedify queue handoff가 실패한다
- **THEN** 시스템은 실패를 기록하고 committed 삭제와 성공 application 결과를 유지한다

#### Scenario: commit 전에는 전달하지 않는다

- **WHEN** Reaction domain transaction이 실패하거나 rollback된다
- **THEN** 시스템은 Reaction activity 또는 `Undo` queue handoff를 시도하지 않는다

#### Scenario: accepted handoff 뒤 remote delivery가 실패한다

- **WHEN** Fedify queue가 Reaction activity를 수락한 뒤 remote inbox delivery가 실패한다
- **THEN** producer는 application action을 다시 실패시키지 않는다
- **AND** retry, 기존 Reaction ordering option 실행과 permanent failure 판단은 Fedify queue consumer가 수행한다

### Requirement: 현재 직접 delivery 제한을 유지한다

**Authority / Provenance:** `docs/architecture/core-services.md`, PROD-448, PROD-499. 시스템은 PROD-448 queue mode에서 공식 Fedify PostgreSQL MessageQueue handoff를 사용해야 하며(MUST), transactional outbox, NATS/custom queue, Kosmo-owned durable retry, delivery history 또는 사용자용 delivery status를 추가하지 않아야 한다(MUST NOT).

#### Scenario: application process가 commit 뒤 handoff 전에 종료된다

- **WHEN** domain transaction commit 후 Fedify queue handoff 전에 process가 종료된다
- **THEN** 시스템은 domain commit과 handoff 사이를 transactional하게 복구하지 않으며 committed Reaction 결과는 그대로 유지된다

#### Scenario: queue가 handoff를 수락한다

- **WHEN** Fedify PostgreSQL queue가 Reaction activity handoff를 수락한다
- **THEN** accepted activity는 producer process 재시작과 remote retry를 견뎌야 한다
- **AND** transport runtime은 `fedify-postgres-message-queue-runtime` capability가 소유한다
