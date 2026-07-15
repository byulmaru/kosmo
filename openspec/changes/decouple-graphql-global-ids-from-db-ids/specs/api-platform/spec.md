## MODIFIED Requirements

### Requirement: Relay Node identity

API는 concrete GraphQL typename과 DB UUID를 포함하는 opaque global ID를 GraphQL Node ID로 사용하고, global ID의 concrete typename으로 Node loader를 선택해야 한다(MUST).

#### Scenario: Return node id

- **WHEN** concrete GraphQL Node object가 ID를 반환한다
- **THEN** 시스템은 concrete GraphQL typename과 underlying DB UUID를 포함하는 opaque global ID를 반환한다
- **AND** DB UUID 문자열을 GraphQL Node ID로 그대로 노출하지 않는다

#### Scenario: Resolve node type

- **WHEN** 클라이언트가 유효한 GraphQL Node global ID를 제공한다
- **THEN** 시스템은 global ID에서 concrete GraphQL typename과 DB UUID를 decode한다
- **AND** concrete typename에 등록된 Node loader를 DB UUID로 호출한다
- **AND** UUID version이나 table discriminator로 GraphQL type을 추론하지 않는다

#### Scenario: Reject legacy raw UUID node id

- **WHEN** 클라이언트가 raw DB UUID를 GraphQL Node ID로 제공한다
- **THEN** 시스템은 compatibility fallback 없이 invalid global ID로 처리한다

#### Scenario: Reject invalid or unsupported typename

- **WHEN** 클라이언트가 문법적으로 잘못된 global ID, 알 수 없는 typename 또는 loadable concrete Node가 아닌 typename을 제공한다
- **THEN** 시스템은 해당 ID를 유효한 Node로 resolve하지 않는다
- **AND** interface typename을 concrete loader 대신 사용하지 않는다

#### Scenario: Do not trust mismatched typename

- **WHEN** global ID의 typename에 등록된 loader가 underlying DB UUID에 해당하는 조회 가능한 row를 찾지 못한다
- **THEN** 시스템은 다른 table이나 type을 추론해 재시도하지 않는다
- **AND** 해당 ID는 object 없음으로 처리한다

#### Scenario: Batch load nodes

- **WHEN** API가 같은 concrete Node type의 여러 global ID를 resolve한다
- **THEN** 시스템은 decode된 DB UUID를 대상 테이블의 `id` 컬럼으로 일괄 조회한다
- **AND** 조회 결과와 object 없음 결과는 요청된 ID 순서에 맞춰 반환된다
- **AND** resolved object는 dataloader cache에 저장될 수 있다

#### Scenario: Context-aware node loading

- **WHEN** API가 global ID를 Node object로 load한다
- **THEN** 시스템은 해당 concrete object type의 조회 가능성 규칙을 load 단계에서 적용할 수 있다
- **AND** 조회할 수 없는 DB UUID는 object 없음으로 처리한다
