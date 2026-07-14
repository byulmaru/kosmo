## MODIFIED Requirements

### Requirement: Relay Node identity

API는 DB UUID를 GraphQL Node ID로 사용하고 UUID에 포함된 테이블 식별자로 Node resolution route를 판별해야 한다(MUST). 하나의 table discriminator가 여러 concrete GraphQL object에 대응하면 해당 route는 row를 load한 뒤 저장 kind로 concrete type을 결정해야 한다(MUST).

#### Scenario: Return node id

- **WHEN** GraphQL Node object가 ID를 반환한다
- **THEN** 시스템은 DB UUID 문자열을 그대로 반환한다

#### Scenario: Resolve node type

- **WHEN** 클라이언트가 GraphQL Node ID를 제공한다
- **THEN** 시스템은 UUID 문자열에서 테이블 식별자를 읽고 등록된 GraphQL object type 또는 Node resolution route로 해석한다
- **AND** 알 수 없는 테이블 식별자는 오류로 처리한다

#### Scenario: Shared discriminator polymorphic Node resolve

- **WHEN** 하나의 table discriminator가 GraphQL interface를 구현하는 여러 concrete object에 대응한다
- **THEN** 시스템은 discriminator를 concrete typename 하나에 중복 등록하거나 loadable Node ref가 없는 interface typename에 직접 route하지 않는다
- **AND** discriminator별 Node resolution route가 row를 load한 뒤 저장 kind를 등록된 concrete object type으로 해석한다
- **AND** 지원하지 않는 kind는 다른 concrete type으로 오라우팅하지 않고 object 없음으로 처리한다

#### Scenario: Batch load nodes

- **WHEN** API가 같은 Node resolution route의 여러 ID를 resolve한다
- **THEN** 시스템은 대상 테이블의 `id` 컬럼으로 일괄 조회한다
- **AND** 조회 결과는 요청된 ID 순서에 맞춰 반환된다
- **AND** resolved object는 dataloader cache에 저장될 수 있다

#### Scenario: Context-aware node loading

- **WHEN** API가 Node ID를 object로 load한다
- **THEN** 시스템은 해당 object type의 조회 가능성 규칙을 load 단계에서 적용할 수 있다
- **AND** 조회할 수 없는 ID는 object 없음으로 처리한다
