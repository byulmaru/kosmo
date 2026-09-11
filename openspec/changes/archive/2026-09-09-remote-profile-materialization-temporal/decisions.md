## Context

이 결정 기록은 `PROD-808`의 확정 범위와 remote actor materialization·Profile search delta spec, Temporal 전환 설계를 반영한다. 사용자와 canonical domain 문서가 정한 observable contract와 구현 경로에서 선택해야 하는 durable mechanism을 분리해 기록한다.

## Decision Records

### Remote actor lookup caller contract

- Decision Date: 2026-09-09
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `docs/domain/decisions/0017-profile-search-staged-visibility.md`, `docs/architecture/core-services.md`, `PROD-808`
- Status: Superseded in public discovery dispatch by the 2026-09-11 `Handle lookup Workflow and materialize/refresh Activity boundary` decision
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
- Status: Superseded by the 2026-09-10 `Coordinator Workflow owns stored-state routing and stale child lifetime` decision
- Context / Problem: process-local fire-and-forget callback은 process 종료·재시작 뒤 실행을 보장하지 않고, 신규 materialization과 refresh를 별도 경로로 두면 동시성·재시도 정책이 갈라진다.
- Decision Outcome: 신규 materialization과 stale refresh는 하나의 짧은 Temporal Workflow 종류에서 하나의 Activity를 한 번 호출하는 구조로 처리한다. Activity가 origin으로 새 Fedify context를 만들고 기존 lookup, actor projection, transaction과 ordering을 소유한다. Workflow는 결과를 전달하고 장수명 Profile entity, 주기 scanner, status API, 범용 framework와 추가 Workflow/Activity 체계를 만들지 않는다.
- Alternatives Considered: refresh 전용 Workflow, 외부 queue/scanner, Workflow 내부 장수명 loop는 중복 실행 경계와 운영 surface를 늘리므로 선택하지 않았다. process-local callback은 내구성 요구를 충족하지 못한다.
- Consequences: Worker registry에 한 Workflow와 한 Activity를 추가하고 caller가 durable start를 사용해야 한다. 원격 HTTP와 DB side effect는 Workflow sandbox 밖 Activity에서만 실행된다.
- Confirmation / Follow-up: Worker restart 중 Workflow 재개와 Activity 단일 실행 호출, existing projection/transaction 재사용을 검증한다.

