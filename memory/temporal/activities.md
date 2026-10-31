# Temporal Workflow Memory: Activities

## Activity Registration And Adapters

- `apps/worker/src/activities.ts`는 production Activity registry다.
- 새 Temporal-first mutation의 domain policy, state transition과 commit 시점 재검증은 Worker Activity가 소유한다.
  Activity가 transaction, persistence와 retry/idempotency 판정을 수행하고, GraphQL·HTTP·ActivityPub caller는
  capability별 `mode`·conflict·reuse 옵션과 함께 exported `WorkflowDefinition`, serializable input을 generic
  `runWorkflow`에 한 번 전달할 뿐 state-changing core service나 task queue·deadline·native Temporal 호출을 직접
  조합하지 않는다.
- 기존 non-Temporal/shared core service는 별도 migration 범위로 유지한다. Temporal Activity가 migration 중
  기존 transport-neutral policy나 service를 내부에서 재사용할 수는 있지만, 새 mutation의 필수 public layer나
  caller-facing adapter로 승격하지 않는다.
- 각 Workflow는 `proxyActivities<typeof activities>`와 로컬 destructuring으로 실제 사용하는 Activity를 한 번만
  나열한다. 같은 이름을 `Pick` generic에 다시 적는 compile-time allowlist는 런타임 격리나 보안 경계가 아니므로
  만들지 않는다. 실제 capability 격리가 필요하면 Worker registry나 task queue 경계로 분리한다.
- 여러 Workflow가 같은 retry와 timeout 정책을 사용할 때는 immutable Activity options만 Workflow 공용 모듈에
  둔다. proxied Activity 객체 자체나 domain별 호출 wrapper를 공용화해 실제 Activity 이름을 숨기지 않는다.
- durable source ID를 DB projection과 Workflow input으로 복원하고 retry/no-op을 판정하는 Activity 전용 adapter는
  `apps/worker`가 소유한다. `packages/core`와 `packages/fedify`에는 각각 domain policy와 protocol delivery primitive만
  남기며, Temporal input shape를 맞추기 위한 공개 함수를 추가하지 않는다.
- protocol create Activity는 exact source가 이미 사라진 경우에만 stale-source no-op으로 끝낼 수 있다. commit된
  delivery의 actor 또는 inbox projection이 불완전하면 성공으로 숨기지 않고 실패·retry로 관찰한다. 삭제 Activity는
  현재 source row 대신 exact deleted source ID와 directed pair를 사용하며 실행 시점 participant state로 delivery
  eligibility를 재판정하지 않는다.
- 기존 core/fedify 함수의 input, return과 오류 의미가 Activity 계약과 같으면 `export { source as activityName }`로 직접 alias한다.
- 단순히 같은 인자를 다음 함수에 전달하고 같은 Promise를 반환하는 Worker adapter 파일이나 async wrapper를 만들지 않는다.
- adapter는 input 변환, dependency composition, retry 경계에 필요한 validation 또는 Activity 고유 관찰처럼 실제 책임이 있을 때만 둔다.
- Activity 이름은 Workflow history와 운영 조회에 남는 public runtime identity이므로 rename은 호환성 영향을 검토한다.

