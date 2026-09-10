## Context

이 결정 기록은 `PROD-808`의 확정 범위와 remote actor materialization·Profile search delta spec, Temporal 전환 설계를 반영한다. 사용자와 canonical domain 문서가 정한 observable contract와 구현 경로에서 선택해야 하는 durable mechanism을 분리해 기록한다.

## Decision Records

### Remote actor lookup caller contract

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/architecture/core-services.md`, `PROD-808`
- Status: Active
- Context / Problem: 검색 경계의 qualified handle lookup은 호출자가 context와 origin을 조합하게 하고 있으며, 새 Temporal 경로에서도 기존 unsigned lookup과 origin 선택 조건을 잃으면 안 된다.
- Decision Outcome: public materialization caller는 canonical `actorUri`와 선택적인 `profileId`를 받는다. `profileId`를 생략하면 configured Local Instance canonical origin을 사용하고, 전달하면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용한다. 필요한 Remote actor 정보가 없으면 origin을 추측하지 않고 실패한다. `profileId`는 권한을 대신하지 않으며 unsigned lookup은 유지한다. 신규 materialization에 대해 동기 caller는 결과를 기다리고 비동기 caller는 Workflow 시작 확인만 받는다.
- Alternatives Considered: origin을 `actorUri`에서 추측하거나 `profileId`를 필수로 만들면 Remote identity 증거가 약해지거나 기존 호출자를 깨뜨리므로 선택하지 않았다. unsigned lookup을 제거하면 기존 contract가 불필요하게 축소된다.
- Consequences: caller는 검증된 Profile ID만 선택적으로 전달하고, Remote actor URI가 없는 Profile은 materialization 대상 origin으로 사용할 수 없다. sync/async는 public caller 선택으로 남는다.
- Confirmation / Follow-up: 2026-09-09 사용자 결정과 `PROD-808` 본문을 기준으로 Profile ID 유무, Local/Remote origin, missing actor, unsigned lookup을 각각 검증한다.

### Fresh, stale, and explicit search boundaries

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `PROD-808`
- Status: Active
- Context / Problem: stale actor를 즉시 반환하는 기존 federation contract와 명시적 remote search의 refresh 경계가 서로 다른 callback 동작으로 구현되어 있었다.
- Decision Outcome: fresh stored Profile은 원격 작업 없이 반환한다. stale active Profile은 동기 caller에서도 기존 row를 즉시 반환하고 같은 Temporal Workflow refresh를 시작한다. 인증된 명시적 `@handle@instance` search도 stale row를 즉시 반환하면서 refresh를 시작한다. refresh 또는 시작 실패는 기존 Profile과 성공한 검색 결과를 무효화하지 않는다. 일반 partial/local/malformed 검색, `profileByHandle`, profile route와 하위 route는 DB-only로 유지하며 inbound Follow는 기존 request context와 lookup을, inbound Update는 검증된 actor/no-network projection을 유지한다.
- Alternatives Considered: stale refresh 완료까지 기다리거나 search에서 refresh를 계속 끄면 기존 즉시 반환 계약과 사용자 결정에 어긋난다. partial 검색까지 원격 요청을 확대하면 fetch surface가 넓어진다.
- Consequences: stale 결과는 최신 원격 값이 아닐 수 있으며, refresh 완료 여부는 caller 응답에 포함되지 않는다. 명시적 search만 저장된 stale actor를 갱신할 수 있다.
- Confirmation / Follow-up: fresh no-work, stale immediate return, explicit search refresh, refresh failure preservation과 DB-only negative cases를 focused test로 확인한다.

### One short-lived Workflow and one Activity

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`
- Status: Active
- Context / Problem: process-local fire-and-forget callback은 process 종료·재시작 뒤 실행을 보장하지 않고, 신규 materialization과 refresh를 별도 경로로 두면 동시성·재시도 정책이 갈라진다.
- Decision Outcome: 신규 materialization과 stale refresh는 하나의 짧은 Temporal Workflow 종류에서 하나의 Activity를 한 번 호출하는 구조로 처리한다. Activity가 origin으로 새 Fedify context를 만들고 기존 lookup, actor projection, transaction과 ordering을 소유한다. Workflow는 결과를 전달하고 장수명 Profile entity, 주기 scanner, status API, 범용 framework와 추가 Workflow/Activity 체계를 만들지 않는다.
- Alternatives Considered: refresh 전용 Workflow, 외부 queue/scanner, Workflow 내부 장수명 loop는 중복 실행 경계와 운영 surface를 늘리므로 선택하지 않았다. process-local callback은 내구성 요구를 충족하지 못한다.
- Consequences: Worker registry에 한 Workflow와 한 Activity를 추가하고 caller가 durable start를 사용해야 한다. 원격 HTTP와 DB side effect는 Workflow sandbox 밖 Activity에서만 실행된다.
- Confirmation / Follow-up: Worker restart 중 Workflow 재개와 Activity 단일 실행 호출, existing projection/transaction 재사용을 검증한다.

