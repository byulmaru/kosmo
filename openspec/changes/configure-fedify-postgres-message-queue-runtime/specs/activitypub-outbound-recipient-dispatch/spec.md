## MODIFIED Requirements

### Requirement: 공통 Fedify direct delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, PROD-447, PROD-448, PROD-512, PROD-533. 시스템은 이미 구성된 Activity, 발신 Local Profile·Instance identity와 확장된 recipient를 사용해 공식 Fedify PostgreSQL outbox/fan-out queue handoff를 한 공통 경계에서 실행해야 한다(MUST). Activity의 종류·identity·audience와 domain target 의미를 dispatcher가 재정의해서는 안 된다(MUST NOT).

#### Scenario: recipient가 있는 delivery

- **WHEN** 하나 이상의 usable recipient가 확장된다
- **THEN** dispatcher는 발신 Local Instance의 signing context로 같은 Activity를 Fedify queue에 handoff한다
- **AND** shared-inbox preference를 Fedify fan-out에 적용한다
- **AND** activity lifecycle이 이미 정의한 Fedify ordering option이 있으면 그대로 보존하고 dispatcher가 새 ordering key를 만들지 않는다

#### Scenario: recipient가 없는 delivery

- **WHEN** 모든 target이 빈 집합으로 확장되거나 eligibility에서 제외된다
- **THEN** dispatcher는 Fedify queue handoff 또는 remote HTTP delivery를 호출하지 않는다
- **AND** no-op 결과를 정상적으로 반환한다

#### Scenario: queue handoff 실패

- **WHEN** Fedify PostgreSQL queue handoff가 실패한다
- **THEN** dispatcher는 호출자가 실패를 관측하고 격리할 수 있도록 오류를 반환한다
- **AND** dispatcher는 이미 commit된 domain state를 rollback하지 않는다

#### Scenario: accepted handoff 뒤 remote delivery 실패

- **WHEN** Fedify queue가 handoff를 수락한 뒤 remote HTTP delivery가 실패한다
- **THEN** dispatcher caller는 remote retry를 중복 수행하지 않는다
- **AND** retry, 기존 ordering option 실행과 shared inbox recipient 병합은 Fedify가 수행한다