- `getRemoteProfileActorStateActivity`는 usable Profile과 actor의 7일 freshness를 읽기 전용으로 반환하며 fetch나 상태 변경을 하지 않는다. `fetchRemoteProfileActorActivity`는 네트워크 전에 현재 저장 actor의 Profile 사용 가능 상태와 요청 URI·Instance 정책을 확인하고 origin/signing loader를 선택한 뒤 Fedify에서 actor를 가져와 expanded JSON-LD와 fetch 시작 시각을 반환한다. `applyRemoteProfileActorActivity`는 네트워크 없이 문서를 다시 검증하고 receipt/fetch timestamp를 써서 원자적으로 투영한다. `recoverRemoteProfileActorActivity`는 cached lookup의 verified receipt에만 쓰며 exact actor URI를 다시 확인해 Unresponsive Instance를 CAS 복구하되 freshness timestamp는 보존한다. Update Workflow는 state miss면 `null`이고 hit이면 supplied document를 receipt timestamp로 적용한다. 별도 receipt-only recovery Activity는 호출하지 않으며, apply가 동반하는 atomic recovery는 유지한다.
- `lookupRemoteActorUriActivity`는 저장 actor URI를 우선하고 없을 때만 WebFinger를 실행한다. State, fetch, apply Activity를 Workflow가 순서화한다. Refresh Workflow는 state를 읽고 fresh면 반환하며 stale/missing이면 fetch와 apply를 수행한다. Actor fetch는 Fedify shared helper에서 하며 parsed protocol rejection은 `RemoteActorMaterializationError`가 된다.
- `remoteProfileLookupWorkflow`와 `remoteProfileRefreshWorkflow`는 `patched('remote-profile-activity-split-v1')`를 사용한다. 신규 history는 split Activity sequence를 실행하고 marker 이전 history가 기록한 `materializeRemoteProfileActorActivity`와 `refreshRemoteProfileActorActivity` Activity name 및 call trace는 호환 adapter로 유지한다. Adapter는 해당 unpatched history가 drain될 때 제거한다. Legacy materialization은 cache hit의 receipt로만 recovery하고 Active·Unresponsive Instance 모두 같은 7일 TTL을 적용한다.
- Lookup Workflow schema는 handle과 actor input, optional `receipt`의 알려진 필드를 검증한다. Actor URI와 optional context origin은 HTTP(S), receipt timestamp는 ISO instant여야 하며 nested field가 부분적으로 malformed인 입력은 거부한다. Update Workflow schema는 HTTP(S) actor URI, JSON document, ISO receipt를 검증하고 context origin을 받지 않는다. 알려진 projection·conflict·not-found 오류는 non-retryable Activity failure로 변환하며 transient 오류는 그대로 전파한다. Refresh input의 optional `profileId`는 origin 선택용 acting Profile ID이며, `profileId` 선택 로직을 우선 사용하고 없으면 optional `contextOrigin`과 configured origin fallback을 사용한다. Actor fetch는 local `profileId`가 있으면 해당 Profile signer를, 없으면 configured local origin의 `~instance` signer를 사용하며, 조회 origin은 기존 input 선택을 유지한다. Context origin이 없을 때 refresh Workflow ID는 기존 문자열을 유지하며, 제공되면 ID에 포함한다.

## Quote Consent Owner

- Quote consent의 변경 명령은 Quote ID별 owner의 FIFO admission을 통과한다. Handler는 enqueue만 수행한다.
- 원격 proof 조회는 읽기 전용 Activity로 분리한다. 쓰기 Activity는 Source → Quote 잠금, 현재 Run/token Query fence,
  기존 identity/state CAS를 같은 transaction에서 검사한다. Query 성공만으로 commit까지의 Temporal 소유권을 보장하지 않는다.
- 정상 종료·Continue-As-New는 token 폐기와 DB drain을 수행한다. Source 삭제는 공유 잠금 순서를 따르는 제한된 다중 자원 transaction이다.
- SDK Worker shutdown은 Workflow의 finish/drain과 다르다. 구형 writer admission 차단 및 미완료 작업·DB session·process 확인 뒤 writer를 전환한다. bootstrap의 행 잠금은 아직 시작하지 않은 구형 writer를 fence하지 않는다.
- 강제 Terminate/Reset은 drain을 실행하지 않으므로 이미 fence를 통과한 늦은 commit을 취소하지 못한다.
  새 Run bootstrap과 운영 복구의 보장 범위는 [ADR 0030](../../docs/architecture/decisions/0030-quote-consent-owner.md)을 따른다.

- Quote 최초 생성은 stable caller admission을 통해 Quote owner INITIALIZE에 연결한다. 일반 Local Post/Reply는
  기존 non-Temporal 저장과 post-create effects 경로를 유지한다. Quote의 payload binding·Update 결과 회수와
  retention 이후 안전한 거절은 `docs/architecture/decisions/0030-quote-consent-owner.md`를 따른다.

## Inputs And Identity

