## MODIFIED Requirements

### Requirement: Post lifecycle과 delivery failure isolation

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, PROD-447, PROD-448, PROD-512, PROD-533. 통합 core `createPost`·`deletePost` action은 Local content Post lifecycle을 소유해야 하며(MUST), GraphQL resolver나 queue consumer가 lifecycle을 직접 조립해서는 안 된다(MUST NOT). Top-level transaction commit 뒤 dispatcher를 호출하고 queue handoff 실패는 committed application 결과와 격리해 관측해야 한다(MUST).

#### Scenario: Create 또는 Delete handoff 실패

- **WHEN** top-level Local Post 생성 또는 삭제 transaction이 commit된 뒤 Fedify queue handoff가 실패한다
- **THEN** 시스템은 Post identity와 handoff 실패를 관측 가능하게 기록한다
- **AND** committed Post·Content 또는 Tombstone 결과를 유지한다
- **AND** application action은 committed 결과를 나타내는 성공 결과를 반환한다

#### Scenario: transaction rollback

- **WHEN** Local Post 생성 또는 삭제 transaction이 rollback된다
- **THEN** 시스템은 해당 state transition의 Create 또는 Delete Activity를 queue에 handoff하거나 외부에 전달하지 않는다

#### Scenario: caller-owned transaction의 현재 제한

- **WHEN** Local Post action이 caller transaction에 합류하고 committed-read delivery projection이 uncommitted Post를 찾지 못한다
- **THEN** 시스템은 rollback될 수 있는 Activity를 queue에 먼저 handoff하지 않는다
- **AND** outer commit 뒤 lifecycle을 재실행하지 않는 caller의 누락을 queue consumer 또는 transport relay가 보완하지 않는다

### Requirement: 현재 direct delivery 제한

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: PROD-448, PROD-512, PROD-533. 시스템은 queue producer mode가 활성화된 runtime에서 Local Post Activity를 Fedify PostgreSQL MessageQueue에 handoff하고 remote HTTP delivery를 요청 process에서 직접 실행하지 않아야 한다(MUST NOT). 이 capability는 transactional domain outbox/relay, delivery history 또는 사용자용 delivery status를 추가해서는 안 된다(MUST NOT). Domain commit 뒤 queue handoff 수락 전 process 종료로 Activity가 유실될 수 있는 비원자적 경계는 유지된다(MUST).

#### Scenario: commit 뒤 handoff 전 process 종료

- **WHEN** Local Post state가 commit된 뒤 Fedify queue handoff가 수락되기 전에 API process가 종료된다
- **THEN** committed Post state는 유지된다
- **AND** 시스템은 유실된 Activity를 복원할 transactional domain intent나 relay record를 제공하지 않는다

#### Scenario: handoff 수락 뒤 process 종료

- **WHEN** Fedify PostgreSQL queue가 Create 또는 Delete를 수락한 뒤 producer process가 종료된다
- **THEN** 수락된 message는 별도 Fedify consumer가 다시 처리할 수 있다
- **AND** producer는 remote HTTP delivery를 직접 재시도하지 않는다
