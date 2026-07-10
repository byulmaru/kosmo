## MODIFIED Requirements

### Requirement: Remote actor refresh

시스템은 저장된 remote actor가 stale 상태이면 기존 active profile 참조를 막지 않고 federation 내부 materialization 경로에서 비동기 refresh를 예약/수행해야 한다(MUST). 단, `activitypub-remote-post-ingestion`의 verified inbox `Create` 처리 경로는 저장된 actor와 profile row를 그대로 사용하고 actor profile refresh를 예약하거나 수행하지 않아야 한다(MUST).

#### Scenario: Return stale actor and schedule refresh

- **WHEN** 저장된 remote actor의 `lastFetchedAt`이 없거나 7일을 초과했다
- **AND** inbox Note ingestion이 아닌 federation 내부 service가 해당 remote actor를 사용해야 한다
- **THEN** 시스템은 저장된 active profile을 refresh 완료 전에도 반환한다
- **AND** 시스템은 Fedify lookup 기반 remote actor refresh를 비동기적으로 예약/수행한다
- **AND** refresh가 성공하면 기존 `createdAt` 보존 정책을 지키면서 `Profile` projection과 actor metadata를 갱신한다

#### Scenario: Use stale actor for inbox Note ingestion without profile refresh

- **WHEN** 저장된 remote actor의 `lastFetchedAt`이 없거나 7일을 초과했다
- **AND** `activitypub-remote-post-ingestion` handler가 verified inbox `Create`를 처리한다
- **THEN** 시스템은 저장된 active actor와 profile row를 그대로 사용한다
- **AND** 시스템은 WebFinger lookup, remote actor materialization 또는 actor profile refresh를 예약하거나 수행하지 않는다
- **AND** Fedify가 inbox signature/key verification 또는 accepted `Create.object` hydration에 필요한 protocol fetch를 수행하는 것은 actor profile refresh로 취급하지 않는다

#### Scenario: Keep stale actor on refresh failure

- **WHEN** 저장된 active remote profile이 있고 비동기 actor refresh가 실패한다
- **THEN** 시스템은 기존 stale profile을 계속 반환할 수 있다
- **AND** 시스템은 실패한 resolve에 대한 negative cache row를 만들지 않는다

#### Scenario: Skip refresh for unresponsive instance

- **WHEN** 저장된 remote actor의 instance 상태가 `UNRESPONSIVE`이다
- **THEN** 시스템은 저장된 active profile을 stale 상태로 계속 반환할 수 있다
- **AND** 시스템은 remote actor refresh를 예약하거나 수행하지 않는다

#### Scenario: Do not materialize suspended instance

- **WHEN** remote actor가 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 actor refresh와 remote actor materialization을 시도하지 않는다
- **AND** 시스템은 해당 instance의 remote profile을 GraphQL object로 노출하지 않는다
