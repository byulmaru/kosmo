## MODIFIED Requirements

### Requirement: Remote actor materialization through Fedify lookup

**Authority / Provenance:** `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`, `PROD-248`. 시스템은 명시적인 qualified handle 검색을 `RemoteProfileLookupInput { domain, handle, profileId? }`로 public `remoteProfileLookupWorkflow`에 dispatch하고, Workflow가 URI lookup Activity에서 받은 canonical `actorUri`를 `materializeRemoteProfileActorActivity`에 전달해 remote ActivityPub actor를 kosmo `Profile`로 materialize해야 한다(MUST). Materialize Activity가 stored/missing 판정, 현재 state·TTL 확인과 missing fetch 경계를 소유하고, 반환된 `needsRefresh`가 true일 때만 Workflow가 stale refresh child를 시작해야 한다(MUST).

#### Scenario: Look up and materialize remote actor from a qualified handle

- **WHEN** 인증된 caller가 명시적인 qualified handle을 `mode: 'execute'` 또는 `mode: 'start'`로 조회한다
- **THEN** caller는 `RemoteProfileLookupInput { domain, handle, profileId? }`로 `runWorkflow(remoteProfileLookupWorkflow, ...)`를 호출하고 native conflict/reuse policy를 선택한다
- **AND** `lookupRemoteActorUriActivity`는 저장된 canonical actor URI를 먼저 재사용하고, 없을 때만 WebFinger의 ActivityPub self link에서 canonical actor URI를 확인한다
- **AND** Workflow는 URI lookup Activity에서 받은 canonical `actorUri`와 선택적인 acting `profileId`를 `materializeRemoteProfileActorActivity`에 전달하며, 이 materialization boundary에는 handle lookup input을 전달하지 않는다
- **AND** `materializeRemoteProfileActorActivity`는 stored/missing 판정과 현재 Profile/Instance 상태·actor TTL 확인을 소유하며 `{ profileId, needsRefresh }` non-null 최소 JSON-safe DTO를 반환한다. Activity 모듈의 private stored-state query에서 missing을 `null`로 관찰할 수 있지만, missing이면 materialize Activity가 `refreshRemoteProfileActorActivity`의 fetch·persist를 ordinary call로 수행한 뒤 새 target ID를 `{ profileId: id, needsRefresh: false }` 의미로 반환한다. DTO의 `profileId`는 cached 또는 새로 생성한 target Remote Profile ID이고 input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다
- **AND** 전달된 actor URI에 저장된 remote Profile 또는 actor metadata가 없어도 새 remote `Profile`을 materialize할 수 있다
- **AND** `profileId`가 없으면 configured Local Instance의 canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용하며, 필요한 actor 정보가 없으면 origin을 추측하지 않고 실패 처리한다
- **AND** `profileId`는 기존 unsigned lookup의 권한을 대신하지 않는다
- **AND** WebFinger discovery는 Actor Instance 상태 판정 전에 수행할 수 있지만 WebFinger 응답만으로 Instance를 추출하거나 상태를 판정하지 않는다
- **AND** 기존 instance가 없으면 canonical actor URI host의 normalized domain에 ActivityPub instance를 생성한다
- **AND** Fedify가 ActivityPub actor 객체를 반환하면 해당 actor의 canonical actor URI를 remote identity로 처리한다
- **AND** actor URI가 기존 ActivityPub remote profile actor metadata에 연결되어 있으면 해당 remote profile을 갱신하고, 없으면 새 `Profile`을 생성한다
- **AND** `needsRefresh: false` 분기의 Workflow는 외부 fetch나 refresh child 없이 cached 또는 새로 생성한 Profile identity를 반환한다
- **AND** `needsRefresh: true`이면 Workflow는 DTO의 `profileId`를 cached target identity로만 사용하고 URI lookup Activity에서 받은 `actorUri`와 Workflow input의 optional `profileId`를 별도 refresh ID prefix child에 그대로 전달한다. Child는 `refreshRemoteProfileActorActivity`를 실행하도록 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`으로 시작한 뒤 child start acknowledgement를 받고 cached Profile identity를 반환한다
- **AND** 이미 실행 중인 같은 refresh child는 정상 coalescing으로 처리하고, 그 밖의 child start·execution failure는 관측한 뒤 cached Profile identity를 반환한다
- **AND** `mode: 'execute'` caller는 materialize Activity의 결과와 missing fetch·persist 완료를 기다리고, `needsRefresh: true`이면 refresh child start acknowledgement 뒤 cached Profile identity를 받으며, `mode: 'start'` caller는 모든 결과에서 public lookup Workflow의 native start acknowledgement만 받은 뒤 반환한다
- **AND** 두 mode의 caller는 같은 `remoteProfileLookupWorkflow` 종류와 실행 경로를 사용한다

#### Scenario: Keep a stale refresh child after coordinator closure

- **WHEN** public lookup Workflow가 stale 상태를 확인하고 refresh child의 실행 시작 확인을 기록한다
- **THEN** public Workflow는 child 완료를 기다리지 않고 cached Profile identity를 반환할 수 있다
- **AND** refresh child는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`에 따라 public Workflow의 완료·실패·취소 뒤에도 필요한 Activity와 Profile 저장을 계속할 수 있다
- **AND** 이미 실행 중인 같은 child는 정상 coalescing으로 처리하며, 그 밖의 child start failure는 관측하고 cached Profile identity를 유지한다