### Serializable DTO, caller-only mode, and identity result

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`
- Status: Superseded in the wire-input clause by the final 2026-09-10 correction
- Context / Problem: Fedify context, hydrated actor와 full DB row는 Workflow wire contract에 안전하게 전달할 수 없고, caller mode를 Workflow history에 넣으면 같은 실행 경로 계약이 흔들린다.
- Decision Outcome: Workflow input은 qualified handle과 선택적 `profileId`처럼 JSON-safe한 값으로 제한하고 URI discriminator나 actor object를 입력으로 추가하지 않는다. Activity 실행 시각은 Activity 내부에서 정한다. 동기/비동기 mode는 caller helper에서만 선택하며 Workflow input과 branch에 넣지 않는다. 성공 결과는 Profile ID로 제한하고, 실패는 기존 오류 의미를 보존하며, full Profile row나 status 조회 API를 만들지 않는다.
- Alternatives Considered: Fedify context/actor를 직접 전달하거나 full row를 반환하는 방식은 serialization과 stale row 문제를 만들므로 배제한다. mode를 Workflow input으로 분기하거나 URI variant를 추가하면 두 public caller가 다른 실행 계약을 갖게 된다.
- Consequences: Activity가 실행 시점 DB에서 Profile·actor metadata를 다시 읽어 context와 origin을 구성한다. sync caller는 Profile ID를 받은 뒤 row를 다시 읽을 수 있고, async caller는 start acknowledgement만 관찰한다.
- Confirmation / Follow-up: Temporal payload serialization, sync result ID, async durable start acknowledgement와 missing Remote actor error mapping을 검증한다.

### Superseding review correction: discovery key와 stored actor refresh key를 분리한다

- Decision Date: 2026-09-10
- Decision Class: Corrective Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-808` review correction
- Status: Superseded by the final 2026-09-10 actorUri-only correction
- Context / Problem: 2026-09-09 기록은 Workflow input을 qualified handle 중심으로 설명해 stale refresh가 `acct:{handle}@{domain}`를 다시 해석하는 것으로 읽힐 수 있었다. actor `preferredUsername`이 바뀌면 이 재조회는 저장된 actor identity를 보존하지 못한다.
- Decision Outcome: Temporal Workflow와 Activity wire input은 초기 discovery key인 `handle` 또는 저장된 canonical actor URI refresh key인 `actorUri` 중 정확히 하나와 선택적인 `profileId`를 갖는다. `handle` branch만 `acct:{handle}@{domain}` lookup을 수행하고, `actorUri` branch는 저장된 URI를 직접 재사용해 handle lookup을 수행하지 않는다. Activity는 반환된 actor URI가 예상한 `actorUri`와 일치하는지 확인한 뒤에만 저장하며, 불일치는 Profile 또는 actor metadata 변경 없이 실패한다. 같은 URI에서 `preferredUsername`이 바뀌면 새 Profile을 만들지 않고 기존 Profile의 handle, normalized handle과 qualified handle을 갱신한다. `profileId`가 없으면 configured Local Instance canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용하며, 필요한 actor 정보가 없으면 origin을 추측하지 않고 실패한다. 기존 unsigned lookup과 caller-only sync/async 선택은 유지한다.
- Alternatives Considered: stale refresh에서도 handle을 다시 조회하거나 actor URI만으로 별도 Profile을 만드는 방식은 canonical actor identity와 preferredUsername 변경을 안전하게 연결하지 못하므로 선택하지 않았다. caller mode를 wire input에 넣거나 별도 Workflow를 추가하는 방식도 one-Workflow 경계를 넓히므로 선택하지 않았다.
- Consequences: 초기 요청과 stale refresh는 서로 다른 JSON-safe input identity를 사용하지만 같은 Workflow 종류와 Activity 경계를 공유한다. archive의 이전 wire-input 서술 중 qualified handle 단일 입력과 URI discriminator 배제 문장은 이 corrective contract로 대체되고, 이전 결정의 origin 선택과 sync/async 결론은 유지된다.
- Confirmation / Follow-up: handle 초기 materialization, actorUri refresh의 no-acct lookup, URI mismatch 저장 거부와 동일 URI preferredUsername 변경 시 Profile identity 유지 동작을 검증한다.