### Coordinator Workflow owns stored-state routing and stale child lifetime

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808` user decision
- Status: Superseded only in public discovery dispatch and Activity boundary by the 2026-09-11 `Handle lookup Workflow and materialize/refresh Activity boundary` decision
- Context / Problem: 기존 `One short-lived Workflow and one Activity` 결정으로 public Workflow와 materialization
  Activity의 durable path는 이미 정해졌지만, caller가 stored row·actor metadata·TTL을 먼저 읽고 fresh/stale를
  판단하는 구조와 cached return·refresh child lifetime의 소유권은 남아 있었다. 그 결과 public Workflow가 상태 routing을
  내구성 있게 소유하지 못하고, fresh/missing/stale 응답 경계가 caller마다 갈라질 수 있었다.
- Decision Outcome: public `remoteProfileMaterializationWorkflow`와 기존 Workflow ID는 유지한다. Materialization caller는
  stored row, actor metadata와 TTL을 직접 pre-read해 분기하지 않고 하나의 public Workflow를 dispatch하며, public
  Workflow start failure 뒤 DB fallback을 만들지 않는다. Coordinator Workflow는 state Activity에서
  `{ profileId, needsRefresh } | null` 최소 JSON-safe stored-state DTO를 받는다. `null`은 missing,
  `needsRefresh: false`는 갱신이 불필요하거나 허용되지 않는 상태(fresh 또는 `UNRESPONSIVE`),
  `needsRefresh: true`는 갱신 가능한 stale을 나타낸다. DTO의 `profileId`는 조회 대상인 cached Remote Profile ID이고,
  Workflow input의 선택적인 `profileId`는 origin 선택용 행동 Profile ID다. 갱신 불필요 상태는 외부 lookup과 child 없이
  cached Profile ID를 반환하고, missing은 기존 materialization Activity를 직접 실행해 결과를 반환한다. stale은 state DTO의
  `profileId`를 cached target identity로 반환하는 데만 사용하고, refresh child에는 Workflow가 원래 받은 input(`actorUri`와
  선택적인 `profileId`)을 그대로 전달한다. child는 별도 refresh ID prefix를 사용하고 `parentClosePolicy: ABANDON`과
  `cancellationType: ABANDON`을 명시해 child start acknowledgement 뒤 cached Profile ID를 반환한다. Refresh child는
  기존 materialization Activity를 실제 fetch 경로로 재사용하고, 이미 실행 중인 같은 child는 정상 coalescing으로 처리하며,
  그 밖의 child start·execution failure는 관측하고 cached identity를 유지한다. `runWorkflow(..., mode: 'execute')`를
  사용하는 동기 caller는 public Workflow 결과를 기다리고 `mode: 'start'`를 사용하는 비동기 caller는 모든 분기에서
  public start acknowledgement 뒤 반환한다. Qualified-handle discovery와 materialization 성공 뒤 connection·staged
  visibility DB 조회는 기존 검색 경계가 수행한다.
- Alternatives Considered: caller의 단순 pre-read만 유지하면 stored-state routing과 cached return의 소유권이 caller에
  남으므로 선택하지 않았다. process-local callback은 이전 전환에서 이미 제거된 경로이며 이 change의 durable mechanism
  선택지로 다시 도입하지 않는다. fresh/missing/stale마다 public Workflow를 나누면 기존 Workflow ID와 공용 caller 경계가
  흔들린다. stale child 완료를 기다리면 기존 즉시 반환 계약을 깨고, child start failure를 cached Profile 실패로 바꾸면
  stale 보존 계약을 깨므로 선택하지 않았다.
- Consequences: Worker에는 state Activity가 추가되고 existing materialization Activity는 missing과 refresh child 양쪽에서
  재사용된다. stale child는 public Workflow와 별도 identity를 가지며 parent 종료·취소 이후에도 실행을 계속할 수 있다.
  Generic child helper는 caller가 전달한 native lifecycle과 options를 보존하고 `ABANDON`을 자동 적용하지 않는다.
- Confirmation / Follow-up: fresh/missing/stale state routing, public Workflow 단일 dispatch, stale child start
  acknowledgement·coalescing·failure observability, all-state async acknowledgement와 no-DB-fallback 경계를 새
  follow-up tasks에서 실행 검증한다.

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
- Status: Superseded by the 2026-09-11 `Handle lookup Workflow and materialize/refresh Activity boundary` decision
- Context / Problem: 앞선 corrective record도 초기 materialization의 wire input에 qualified handle과 actorUri union을 남겨 검색·발견 경계와 materialization 경계를 혼동하게 했다.
- Decision Outcome: public materialization API, low-level materializer와 Temporal Workflow/Activity wire input은 canonical `actorUri`와 선택적인 `profileId`만 받는다. qualified handle을 canonical actor URI로 해석하는 작업은 materialization 전에 검색·발견 경계에서 수행한다. actorUri에 저장된 Profile이나 actor metadata가 없어도 새 remote Profile을 materialize할 수 있으며, Activity는 actorUri를 직접 Fedify lookup target으로 사용하고 acct handle lookup을 수행하지 않는다. 반환 actor URI가 예상한 actorUri와 일치하는지 확인한 뒤에만 저장하며, 불일치는 Profile 또는 actor metadata 변경 없이 실패한다. 같은 URI에서 `preferredUsername`이 바뀌면 새 Profile을 만들지 않고 기존 Profile의 handle, normalized handle과 qualified handle을 갱신한다. `profileId`가 없으면 configured Local Instance canonical origin을 사용하고, 있으면 해당 Profile의 Local Instance canonical origin 또는 Remote actor URI origin을 사용하며, 필요한 actor 정보가 없으면 origin을 추측하지 않고 실패한다. 기존 unsigned lookup, caller-only sync/async 선택과 child `ABANDON` 경계는 유지한다.
- Alternatives Considered: materialization input에 qualified handle을 추가하거나 stale refresh에서 handle을 다시 조회하는 방식은 검색과 materialization 경계를 섞고 canonical actor identity를 안전하게 보존하지 못하므로 선택하지 않았다. actorUri에 저장된 Profile이 있어야만 생성하도록 제한하면 신규 actor materialization을 막으므로 선택하지 않았다.
- Consequences: 명시적 검색은 qualified handle을 canonical actor URI로 먼저 해석하고, 신규 요청과 stale refresh는 같은 actorUri-only Workflow 종류와 Activity 경계를 공유한다. 이전 union wire-input 서술은 이 final corrective contract로 대체되고, origin 선택, sync/async, stale immediate return과 child lifetime 결론은 유지된다.
- Confirmation / Follow-up: search-boundary handle resolution, actorUri 신규 materialization, actorUri refresh의 no-acct lookup, URI mismatch 저장 거부와 동일 URI preferredUsername 변경 시 Profile identity 유지를 검증한다.

### Search discovery, Workflow state, and API visibility boundary

- Decision Date: 2026-09-11
- Decision Class: Corrective Contract
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-808` user decision
- Status: Superseded only in discovery dispatch and Activity responsibility by the 2026-09-11 `Handle lookup Workflow and materialize/refresh Activity boundary` decision
- Context / Problem: qualified handle discovery, durable state routing과 API 결과 visibility의 책임이 서로 섞이면 WebFinger 응답만으로 Instance를 판단하거나 caller가 stale state를 재현할 수 있다.
- Decision Outcome: API 검색 caller는 저장된 canonical `actorUri`를 재사용하고, 없으면 WebFinger의 ActivityPub self link에서 canonical URI를 확인한 뒤 하나의 public materialization Workflow를 호출한다. WebFinger 응답만으로 Instance를 추출하거나 상태를 판단하지 않는다. 현재 Profile/Instance state와 actor TTL 판정 및 refresh 여부는 Workflow 실행 경로가 소유하고, API는 Workflow 결과 뒤 기존 connection·staged visibility를 최종 적용한다.
- Alternatives Considered: caller precheck 또는 WebFinger host만으로 state를 판정하면 durable Workflow와 API의 책임이 갈라지고 canonical Actor와 다른 Instance의 상태를 적용할 수 있으므로 선택하지 않았다.
- Consequences: discovery는 canonical URI까지만 책임지고, Workflow는 state/TTL과 materialization lifecycle을 일관되게 결정하며, API는 기존 visibility 정책을 유지한다.
- Confirmation / Follow-up: cached URI reuse, WebFinger self-link discovery, Workflow state/TTL routing과 materialization 뒤 connection·visibility 적용을 각각 실행 검증한다.