#### Scenario: Keep a public lookup child after parent closure

- **WHEN** 다른 Workflow가 public lookup Workflow를 비동기 child로 시작하고 child 실행 시작 확인이 parent 종료 전에 기록된다
- **THEN** parent는 child 완료를 기다리지 않고 child start acknowledgement 뒤 종료할 수 있다
- **AND** child caller가 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시하면 parent의 완료·실패·취소 뒤에도 child Workflow가 URI lookup과 Profile 저장을 계속할 수 있다
- **AND** parent 취소는 시작 확인 이후 child Workflow에 전파되지 않는다

#### Scenario: Refresh a stored remote actor by canonical URI

- **WHEN** stale remote actor materialization이 저장된 canonical actor URI와 선택적인 `profileId`를 가진 refresh child로 실행된다
- **THEN** `refreshRemoteProfileActorActivity`는 저장된 `actorUri`를 Fedify lookup target으로 사용하고 `acct:{handle}@{domain}` lookup을 다시 수행하지 않는다
- **AND** Fedify가 반환한 actor의 canonical URI가 예상한 `actorUri`와 일치하는지 확인하기 전에는 Profile 또는 actor metadata를 저장하지 않는다
- **AND** URI가 일치하면 기존 actor identity에 연결된 같은 `Profile`을 갱신한다
- **AND** 같은 canonical URI에서 actor `preferredUsername`이 바뀌어도 새 Profile을 만들지 않고 같은 Profile의 handle, normalized handle과 qualified handle을 갱신한다
- **AND** 반환 URI가 예상한 `actorUri`와 다르면 materialization을 실패 처리하고 Profile 또는 actor metadata를 변경하지 않는다

#### Scenario: Reject unresolved or non-actor lookup

- **WHEN** Fedify lookup이 actor를 해석하지 못하거나 actor가 아닌 객체를 반환한다
- **THEN** 시스템은 remote actor materialization을 실패로 처리한다
- **AND** 시스템은 해당 객체를 `Profile`로 저장하지 않는다

#### Scenario: Reject materialization for unavailable instance

- **WHEN** 저장 actor 또는 actor metadata가 없어 외부 조회가 필요한 materialization에서 `actorUri` host의 normalized domain에 해당하는 기존 instance 상태가 `SUSPENDED` 또는 `UNRESPONSIVE`이다
- **THEN** 시스템은 Actor document lookup과 remote actor materialization을 수행하지 않고 실패로 처리한다
- **AND** 시스템은 새 `Profile`을 만들거나 기존 profile을 refresh하지 않는다

