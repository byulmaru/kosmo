## MODIFIED Requirements

### Requirement: 공통 Fedify direct delivery

**Authority / Provenance:** 이 요구사항은 반드시 준수해야 한다(MUST). 근거: `docs/architecture/core-services.md`, PROD-447, PROD-512, PROD-533. 시스템은 이미 구성된 Activity, 발신 Local Profile·Instance identity와 확장된 recipient를
사용해 Fedify direct delivery를 한 공통 경계에서 실행해야 한다(MUST). Activity의 종류·identity·audience와
domain target 의미를 dispatcher가 재정의해서는 안 된다(MUST NOT).

#### Scenario: recipient가 있는 delivery

- **WHEN** 하나 이상의 usable recipient가 확장된다
- **THEN** dispatcher는 발신 Local Instance의 signing context로 같은 Activity를 전달한다
- **AND** shared-inbox preference를 Fedify delivery에 적용한다
- **AND** 현재 direct delivery에 ordering key를 제공하지 않는다

#### Scenario: recipient가 없는 delivery

- **WHEN** 모든 target이 빈 집합으로 확장되거나 eligibility에서 제외된다
- **THEN** dispatcher는 remote HTTP delivery를 호출하지 않는다
- **AND** no-op 결과를 정상적으로 반환한다

#### Scenario: delivery 실패

- **WHEN** Fedify direct delivery가 remote HTTP 오류로 실패한다
- **THEN** dispatcher는 호출자가 실패를 관측하고 격리할 수 있도록 오류를 반환한다
- **AND** dispatcher는 이미 commit된 domain state를 rollback하지 않는다