### Workflow 종류와 무관한 공용 래퍼 정정

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808` user decision
- Status: Superseded by the 2026-09-10 Workflow별 ID 규칙과 공용 래퍼 책임 정정
- Context / Problem: 이전 구현 해석은 remote materialization 전용 Core start wrapper가 Workflow 시작과 ID 생성을 소유하는 것으로 읽힐 수 있었다. 이 wrapper는 실제로 다른 Workflow에서도 공유할 transport와 identity composition 경계를 공통화해야 하며, 사용하지 않는 child helper나 자동 Workflow 선택 경계를 만들면 안 된다.
- Decision Outcome: `packages/core/temporal/client.ts`의 `runWorkflow` 하나가 Workflow 종류와 무관하게 SDK Workflow 함수 또는 이름, native Workflow options, `readonly string[]` caller identity keys와 `start`/`execute` mode를 받는다. 공용 wrapper는 KOSMO task queue, 5초 bounded deadline과 `${workflowName}:${JSON.stringify(identityKeys)}` ID를 조합하고 native result 또는 start 반환값과 error를 그대로 전달한다. conflict·reuse policy와 identity keys는 caller가 native options와 호출부에서 명시한다. Workflow 자동 감지, trampoline, domain 전용 pass-through wrapper와 사용하지 않는 child helper는 추가하지 않는다. 이 change에서는 remote materialization Workflow만 새 ID composition을 사용하고, 다른 domain의 canonical Workflow ID와 UWS는 마이그레이션하지 않는다. actorUri identity, profileId origin 선택, sync/async, stale immediate return, inbound 경계와 조건부 child `ABANDON` 계약은 유지한다.
- Alternatives Considered: remote materialization 전용 wrapper를 유지하거나 Workflow 종류를 자동 감지하면 transport와 identity 정책을 재사용하지 못하고 호출부의 caller identity가 숨겨진다. 기존 모든 domain ID와 UWS를 한 번에 바꾸면 이 change의 범위와 rollback 경계가 불필요하게 넓어진다.
- Consequences: remote caller는 `runWorkflow`에 Workflow name, native options, `[actorUri, profileId ?? 'configured-local']` keys와 mode를 전달한다. 동일 actorUri와 origin 선택 identity의 동시 실행은 caller가 선택한 native conflict/reuse policy로 처리하며, child 호출이 실제로 추가되는 경우에는 해당 Workflow 호출부가 Temporal SDK `startChild`와 `ABANDON` 옵션을 직접 소유한다.
- Confirmation / Follow-up: shared queue/deadline, generic ID composition, native start/execute result and error propagation, explicit conflict/reuse policy와 remote-only adoption을 검증한다. 기존 domain Workflow ID와 UWS가 변경되지 않았는지 확인한다.

### Workflow별 ID 규칙과 공용 래퍼 책임 정정

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808` user decision
- Status: Superseded only in API 전달 형식 by the 2026-09-10 `WorkflowDefinition<T>` interface correction; Workflow별 ID 규칙 소유 원칙 remains Active
- Context / Problem: 공용 wrapper가 caller identity keys를 조합해 모든 Workflow ID를 결정하면 각 Workflow가 정의한 기존 input-to-ID 규칙과 ID 문자열을 덮고, native conflict/reuse/error와 domain 오류 정책의 경계가 흐려진다.
- Decision Outcome: 각 Workflow는 자기 input에서 Workflow ID를 만드는 규칙을 한 곳에 정의한다. 공용 `runWorkflow`는 `workflowIdFromArgs: (...args: Parameters<T>) => string` callback에 native args를 한 번 전달해 해당 Workflow의 ID를 계산하고, 그 ID와 KOSMO task queue·5초 bounded deadline으로 native `start` 또는 `execute`만 호출한다. Native result·start 반환값·error와 conflict/reuse policy는 그대로 전달하며 domain 오류 정책은 공통화하지 않는다. Workflow 함수/이름, input, mode와 native options는 호출부가 선택하고, 공통 ID format·name prefix·JSON 조합은 wrapper에 두지 않는다. `packages/core/temporal/remote-profile.ts`의 pure `remoteProfileMaterializationWorkflowId(input)`는 기존 `${REMOTE_PROFILE_MATERIALIZATION_WORKFLOW_TYPE}:${JSON.stringify([input.actorUri, input.profileId ?? 'configured-local'])}` ID 문자열을 유지한다. 기존 remote materialization Workflow의 sync/async, stale, URI/origin 선택과 URI mismatch 저장 거부 계약도 유지하며, 이 change에서는 remote materialization Workflow만 공용 wrapper를 사용하고 다른 domain의 ID와 UWS는 일괄 마이그레이션하지 않는다.
- Alternatives Considered: generic identity key composition은 Workflow별 ID 규칙과 기존 ID 문자열을 숨기고, remote 전용 start wrapper나 새 registry/decorator/framework/domain start wrapper는 transport와 domain 책임을 다시 결합하므로 선택하지 않는다.
- Consequences: remote caller는 기존 `actorUri`/`profileId` input과 native 정책을 유지한 채 `remoteProfileMaterializationWorkflowId` 함수 reference와 Workflow args를 공용 wrapper에 전달한다. 이 경계에는 새 registry/decorator/framework나 domain start wrapper를 추가하지 않으며, wrapper는 Workflow 선택이나 domain 오류 처리까지 소유하지 않는다.
- Confirmation / Follow-up: Workflow별 ID 규칙 callback 적용, 공통 queue/deadline, native start/execute 결과·반환값·error와 conflict/reuse 정책의 pass-through, remote-only adoption 및 기존 domain ID/UWS 보존을 검증한다. 이 record의 callback 단독 전달 형식은 다음 `WorkflowDefinition<T>` 결정으로 대체하고, ID 소유 원칙과 실행 evidence는 유지한다.

