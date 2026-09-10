## MODIFIED Requirements

### Requirement: Remote actor materialization through Fedify lookup

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`, `PROD-248`. 시스템은 federation 내부 actor materialization 흐름에서 federated handle을 Fedify lookup으로 해석한 뒤 remote ActivityPub actor를 kosmo `Profile`로 materialize해야 하며(MUST), 신규 materialization과 stale refresh는 하나의 Temporal Workflow 실행 경로를 사용해야 한다(MUST).

#### Scenario: Materialize remote actor from federated handle

- **WHEN** federation 내부 service가 `@{handle}@{domain}` 형식의 federated handle materialization을 요청하고 caller가 동기 또는 비동기 결과 모드를 선택한다
- **THEN** Temporal Workflow와 Activity wire input은 초기 actor discovery key인 `handle` 또는 저장된 canonical actor URI를 이용한 refresh key인 `actorUri` 중 정확히 하나와 선택적인 `profileId`를 가진다
- **AND** `profileId`가 없으면 configured Local Instance의 canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용한다
- **AND** 전달된 `profileId`가 필요한 Remote actor 정보를 제공하지 않으면 origin을 추측하지 않고 materialization을 실패 처리한다
- **AND** `profileId`는 기존 unsigned lookup의 권한을 대신하지 않는다
- **AND** 시스템은 Fedify lookup 전에 normalized domain의 기존 ActivityPub instance를 조회한다
- **AND** 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 Fedify lookup 없이 materialization을 실패 처리한다
- **AND** 기존 instance가 없으면 normalized domain의 ActivityPub instance를 생성한다
- **AND** `handle` input branch에서는 하나의 Temporal Workflow 경로에서 Fedify lookup API로 `acct:{handle}@{domain}`을 해석한다
- **AND** Fedify가 ActivityPub actor 객체를 반환하면 해당 actor의 canonical actor URI를 remote identity로 처리한다
- **AND** 시스템은 요청 handle의 normalized value와 actor `preferredUsername`의 normalized value가 일치하는지 검증한다
- **AND** 시스템은 actor URI가 기존 ActivityPub remote profile actor metadata에 연결되어 있으면 해당 remote profile을 갱신하고, 없으면 새 `Profile`을 생성한다
- **AND** 동기 caller는 신규 materialization이 완료된 Profile identity를 받을 때까지 기다리고, 비동기 caller는 Workflow 시작 확인을 받은 뒤 반환한다
- **AND** 동기·비동기 caller는 같은 Workflow 종류와 실행 경로를 사용한다

#### Scenario: Keep an async child workflow after parent closure

- **WHEN** 다른 Workflow가 같은 materialization Workflow를 비동기 child로 시작하고 child 실행 시작 확인이 parent 종료 전에 기록된다
- **THEN** parent는 child 완료를 기다리지 않고 child start acknowledgement 뒤 종료할 수 있다
- **AND** parent가 완료·실패·취소되어도 child Workflow는 계속 실행해 필요한 Activity와 Profile 저장을 완료할 수 있다
- **AND** parent 취소는 시작 확인 이후 child Workflow에 전파되지 않는다

#### Scenario: Reject actor URI without federated handle lookup

- **WHEN** 저장된 remote actor identity를 가리키는 `actorUri` refresh도 아니고 federated handle lookup을 통과한 초기 materialization도 아닌 actor URI가 주어진다
- **THEN** 시스템은 remote profile을 저장하지 않는다
- **AND** 시스템은 actor URI만으로 `Profile`을 생성하지 않는다

#### Scenario: Refresh a stored remote actor by canonical URI

- **WHEN** stale remote actor materialization이 저장된 canonical actor URI와 선택적인 `profileId`를 가진 `actorUri` refresh input으로 실행된다
- **THEN** 시스템은 저장된 `actorUri`를 Fedify lookup target으로 사용하고 `acct:{handle}@{domain}` lookup을 다시 수행하지 않는다
- **AND** Fedify가 반환한 actor의 canonical URI가 예상한 `actorUri`와 일치하는지 확인하기 전에는 Profile 또는 actor metadata를 저장하지 않는다
- **AND** URI가 일치하면 기존 actor identity에 연결된 같은 `Profile`을 갱신한다
- **AND** 같은 canonical URI에서 actor `preferredUsername`이 바뀌어도 새 Profile을 만들지 않고 같은 Profile의 handle, normalized handle과 qualified handle을 갱신한다
- **AND** 반환 URI가 예상한 `actorUri`와 다르면 materialization을 실패 처리하고 Profile 또는 actor metadata를 변경하지 않는다

#### Scenario: Reject unresolved or non-actor lookup

- **WHEN** Fedify lookup이 actor를 해석하지 못하거나 actor가 아닌 객체를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 객체를 `Profile`로 저장하지 않는다

#### Scenario: Reject lookup username mismatch

- **WHEN** Fedify lookup이 `acct:{handle}@{domain}` 요청과 다른 normalized `preferredUsername`을 가진 actor를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 actor를 `Profile`로 저장하거나 기존 profile에 재연결하지 않는다

#### Scenario: Reject materialization for unavailable instance

- **WHEN** federated handle의 normalized domain에 해당하는 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이다
- **THEN** 시스템은 Fedify lookup을 수행하지 않고 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 새 `Profile`을 만들거나 기존 profile을 refresh하지 않는다

#### Scenario: Reuse existing actor URI

- **WHEN** remote actor materialization 결과의 actor URI가 이미 ActivityPub remote profile actor metadata에 저장되어 있다
- **THEN** 시스템은 같은 actor URI에 연결된 기존 remote `Profile`을 같은 remote profile로 간주한다
- **AND** 시스템은 새 `Profile`을 만들지 않고 기존 row를 갱신한다

#### Scenario: Store actor under its canonical domain

- **WHEN** Fedify lookup이 요청한 federated handle domain과 다른 normalized host를 가진 canonical actor URI를 반환한다
- **THEN** 시스템은 canonical actor URI host의 ActivityPub instance에 remote `Profile`을 저장한다
- **AND** 기존 actor가 요청 alias instance에 저장돼 있으면 canonical actor URI instance로 이동한다
- **AND** 요청 domain만을 위한 별도 `Profile` alias를 만들지 않는다
- **AND** DB-only remote handle 조회는 canonical actor domain에서 해당 profile을 찾는다

#### Scenario: Reject local actor URI collision

- **WHEN** remote actor materialization 결과의 actor URI가 configured local actor 또는 local profile actor metadata에 이미 저장되어 있다
- **THEN** 시스템은 identity 충돌로 materialization을 실패 처리한다
- **AND** 시스템은 local profile을 remote profile로 갱신하거나 반환하지 않는다

#### Scenario: Reject handle collision with different actor URI

- **WHEN** 같은 remote instance와 normalized handle 조합의 `Profile`이 이미 있지만 저장된 actor URI가 새 materialization 결과와 다르다
- **THEN** 시스템은 identity 충돌로 materialization을 실패 처리한다
- **AND** 시스템은 기존 `Profile`을 다른 actor URI로 재연결하지 않는다

### Requirement: Remote actor refresh

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`. 시스템은 저장된 remote actor가 stale 상태이면 기존 active profile 참조를 막지 않고, 신규 materialization과 같은 Temporal Workflow 경로에서 비동기 refresh를 예약·수행해야 한다(MUST).