### Final review correction: actorUri-only materialization boundary

- Decision Date: 2026-09-10
- Decision Class: Corrective Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `PROD-808` final review correction
- Status: Active
- Context / Problem: 앞선 corrective record도 초기 materialization의 wire input에 qualified handle과 actorUri union을 남겨 검색·발견 경계와 materialization 경계를 혼동하게 했다.
- Decision Outcome: public materialization API, low-level materializer와 Temporal Workflow/Activity wire input은 canonical `actorUri`와 선택적인 `profileId`만 받는다. qualified handle을 canonical actor URI로 해석하는 작업은 materialization 전에 검색·발견 경계에서 수행한다. actorUri에 저장된 Profile이나 actor metadata가 없어도 새 remote Profile을 materialize할 수 있으며, Activity는 actorUri를 직접 Fedify lookup target으로 사용하고 acct handle lookup을 수행하지 않는다. 반환 actor URI가 예상한 actorUri와 일치하는지 확인한 뒤에만 저장하며, 불일치는 Profile 또는 actor metadata 변경 없이 실패한다. 같은 URI에서 `preferredUsername`이 바뀌면 새 Profile을 만들지 않고 기존 Profile의 handle, normalized handle과 qualified handle을 갱신한다. `profileId`가 없으면 configured Local Instance canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용하며, 필요한 actor 정보가 없으면 origin을 추측하지 않고 실패한다. 기존 unsigned lookup, caller-only sync/async 선택과 child `ABANDON` 경계는 유지한다.
- Alternatives Considered: materialization input에 qualified handle을 추가하거나 stale refresh에서 handle을 다시 조회하는 방식은 검색과 materialization 경계를 섞고 canonical actor identity를 안전하게 보존하지 못하므로 선택하지 않았다. actorUri에 저장된 Profile이 있어야만 생성하도록 제한하면 신규 actor materialization을 막으므로 선택하지 않았다.
- Consequences: 명시적 검색은 qualified handle을 canonical actor URI로 먼저 해석하고, 신규 요청과 stale refresh는 같은 actorUri-only Workflow 종류와 Activity 경계를 공유한다. 이전 union wire-input 서술은 이 final corrective contract로 대체되고, origin 선택, sync/async, stale immediate return과 child lifetime 결론은 유지된다.
- Confirmation / Follow-up: search-boundary handle resolution, actorUri 신규 materialization, actorUri refresh의 no-acct lookup, URI mismatch 저장 거부와 동일 URI preferredUsername 변경 시 Profile identity 유지를 검증한다.