### WorkflowDefinition 인터페이스와 공용 래퍼 입력 정정

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808` user decision
- Status: Active except for the remote public input and identity clause superseded by the 2026-09-11 `Handle lookup Workflow and materialize/refresh Activity boundary` decision and the native error forwarding clause superseded by the 2026-09-11 `Shared client ApplicationFailure boundary` decision
- Context / Problem: `runWorkflow`에 Workflow name/function과 ID callback을 각각 전달하면 caller가 같은 Workflow 정의를 반복하고, Workflow 함수·ID 규칙·native args의 generic 관계를 호출 위치에서 다시 적게 된다. 사용자가 요청한 plain interface/object 형태로 이 정의를 하나의 입력으로 묶어도 기존 transport와 identity 의미는 유지해야 한다.
- Decision Outcome: `packages/core/temporal/client.ts`에 `WorkflowDefinition<T extends Workflow>` plain interface를 둔다. 이 객체는 `workflow: string | T`와 `workflowIdFromArgs: (...args: Parameters<T>) => string`를 함께 정의한다. 공용 `runWorkflow(definition, { args, mode, ...native Workflow options })`는 definition에서 Workflow와 ID 규칙을 받고 native args를 callback에 한 번 전달해 기존 ID 문자열을 계산한 뒤 KOSMO task queue와 5초 bounded deadline으로 native `start` 또는 `execute`만 호출한다. Native args, mode별 result/handle type, start 반환값·error와 conflict/reuse policy는 그대로 전달·추론하고 domain 오류 정책은 호출부에 남긴다. `packages/core/temporal/remote-profile.ts`의 `remoteProfileMaterializationWorkflow` 정의 객체는 기존 remote Workflow와 ID callback을 함께 보유하며, 세 caller가 이를 공유한다. 기존 ID 문자열, sync/async, stale, origin, actorUri identity와 URI mismatch 저장 거부 계약은 변경하지 않는다.
- Alternatives Considered: Workflow name/function과 ID callback을 별도 인자로 계속 전달하면 세 caller의 동일 설정과 local Workflow function type이 반복된다. 새 registry, runtime factory, fake Workflow function, contracts file, decorator 또는 다른 Workflow의 일괄 migration은 현재 plain object 입력 계약에 필요하지 않으며 scope와 runtime surface를 넓힌다.
- Consequences: caller는 `runWorkflow`에 definition 하나와 args/mode/native policy를 전달하고, definition의 generic type에서 native args와 mode별 result/handle이 추론된다. Workflow별 ID 생성 책임은 각 definition/Workflow 경계에 남고 공용 wrapper는 queue, deadline, native invocation과 pass-through만 소유한다. 기존 remote ID 문자열과 actorUri/profileId origin identity를 유지하며 다른 domain ID와 UWS는 변경하지 않는다.
- Confirmation / Follow-up: 세 remote caller가 `remoteProfileMaterializationWorkflow`를 사용하고 별도 Workflow name·ID callback·local Workflow function type을 반복하지 않는지 확인한다. `WorkflowDefinition<T>`의 args/result/handle inference, 기존 ID 문자열, 5초 queue/deadline, sync/async, conflict/reuse/error pass-through와 remote-only adoption을 실행 evidence로 기록한다. 이전 callback 단독 evidence는 Historical로 유지하고 새 interface 결과를 별도 항목에 기록한다.

### Stable workflow identity, retry classification, and timeout boundary

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`
- Status: Active except for Workflow ID composition superseded by the 2026-09-10 Workflow별 ID 규칙과 공용 래퍼 책임 정정
- Context / Problem: random Workflow ID는 동일 handle의 동시 fetch를 합치지 못하고, 모든 예외를 retry하면 영구적인 identity·state rejection을 반복한다. caller timeout을 cancellation으로 취급하면 이미 시작된 결과의 durability가 깨진다.
- Decision Outcome: Workflow ID의 remote materialization identity는 canonical `actorUri`와 origin 선택 identity(`profileId` 값 또는 기본 origin marker)이며, 기존 remote Workflow ID 문자열 규칙을 유지하고 공용 wrapper가 그 규칙을 적용한다. Workflow 밖 Temporal Client caller의 진행 중 실행에는 `USE_EXISTING`, 완료 후 새로운 시도에는 `ALLOW_DUPLICATE` reuse semantics를 사용한다. actor 미해결, identity 충돌, suspended/unresponsive 등 예상 가능한 domain rejection은 non-retryable로 매핑하고 일시적 외부·DB 장애는 기존 Activity retry 정책을 사용한다. client deadline은 대기 RPC에만 적용하며 이미 시작된 Workflow를 취소하거나 완료된 Profile을 rollback하지 않는다.
- Alternatives Considered: random ID나 검색용 qualified handle ID는 동일 actor URI의 동시 fetch와 alias 경계를 불안정하게 만든다. 모든 예외를 재시도하거나 timeout 때 Workflow를 취소하면 불필요한 fetch와 stale result 손실이 발생한다.
- Consequences: alias domain 또는 origin 선택 identity별 시작은 별도 요청 identity가 될 수 있지만 기존 actor URI uniqueness와 transaction ordering이 최종 Profile 중복을 막는다. 실패한 실행 뒤 다음 stale cycle에서 새 시도가 가능해야 한다.
- Confirmation / Follow-up: concurrent trigger deduplication, permanent/transient error behavior, caller timeout 뒤 Workflow 지속 실행과 subsequent DB observation을 검증한다.