#### Scenario: Return stale actor and schedule refresh

- **WHEN** 저장된 remote actor의 `lastFetchedAt`이 없거나 7일을 초과했고 federation 내부 service가 해당 remote actor를 사용해야 한다
- **THEN** 시스템은 저장된 active profile을 refresh 완료 전에도 반환한다
- **AND** 시스템은 신규 materialization과 같은 Temporal Workflow 경로의 refresh를 시작한다
- **AND** refresh input은 저장된 canonical actor URI를 `actorUri`로 재사용하고 qualified handle lookup을 다시 수행하지 않는다
- **AND** refresh가 성공하면 기존 `createdAt` 보존 정책을 지키면서 `Profile` projection과 actor metadata를 갱신한다

#### Scenario: Keep stale actor on refresh failure

- **WHEN** 저장된 active remote profile이 있고 Temporal refresh 또는 그 시작이 실패한다
- **THEN** 시스템은 기존 stale profile을 계속 반환할 수 있다
- **AND** 시스템은 실패한 resolve에 대한 negative cache row를 만들지 않는다

#### Scenario: Recheck freshness and instance state before refresh execution

- **WHEN** caller가 stale actor를 관찰해 Temporal refresh를 시작했지만 Activity가 그 이후 시점에 실행된다
- **THEN** Activity는 외부 lookup 전에 현재 저장된 Profile, actor metadata와 Instance 상태를 다시 확인한다
- **AND** 현재 actor가 fresh하거나 Profile이 inactive이거나 Instance가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 remote lookup과 refresh를 수행하지 않는다
- **AND** 현재 저장된 Profile은 기존 lifecycle·visibility 규칙을 따른다

#### Scenario: Continue started workflow after caller timeout

- **WHEN** 동기 caller가 신규 materialization을 기다리던 중 응답 시간 제한에 도달한다
- **THEN** 이미 시작된 Temporal Workflow는 caller가 더 기다리지 않아도 계속 실행할 수 있다
- **AND** 시스템은 caller timeout 때문에 Workflow를 취소하거나 완료된 저장을 rollback하지 않는다

#### Scenario: Skip refresh for unresponsive instance

- **WHEN** 저장된 remote actor의 instance 상태가 `UNRESPONSIVE`이다
- **THEN** 시스템은 저장된 active profile을 stale 상태로 계속 반환할 수 있다
- **AND** 시스템은 remote actor refresh Workflow를 예약하거나 수행하지 않는다

#### Scenario: Do not materialize suspended instance

- **WHEN** remote actor가 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 actor refresh와 remote actor materialization을 시도하지 않는다
- **AND** 시스템은 해당 instance의 remote profile을 GraphQL object로 노출하지 않는다