### Stable workflow identity, retry classification, and timeout boundary

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`
- Status: Active
- Context / Problem: random Workflow ID는 동일 handle의 동시 fetch를 합치지 못하고, 모든 예외를 retry하면 영구적인 identity·state rejection을 반복한다. caller timeout을 cancellation으로 취급하면 이미 시작된 결과의 durability가 깨진다.
- Decision Outcome: Workflow ID는 normalized canonical `actorUri`와 origin 선택 identity(`profileId` 값 또는 기본 origin marker)로 결정해 stable하게 만들고, Workflow 밖 Temporal Client caller의 진행 중 실행에는 `USE_EXISTING`, 완료 후 새로운 시도에는 `ALLOW_DUPLICATE` reuse semantics를 사용한다. actor 미해결, identity 충돌, suspended/unresponsive 등 예상 가능한 domain rejection은 non-retryable로 매핑하고 일시적 외부·DB 장애는 기존 Activity retry 정책을 사용한다. client deadline은 대기 RPC에만 적용하며 이미 시작된 Workflow를 취소하거나 완료된 Profile을 rollback하지 않는다.
- Alternatives Considered: random ID나 검색용 qualified handle ID는 동일 actor URI의 동시 fetch와 alias 경계를 불안정하게 만든다. 모든 예외를 재시도하거나 timeout 때 Workflow를 취소하면 불필요한 fetch와 stale result 손실이 발생한다.
- Consequences: alias domain 또는 origin 선택 identity별 시작은 별도 요청 identity가 될 수 있지만 기존 actor URI uniqueness와 transaction ordering이 최종 Profile 중복을 막는다. 실패한 실행 뒤 다음 stale cycle에서 새 시도가 가능해야 한다.
- Confirmation / Follow-up: concurrent trigger deduplication, permanent/transient error behavior, caller timeout 뒤 Workflow 지속 실행과 subsequent DB observation을 검증한다.

### Async child start and parent lifetime independence

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`, [Temporal TypeScript Child Workflows](https://docs.temporal.io/develop/typescript/workflows/child-workflows), [ChildWorkflowOptions API](https://typescript.temporal.io/api/interfaces/workflow.ChildWorkflowOptions)
- Status: Active
- Context / Problem: 이 작업 Workflow가 다른 Workflow에서 async child로 시작될 수 있다. Temporal의 기본 parent close policy는 child를 종료하며, parent cancellation 전파는 별도 `cancellationType`으로 결정된다. parent가 child start event를 기록하기 전에 종료하면 child 시작이 보장되지 않는다.
- Decision Outcome: Workflow parent가 async mode로 이 작업을 호출하면 동일한 materialization Workflow를 `startChild`로 시작하고 child start acknowledgement가 기록될 때까지만 기다린다. 시작 옵션에는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 각각 적용해 acknowledgement 이후 parent의 완료·실패·취소가 child 완료를 막거나 취소를 전파하지 않게 한다. async parent는 child result를 기다리지 않는다. `ChildWorkflowOptions`에 없는 `workflowIdConflictPolicy`는 설정하지 않으며, 동일한 active child ID의 재시작은 native join으로 가장하지 않고 start conflict라는 기존 오류 의미를 보존한다.
- Alternatives Considered: async 경로에서 `executeChild`를 사용하면 child 완료를 기다리게 된다. `parentClosePolicy`만 설정하면 parent cancellation이 child에 전파될 수 있고, `cancellationType`만 설정하면 parent close 시 기본 terminate가 남는다. 별도 wrapper·second Workflow·external client join을 추가하면 현재 one-Workflow 범위를 넓힌다.
- Consequences: parent가 사라진 뒤에도 child Activity가 Profile을 commit할 수 있으며, async parent에는 완료 결과가 없다. active duplicate child start는 client caller의 `USE_EXISTING`처럼 자동 합류하지 않을 수 있으므로 caller는 그 conflict를 성공 acknowledgement로 둔갑시키지 않는다.
- Confirmation / Follow-up: 실제 Workflow child 호출부가 추가되는 경우 [Temporal Child Workflow guide](https://docs.temporal.io/develop/typescript/workflows/child-workflows)의 start acknowledgement와 parent close policy, [ChildWorkflowOptions API](https://typescript.temporal.io/api/interfaces/workflow.ChildWorkflowOptions)의 cancellation/parent-close 분리를 기준으로 해당 호출부의 start acknowledgement·no-result-wait 경계를 실행 검증한다. parent lifecycle 이후 child 생존은 Temporal SDK 책임으로 둔다.

## Remaining Decisions

없음.

## Superseded Decisions

- 2026-09-09 `Serializable DTO, caller-only mode, and identity result` 및 2026-09-10 `Superseding review correction: discovery key와 stored actor refresh key를 분리한다`의 wire-input 부분은 2026-09-10 `Final review correction: actorUri-only materialization boundary` 결정으로 대체됐다. 해당 결정들의 origin 선택, unsigned lookup, caller-only sync/async와 actor identity 결론은 계속 유효하다.