### Async child start and parent lifetime independence

- Decision Date: 2026-09-09
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808`, [Temporal TypeScript Child Workflows](https://docs.temporal.io/develop/typescript/workflows/child-workflows), [ChildWorkflowOptions API](https://typescript.temporal.io/api/interfaces/workflow.ChildWorkflowOptions)
- Status: Active
- Context / Problem: 향후 external Workflow parent가 public materialization Workflow를 async child로 시작할 수 있다. Temporal의 기본 parent close policy는 child를 종료하며, parent cancellation 전파는 별도 `cancellationType`으로 결정된다. parent가 child start event를 기록하기 전에 종료하면 child 시작이 보장되지 않는다. 현재 change의 Coordinator 내부 stale refresh child는 이 future external public caller와 별도 실행 경계다.
- Decision Outcome: 향후 external Workflow parent가 async mode로 public materialization Workflow를 호출하는 경우, 해당 caller는 동일한 materialization Workflow를 `startChild`로 시작하고 child start acknowledgement가 기록될 때까지만 기다린다. 해당 caller가 시작 옵션에 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 각각 적용해 acknowledgement 이후 parent의 완료·실패·취소가 child 완료를 막거나 취소를 전파하지 않게 한다. async parent는 child result를 기다리지 않는다. `ChildWorkflowOptions`에 없는 `workflowIdConflictPolicy`는 설정하지 않으며, 동일한 active child ID의 재시작은 native join으로 가장하지 않고 start conflict라는 기존 오류 의미를 보존한다. 현재 Coordinator 내부 refresh child의 두 `ABANDON` 옵션과 cached return은 `Coordinator Workflow owns stored-state routing and stale child lifetime` 결정이 소유한다. 이 change에는 public materialization Workflow를 외부 parent에서 호출하는 별도 production caller를 추가하지 않는다.
- Alternatives Considered: async 경로에서 `executeChild`를 사용하면 child 완료를 기다리게 된다. `parentClosePolicy`만 설정하면 parent cancellation이 child에 전파될 수 있고, `cancellationType`만 설정하면 parent close 시 기본 terminate가 남는다. generic native child helper를 두지 않고 caller마다 lifecycle을 복제하거나, remote 전용 wrapper·second Workflow·external client join을 추가하면 공통 실행 경계와 현재 one-Workflow 범위를 불필요하게 넓힌다.
- Consequences: future external parent가 사라진 뒤에도 public materialization child가 Profile을 commit할 수 있으며, async parent에는 완료 결과가 없다. active duplicate child start는 client caller의 `USE_EXISTING`처럼 자동 합류하지 않을 수 있으므로 caller는 그 conflict를 성공 acknowledgement로 둔갑시키지 않는다. 현재 Coordinator 내부 refresh child의 생존·cached return은 별도 Coordinator 결정과 구현이 소유한다.
- Confirmation / Follow-up: public materialization Workflow를 호출하는 별도 external child caller가 추가되는 경우 [Temporal Child Workflow guide](https://docs.temporal.io/develop/typescript/workflows/child-workflows)의 start acknowledgement와 parent close policy, [ChildWorkflowOptions API](https://typescript.temporal.io/api/interfaces/workflow.ChildWorkflowOptions)의 cancellation/parent-close 분리를 기준으로 해당 호출부의 start acknowledgement·no-result-wait 경계를 실행 검증한다. 현재 Coordinator 내부 refresh child의 두 `ABANDON` 옵션은 해당 Coordinator/helper 검증에서 확인한다. parent lifecycle 이후 child 생존은 Temporal SDK 책임으로 둔다.

### Workflow-safe generic child lifecycle helper

- Decision Date: 2026-09-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-808` user decision
- Status: Active
- Context / Problem: 현재 Coordinator Workflow가 stale 상태에서 내부 refresh child를 사용하고, 향후 external Workflow parent도 public materialization Workflow를 async child로 호출할 수 있다. 이전 결정의 사용하지 않는 child helper 금지 문구가 generic helper 자체를 금지하는 것으로 읽힐 수 있지만, 두 caller의 lifecycle은 각각 명시적인 native 경계를 가져야 한다. Child 실행은 client `runWorkflow`의 queue/deadline과 caller의 parent lifetime 정책을 그대로 복제하지 않고 native semantics를 보존해야 한다.
- Decision Outcome: `apps/worker/src/workflows/child.ts`가 `runChildWorkflow<T>(definition, { args, mode: 'start' | 'execute', ...nativeChildOptions })`를 export한다. Helper는 기존 `packages/core/temporal/client.ts`의 `WorkflowDefinition<T>`를 `import type`으로 재사용하고, definition의 `workflowIdFromArgs` callback에 실제 args를 한 번 전달해 child Workflow ID를 만든다. `mode: 'start'`는 native child handle/start acknowledgement를 반환하고 `mode: 'execute'`는 native child result를 반환한다. Native child options·error·queue inheritance는 그대로 전달하며 client `runWorkflow`의 KOSMO task queue와 5초 bounded deadline은 복사하지 않는다. `parentClosePolicy`와 `cancellationType`을 생략하면 Temporal 기본값을 사용하고 helper는 `ABANDON`을 자동 적용하지 않는다. 현재 Coordinator 내부 refresh child는 두 `ABANDON` 옵션을 명시하고, 향후 external public materialization child caller도 필요할 때 자기 lifecycle에 두 옵션을 명시한다. 이 change에는 public materialization Workflow를 외부 parent에서 호출하는 별도 production caller를 추가하지 않는다.
- Alternatives Considered: caller마다 `startChild`와 `executeChild`를 직접 호출하면 ID 계산·mode별 반환·options 전달 경계가 반복된다. 새 child 전용 type file, registry, runtime factory, fake Workflow function, decorator 또는 framework를 추가하면 plain `WorkflowDefinition<T>`와 native API로 충분한 범위를 넓힌다. Helper가 `ABANDON`이나 client queue/deadline을 자동 적용하면 native defaults와 caller-owned remote contract를 덮는다.
- Consequences: Helper는 명시적으로 사용하는 native child caller의 runtime behavior만 보조하며, 현재 Coordinator 내부 refresh child가 실제 사용 경계를 제공한다. Generic helper 사용자는 native child start/execute lifecycle과 기본 queue/options/error semantics를 받고, Coordinator와 향후 external public caller는 각자의 명시적인 `ABANDON` 정책을 소유한다. 다른 domain의 Workflow ID와 UWS, public materialization Workflow를 외부 parent에서 호출하는 별도 production caller의 부재는 변경하지 않는다.
- Confirmation / Follow-up: 2026-09-10 실제 helper를 import한 Temporal bundle/integration 3/3이 통과했다. Typed string definition의 `execute` mode에서 args·생성된 Workflow ID·result를 확인했고, function definition의 `start` mode에서 native handle과 `handle.signal`을 사용해 명시적인 `parentClosePolicy: ABANDON`·`cancellationType: ABANDON` child가 parent 완료 뒤에도 `RUNNING`으로 남아 외부 signal/result 완료까지 진행하는 것을 확인했다. Child failure는 native cause chain으로 전달됐다. `/private/tmp/child-helper-real-typecheck.ts`를 실제 helper import 상태로 `tsc` 실행해 exit 0을 확인했고, generic 생략 args/result/`ChildWorkflowHandle` 추론과 wrong args/result·unsupported `workflowIdConflictPolicy`에 대한 `@ts-expect-error` 3개를 검증했다. Worker build, ESLint와 Prettier도 통과했다. 이 evidence는 현재 Coordinator 내부 refresh child와 generic helper의 native 실행·type inference·명시적 option 전달을 확인하지만, 별도 external public child caller, Worker restart, caller timeout continuation과 전체 parent-close/cancellation matrix는 검증하지 않는다. public materialization Workflow를 외부 parent에서 호출하는 별도 child caller가 추가되면 그 호출부의 두 `ABANDON` 옵션과 no-result-wait 경계를 별도로 검증한다.

