## MODIFIED Requirements

### Requirement: Remote follower direct delivery

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/architecture/core-services.md`, `PROD-448`, `PROD-512`, `PROD-629`; MUST 준수한다. 시스템은 Local Profile Update를 공통 outbound recipient dispatcher를 통해 usable established ActivityPub remote followers 대상으로 Fedify PostgreSQL outbox/fan-out queue에 handoff하고, follower 부재와 handoff·remote delivery 실패를 committed Profile 결과에서 격리하는 것을 MUST 보장한다.

#### Scenario: Deliver to active remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 있다
- **THEN** 시스템은 공통 recipient dispatcher로 같은 Update activity를 queue에 handoff한다
- **AND** 동일 actor는 한 recipient로 중복 제거한다
- **AND** 유효한 shared inbox가 있으면 Fedify shared inbox preference를 적용한다

#### Scenario: No remote followers

- **WHEN** 변경된 Local Profile에 usable established ActivityPub remote follower가 없다
- **THEN** 시스템은 queue handoff 또는 remote HTTP delivery를 호출하지 않는다
- **AND** committed Profile update를 성공 결과로 유지한다

#### Scenario: Delivery failure isolation

- **WHEN** commit 이후 Update projection 또는 queue handoff가 실패한다
- **THEN** 시스템은 Profile ID와 오류를 post-commit 관측 경계에 기록한다
- **AND** committed Profile과 GraphQL mutation 성공 결과를 rollback하거나 실패로 바꾸지 않는다
- **AND** handoff 수락 뒤 remote delivery retry와 최종 실패는 Fedify consumer가 관측한다

#### Scenario: Commit과 queue handoff 사이 loss window

- **WHEN** application process가 Profile commit 이후 queue handoff 수락 전에 종료된다
- **THEN** 이 capability는 transactional domain intent, relay 또는 delivery history를 보장하지 않는다
- **AND** committed Profile 결과는 유지된다

#### Scenario: Queue handoff 이후 producer 종료

- **WHEN** Fedify PostgreSQL queue가 Update를 수락한 뒤 producer process가 종료된다
- **THEN** 수락된 message는 별도 Fedify consumer가 처리할 수 있다
- **AND** producer는 remote delivery를 직접 재시도하지 않는다