#### Scenario: Reuse existing actor URI

- **WHEN** remote actor materialization 결과의 actor URI가 이미 ActivityPub remote profile actor metadata에 저장되어 있다
- **THEN** 시스템은 같은 actor URI에 연결된 기존 remote `Profile`을 같은 remote profile로 간주한다
- **AND** 시스템은 새 `Profile`을 만들지 않고 기존 row를 갱신한다

#### Scenario: Store actor under its canonical domain

- **WHEN** Fedify lookup이 제공된 canonical `actorUri`와 일치하는 actor를 반환한다
- **THEN** 시스템은 canonical actor URI host의 ActivityPub instance에 remote `Profile`을 저장한다
- **AND** 기존 actor가 비canonical alias instance에 저장돼 있으면 canonical actor URI instance로 이동한다
- **AND** actorUri domain만을 위한 별도 `Profile` alias를 만들지 않는다
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
- **AND** refresh가 성공하면 기존 `createdAt` 보존 정책을 지키면서 `Profile` projection과 actor metadata를 갱신한다

#### Scenario: Keep stale actor when the follow-up refresh child fails

- **WHEN** 저장된 active remote profile이 있고 follow-up refresh child가 이미 실행 중이거나 child start 또는 materialization 실행이 실패한다
- **THEN** public Workflow는 cached Profile identity를 계속 반환할 수 있다
- **AND** 시스템은 실패한 resolve에 대한 negative cache row를 만들지 않는다

#### Scenario: Do not synthesize a database fallback when the public Workflow is unavailable

- **WHEN** caller가 public lookup Workflow를 start 또는 execute할 수 없다
- **THEN** caller는 cached Profile을 만들기 위해 stored row, actor metadata 또는 TTL을 직접 조회하지 않는다
- **AND** caller는 public Workflow start failure를 기존 materialization 또는 explicit-search 오류 경계로 전달한다

#### Scenario: Recheck freshness and instance state before refresh execution

- **WHEN** private stored-state query가 stale actor를 확인해 refresh child를 시작했지만 refresh Activity가 그 이후 시점에 실행된다
- **THEN** refresh Activity는 외부 lookup 전에 현재 저장된 Profile, actor metadata, TTL과 Instance 상태를 다시 확인한다
- **AND** 현재 actor가 fresh하거나 Profile이 inactive이거나 Instance가 `SUSPENDED` 또는 `UNRESPONSIVE`이면 remote lookup과 refresh를 수행하지 않는다
- **AND** 현재 저장된 Profile은 기존 lifecycle·visibility 규칙을 따른다

#### Scenario: Continue started workflow after caller timeout

- **WHEN** 동기 caller가 신규 materialization을 기다리던 중 응답 시간 제한에 도달한다
- **THEN** 이미 시작된 Temporal Workflow는 caller가 더 기다리지 않아도 계속 실행할 수 있다
- **AND** 시스템은 caller timeout 때문에 Workflow를 취소하거나 완료된 저장을 rollback하지 않는다

#### Scenario: Skip refresh for unresponsive instance

- **WHEN** 저장된 remote actor의 instance 상태가 `UNRESPONSIVE`이다
- **THEN** 시스템은 저장된 active profile을 stale 상태로 계속 반환할 수 있다
- **AND** 시스템은 refresh child 또는 remote actor lookup을 예약하거나 수행하지 않는다

#### Scenario: Do not materialize suspended instance

- **WHEN** remote actor가 속한 instance 상태가 `SUSPENDED`이다
- **THEN** 시스템은 actor refresh와 remote actor materialization을 시도하지 않는다
- **AND** 시스템은 해당 instance의 remote profile을 GraphQL object로 노출하지 않는다