### Handle lookup Workflow and materialize/refresh Activity boundary

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, `PROD-808` user decision
- Status: Active
- Context / Problem: URI-only public materialization Workflow 서술은 qualified handle discovery와 canonical URI materialization을 한 API 경계로 묶고, state Activity의 nullable 결과와 실제 fetch Activity의 책임을 혼동하게 했다.
- Decision Outcome: API는 qualified handle을 파싱해 `RemoteProfileLookupInput { domain, handle, profileId? }`로 public `remoteProfileLookupWorkflow`를 호출한다. Workflow ID는 기존 pure handle normalization, domain과 acting `profileId`에서 계산하며 normalized handle을 wire input에 중복하지 않는다. Workflow는 `lookupRemoteActorUriActivity`에서 저장된 canonical actor URI를 먼저 재사용하고, 없을 때만 WebFinger의 ActivityPub self link에서 canonical `actorUri`를 확인한다. URI lookup Activity에서 받은 `actorUri`와 Workflow input의 optional acting `profileId`를 `materializeRemoteProfileActorActivity`에 전달한다. Materialize Activity가 stored/missing 판정과 현재 Profile/Instance state·actor TTL을 소유하고 `{ profileId, needsRefresh }` non-null DTO를 반환한다. Activity 모듈의 private stored-state query에서만 missing을 `null`로 표현할 수 있으며, missing fetch·persist 뒤에는 새 target ID를 `{ profileId: id, needsRefresh: false }`로 반환한다. 실제 fetch는 `refreshRemoteProfileActorActivity`가 ordinary call과 stale refresh child에서 공유한다. `needsRefresh: false`이면 외부 fetch와 child 없이 cached 또는 새 Profile identity를 반환하고, `needsRefresh: true`이면 Workflow가 lookup Activity의 `actorUri`와 original input의 optional `profileId`로 refresh child를 시작한다. Child는 `parentClosePolicy: ABANDON`과 `cancellationType: ABANDON`을 명시하고 start acknowledgement 뒤 cached identity를 반환한다. Alias domain의 최초 perfect coalescing은 보장하지 않지만 DB actor URI identity와 refresh URI coalescing은 유지한다. 별도 URI public Workflow나 그 child를 추가하지 않는다. Caller의 bounded 5초 대기 deadline에는 discovery가 포함되며 이미 시작된 Workflow는 계속 실행한다.
- Alternatives Considered: URI-only public Workflow를 유지하거나 handle/actorUri union input을 추가하면 discovery와 materialization 책임이 다시 섞인다. nullable materialize result에 missing 의미를 넣는 방식을 배제하고, 기존 URI public Workflow를 handle Workflow의 child로 감싸는 불필요한 계층 추가를 기각한다.
- Consequences: 명시적 qualified search는 하나의 lookup Workflow에서 URI lookup과 materialize Activity를 순서대로 사용한다. Missing fetch와 stale refresh는 같은 refresh Activity body를 ordinary call 또는 child로 공유하며, API의 기존 connection·visibility와 fallback 경계는 유지한다.
- Confirmation / Follow-up: 2026-09-11 standalone Worker가 자체 `TestWorkflowEnvironment`에서 test-client preload 없이 16/16 실행되고 cleanup까지 완료됐으며, API profile 73/73, Fedify remote actor 39/39, Core client 10/10과 Core unit 74/74가 통과했다. Caller의 5초 bounded wait 설정, URI lookup→materialize→refresh 조합의 결과·오류, active OpenSpec strict 78/78과 archived proposal/delta Validator issues 0을 확인했으며, timeout continuation과 Worker restart recovery 자체는 Temporal native 계약으로 둔다.