- Temporal Workflow/Activity/Update/Signal object payload schema는 기본적으로 `z.object(...)`를 사용해 알려진
  필드를 검증하고 알 수 없는 필드를 제거한다. 알 수 없는 key 거부가 해당 경계의 명시적 계약일 때만
  `z.strictObject(...)`를 쓰고, 알 수 없는 필드를 의도적으로 보존해 전달해야 할 때만 `.passthrough()`를 쓴다.
  외부 trust boundary의 알려진 필드, 타입과 의미 검증은 유지한다.
- Workflow/Update wire input schema는 해당 Workflow의 trust boundary 가까이에 둔다. Workflow validator와
  handler replay 경계는 같은 local schema를 사용하고, Activity가 state-changing command를 실행하며 core service를
  재사용하는 경우에도 core는 transport-neutral compile-time DTO type만 소유한다. `typeof`를 나열한 수동
  validator나 Core에 runtime wire schema를 복제하지 않는다.
- 새 payload 필드는 optional 또는 defaulted로 추가한다. 필수 필드 추가나 기존 필드의 type·의미 변경은
  compatibility strategy와 coordinated rollout/versioning이 필요하다. 알 수 없는 필드를 제거하는 것만으로 새 필수
  의미를 구현할 수는 없다.
- Workflow input은 JSON-serializable한 immutable source identity여야 한다. 삭제 뒤 필요한 값은 exact source ID와 pair identity로 표현하고, Activity가 삭제된 source row를 다시 읽는 것으로 복원하지 않는다.
- create effect는 stable source identity를 우선 사용하고 Activity가 현재 projection을 조회하게 한다.
- input type은 한 Workflow에서만 쓰면 Workflow 파일 가까이에 둔다. Worker, core와 protocol adapter가 실제로 같은 shape를 소비할 때만 neutral contract module로 공유한다. 이름만 같은 type을 package마다 복제하지 않는다.
- Workflow ID는 logical generation을 구분하는 immutable source ID를 포함한다. create/delete와 서로 다른 source kind가 완료된 같은 ID를 공유하지 않게 한다.

## Verification

- Node test preload는 Node test 자식의 main thread에서만 runtime/client를 생성한다. runner와 SDK Worker thread는
  `--import`와 `NODE_TEST_CONTEXT`를 상속할 수 있으므로 둘 다 소유권 경계에서 제외한다. suite 종료 summary와 process exit를 구분하고,
  preload가 소유한 원래 connection만 정리한다. 테스트가 임시 environment의 client로 교체한 연결을 닫지 않는다.
- 장기 실행 Quote owner를 사용하는 E2E의 DB reset은 finish Signal과 정상 drain 완료를 기다린다.
  `result()`만 대기하거나 강제 Terminate로 정상 종료를 대체하지 않는다.

- Worker build로 Workflow bundle과 Activity type wiring을 확인한다.
- production registry를 사용하는 Workflow test로 origin/transition 분기, sibling Activity 전부 시도, retry와 restart 재개를 확인한다.
- Temporal-first Activity test로 실제 commit, duplicate/no-op/rollback, retry와 restart 재개를 확인한다. 기존
  non-Temporal/shared core service test는 공통 domain policy와 transaction contract를 검증하며 Workflow start
  여부를 새 Temporal-first acceptance로 요구하지 않는다.
- PR/CI 검증과 exact revision dev의 Temporal history, Activity retry, Worker restart 증거를 구분한다.

## 2026-10-29 Post 생성 경로 적용 범위

- 신규 API Local Post/Reply/Quote와 원격 Create는 #1334의 공통 `postCreateWorkflow` →
  `createPostActivity`와 effects child를 사용한다. 앞선 non-Temporal 저장 설명은 기존 service 호환 경로다.
- Quote는 admission별 Post ID와 payload별 request ID를 유지하고 기존 owner INITIALIZE에서 Source 잠금·
  owner fence·공통 persistence를 같은 transaction에 연결한다. 결과 회수와 만료 거절의 최신 구현 설명은
  ADR 0030의 2026-10-29 절을 따른다.