### Shared client ApplicationFailure boundary

- Decision Date: 2026-09-11
- Decision Class: Implementation Choice
- Authority / Provenance: [`PROD-808` 2026-09-11 user decision](https://linear.app/byulmaru/issue/PROD-808), `docs/domain/objects/profile.md`
- Status: Active
- Context / Problem: native Workflow rejection은 `WorkflowFailedError` 같은 outer wrapper와 wire `ApplicationFailure`의 cause chain으로 전달될 수 있어, API가 Temporal의 중첩 cause 구조를 직접 알아야 한다.
- Decision Outcome: `runWorkflow`는 callback 오류를 native 호출 전에 원본 그대로 전파한다. Native `start`/`execute` rejection은 `Error.cause` chain에서 첫 `ApplicationFailure`를 찾으면 그 동일 객체를 throw하고, 찾지 못하면 최초 rejection 객체를 그대로 throw한다. Native result·start 반환값·conflict/reuse policy, start handle와 execute result의 mode별 type은 유지한다. Caller는 전달받은 `ApplicationFailure.type`으로 expected domain failure를 분류하고 fallback·reporting을 결정한다. Unknown `ApplicationFailure`도 그대로 전달되어 outer Workflow 오류 wrapper가 Sentry 대표 오류에서 빠질 수 있으며, `ApplicationFailure`가 없는 transport·deadline·cancel 오류는 원래 native wrapper를 유지한다.
- Alternatives Considered: API caller가 cause chain을 직접 순회하는 경계를 유지하면 Temporal 중첩 오류 구조가 endpoint로 새어 나온다. 모든 오류를 하나의 domain DTO로 바꾸면 native retry/transport metadata와 원인 형태를 잃고, domain type 목록과 fallback/reporting을 공용 client에 넣으면 Workflow별 정책 경계가 섞인다.
- Consequences: remote profile API는 직접 cause traversal 없이 세 expected `ApplicationFailure.type`만 분류하면서 기존 빈 connection과 unexpected error 관측을 유지한다. Activity의 domain-to-`ApplicationFailure` retry encoding과 `runChildWorkflow`의 native error semantics는 변경하지 않는다.
- Confirmation / Follow-up: Core client rejection tests와 API profile failure behavior를 실행해 first `ApplicationFailure` identity, no-`ApplicationFailure` original identity, callback failure, native result/start behavior와 existing fallback/reporting을 확인한다.

## Remaining Decisions

없음.

## Superseded Decisions

- 2026-09-09 `One short-lived Workflow and one Activity`의 caller pre-read 및 단일 Activity orchestration limitation은
  2026-09-10 `Coordinator Workflow owns stored-state routing and stale child lifetime`으로 대체됐다. 기존 public
  Workflow ID, materialization Activity의 projection·transaction, retry와 identity 계약은 유지하며, state Activity,
  fresh/missing/stale routing, stale refresh child와 caller no-DB-fallback 경계를 새 결정으로 적용한다.
- 2026-09-09 `Serializable DTO, caller-only mode, and identity result` 및 2026-09-10 `Superseding review correction: discovery key와 stored actor refresh key를 분리한다`의 wire-input 부분은 2026-09-10 `Final review correction: actorUri-only materialization boundary` 결정으로 대체됐다. 해당 결정들의 origin 선택, unsigned lookup, caller-only sync/async와 actor identity 결론은 계속 유효하다.
- 이전 remote materialization 전용 start wrapper와 `remote-profile-materialization:${actorUri}:${profileId}` ID 조합 해석은 2026-09-10 `Workflow 종류와 무관한 공용 래퍼 정정` 결정으로 대체됐다. remote Workflow의 actorUri/profileId identity와 conflict/reuse 의미, 다른 domain의 기존 ID와 UWS는 각자의 경계에서 유지된다.
- 2026-09-10 `Workflow 종류와 무관한 공용 래퍼 정정`의 caller identity keys 및 `${workflowName}:${JSON.stringify(identityKeys)}` generic ID composition은 같은 날 `Workflow별 ID 규칙과 공용 래퍼 책임 정정`으로 대체됐다. 기존 remote Workflow ID 문자열과 native conflict/reuse/error 정책, 다른 domain의 ID와 UWS는 유지한다.
- 2026-09-10 `Workflow 종류와 무관한 공용 래퍼 정정`의 실제 child caller 없는 child helper 금지 및 child API 부재 해석만 `Workflow-safe generic child lifecycle helper` 결정으로 대체한다. 해당 record의 generic client `runWorkflow` API, native pass-through, remote async child caller가 실제 존재할 때의 명시적 `parentClosePolicy: ABANDON`·`cancellationType: ABANDON` 계약과 다른 domain의 ID/UWS 보존은 유지한다.
- 2026-09-10 `WorkflowDefinition 인터페이스와 공용 래퍼 입력 정정`의 native error pass-through clause는 2026-09-11 `Shared client ApplicationFailure boundary`로 대체한다. Native result/start 반환값, conflict/reuse policy, callback 오류, no-`ApplicationFailure` transport 오류와 domain caller 정책은 유지한다.
