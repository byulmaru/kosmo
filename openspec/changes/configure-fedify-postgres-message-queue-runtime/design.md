## Context

현재 production federation은 `packages/fedify/src/federation.ts`에서 `MemoryKvStore`만 사용해 생성되고 queue가 없으므로 Web의 `federation.fetch()`와 `Context.sendActivity()`가 listener 및 remote HTTP delivery를 같은 process에서 직접 실행한다. outbound에는 production federation 외에도 local instance identity를 context data로 받는 별도 federation이 있고, 여러 delivery helper가 이미 lifecycle별 `orderingKey`와 shared inbox preference를 Fedify에 전달한다.

PROD-709가 Web 및 공통 image의 Worker에 역할별 `FEDIFY_DATABASE_URL`/`FEDIFY_DATABASE_PASSWORD` 입력을 준비했지만 실제 connection과 credential cutover는 하지 않았고 API에는 이 입력이 없다. 현재 GraphQL API process가 outbound core effect를 직접 호출하므로 queue mode의 API producer에는 domain/API DB나 trusted Worker execution DB와 다른 queue transport 입력이 필요하다. PROD-706은 취소됐고 PR #543도 merge 없이 닫혔으므로 generic Fedify DB execution-context seam을 구현 근거로 사용하지 않는다. PROD-448은 취소된 코드를 되살리지 않고 현재 main의 trusted ingress listener DB 동작을 보존하면서 transport runtime만 분리한다.

Fedify 2.3의 공식 권장 분리는 producer process에서 `manuallyStartQueue: true`로 enqueue만 하고, load balancer에 노출하지 않은 별도 process에서 동일한 federation registration을 구성한 뒤 `Federation.startQueue()`를 AbortSignal과 함께 실행하는 방식이다. `PostgresMessageQueue`는 persistent multi-worker backend, ordering key와 `getDepth()`를 제공하며 native retry backend가 아니므로 remote retry policy는 Fedify가 적용한다.

## Goals / Non-Goals

**Goals:**

- inbound inbox와 outbound outbox/fan-out을 공식 `@fedify/postgres` adapter에 영속 handoff한다.
- Web producer와 별도 Fedify consumer를 같은 federation contract 위에서 분리한다.
- queue handoff 수락을 application-facing 성공 경계로 만들고 remote retry, 기존 ordering option 실행과 shared inbox recipient 병합을 Fedify 한 곳에 둔다.
- 독립 Deployment, health/readiness, graceful shutdown, depth/처리/실패 관측과 restart/duplicate 검증을 제공한다.
- production queue database·credential 준비, 최초 adapter initialization, rollout과 live traffic 전환을 별도 승인 가능한 단계로 유지한다.

**Non-Goals:**

- Post, Reaction, Follow, Profile domain state transition 또는 Notification lifecycle 변경
- Temporal task queue, Workflow/Activity registration, Workflow ID, transactional Workflow intent/outbox/relay
- Activity vocabulary, actor/object identity, audience, 기존 activity별 idempotency와 domain DB schema 재정의
- API viewer RLS, API/Worker runtime role·Secret·GRANT provisioning 또는 owner credential 제거
- 사용자용 delivery history/status UI

## Implementation Guidance

### Current Constraints

- production inbound registration과 actor/object dispatcher가 하나의 module-level federation에 결합되어 있다. Web과 consumer가 서로 다른 registration을 구성하면 signature, dispatcher 또는 listener behavior가 갈라질 수 있다.
- local outbound federation은 매 호출의 Local Instance ID를 context data로 받아 signing identity를 구성한다. queue runtime 전환은 기존 actor/signing identity를 보존해야 하지만 PROD-448에서 새 identity 또는 ordering contract를 만들지 않는다.
- queue가 없는 현재 `sendActivity()` callsite 일부는 remote HTTP completion을 기다리는 것처럼 보이지만, queue 추가 뒤 같은 Promise는 enqueue handoff만 증명한다. 테스트 assertion과 오류 메시지가 이 의미를 혼동할 수 있다.
- 취소된 PROD-706 branch도 `federation.ts`를 수정했지만 merge 대상이 아니다. 그 branch를 cherry-pick하거나 generic execution-context seam을 PROD-448에서 재구현하면 취소 결정을 우회한다.
- `PostgresMessageQueue`와 consumer parallelism은 PostgreSQL connection을 사용한다. connection pool을 API/Web 기본 DB pool과 무비판적으로 공유하면 queue backlog 때 connection starvation이 생길 수 있다.
- `PostgresMessageQueue`는 첫 `enqueue()`/`listen()`에서 `CREATE TABLE`, `ALTER TABLE`, `CREATE INDEX IF NOT EXISTS`를 실행한다. 별도 one-shot schema command를 중복 구현하지 않고, production에서는 queue 전용 database/credential 준비와 최초 mode 활성화를 함께 명시적으로 승인해야 한다.
- 기존 test DB wrapper는 `DATABASE_URL`만 격리 DB로 바꾼다. queue 통합 테스트는 별도 transport URL을 같은 격리 DB로 명시해 owner/API DB fallback 부재를 검증해야 한다.

### Recommended Approach

1. 최신 main에서 federation construction을 하나의 production registration factory로 정리한다. Web producer와 Fedify consumer는 같은 actor/object/inbox listener registration을 재사용하고, listener SQL은 현재 trusted ingress DB 동작을 보존한다. generic execution-context seam이나 handler SQL migration은 추가하지 않는다.
2. exact Fedify 2.3 호환 `@fedify/postgres` dependency, `PostgresMessageQueue`와 전용 PostgreSQL client/pool을 추가하고, inbox/outbox/fan-out에 같은 durable transport contract를 제공한다. 역할을 분리한 queue instance/table을 선택하더라도 enqueue와 consumer 양쪽에서 정확히 같은 구성을 사용한다. PROD-448은 별도 KV adapter를 추가하지 않는다.
3. producer federation은 `manuallyStartQueue: true`로 구성해 Web/API process가 queue를 소비하지 않게 한다. API/Web producer와 consumer의 queue transport connection은 API domain DB 및 trusted Worker execution DB와 분리하고, API에 Worker credential을 주입하지 않는다. queue consumer entrypoint는 같은 federation의 `startQueue()`만 실행하고 public HTTP listener나 Temporal Worker를 시작하지 않는다.
4. consumer process는 작은 probe server 또는 동등한 platform-native probe 경계를 두어 process 생존과 실제 queue 시작 완료를 분리한다. SIGTERM/SIGINT에서는 readiness를 내린 뒤 AbortController로 Fedify listener를 중단하고 queue용 PostgreSQL client를 정리한다.
5. 공통 image에 별도 `fedify-queue` command를 추가하고 Helm에 Web/Temporal Worker와 독립된 기본 비활성 Fedify consumer Deployment를 둔다. Service/Ingress는 만들지 않고 replica/resource/probe/Fedify credential을 별도로 render한다.
6. exact adapter의 implicit `initialize()`가 queue connection 대상 database 안의 기본 table/index를 소유하게 하고 Drizzle domain migration, custom DDL 또는 transport ledger를 만들지 않는다. dev/test에서는 격리 DB에서 초기화를 검증한다. production isolation이 필요하면 custom schema보다 별도 queue database/credential을 우선하고, 그 database 준비와 최초 producer/consumer 활성화는 별도 승인한다.
7. 기존 activity별 delivery 테스트는 identity/audience와 이미 존재하는 Fedify ordering option을 보존하는지만 검증한다. 새 integration test는 실제 PostgreSQL queue로 inbound/outbound handoff, restart 후 소비와 Fedify-owned remote retry 경계를 검증한다. protocol-level idempotency나 새로운 ordering contract를 이 change의 검증 대상으로 확장하지 않는다.
8. `getDepth()`와 Fedify OpenTelemetry queue/delivery/inbox metric을 기존 관측 경계에 연결하되 shared queue를 역할별로 중복 집계하지 않는다. 안전한 queue role/attempt/error classification만 기록하고 payload와 key material은 제외한다.
9. queue mode는 producer와 consumer 모두 명시적 default-off flag로 제어한다. disabled일 때만 기존 direct mode를 유지하고, enabled일 때 transport credential이 빠지거나 adapter initialization이 실패하면 direct/owner fallback 없이 fail closed한다. credential 존재만으로 활성화하지 않지만 명시적 activation 뒤에는 adapter implicit DDL을 허용한다.

### Allowed Alternatives

- 하나의 shared `PostgresMessageQueue` instance/table 또는 inbox/outbox/fan-out별 instance/table을 사용할 수 있다. 어느 쪽이든 Web과 consumer의 구성이 일치하고, 기존 ordering option·recipient 병합·retry owner가 Fedify이며, depth를 중복 집계하지 않고 독립 복구 가능해야 한다.
- 새 workspace app 대신 `packages/fedify`의 executable entrypoint를 공통 image command로 직접 실행할 수 있다. package ownership, health lifecycle과 testability가 같은 수준이면 허용한다.
- probe server 대신 배포 platform이 process readiness와 Fedify queue startup을 정확히 구분할 수 있는 native mechanism을 제공하면 사용할 수 있다. worker를 public Service/Ingress에 연결해서는 안 된다.

### Known Traps

- Temporal Worker command/Deployment에 Fedify `startQueue()`를 함께 넣어 두 runtime의 scaling, failure와 rollout을 결합하지 않는다.
- `sendActivity({ immediate: true })`, 직접 `fetch(remoteInbox)`, 별도 retry loop 또는 fire-and-forget Promise로 queue를 우회하지 않는다.
- queue enqueue를 domain source transaction 안에 넣거나 transactional Workflow outbox/relay를 추가하지 않는다. 이 capability의 성공 경계는 Fedify queue handoff이며 domain rollback/no-op은 기존 activity별 caller가 계속 통제한다.
- Web producer에서도 queue consumer를 자동 시작하지 않는다. consumer를 Service/Ingress 뒤에 노출하지 않는다.
- 취소된 PROD-706 branch를 cherry-pick하거나 PR #543의 generic execution-context seam을 PROD-448에서 되살리지 않는다.
- `@fedify/postgres`의 table shape를 추측해 독립 custom queue나 retry ledger를 만들지 않는다.
- API producer에 trusted Worker execution credential을 주입하거나 queue transport connection을 API domain DB로 fallback하지 않는다.
- shared-inbox dedupe를 이유로 별도 KV adapter나 custom table을 추가하지 않고, ordering ownership을 이유로 기존 capability에 없는 key를 새로 설계하지 않는다.
- queue depth를 domain delivery 완료 수나 in-flight 작업 수로 해석하지 않는다.

## Risks / Trade-offs

- [Fedify adapter의 실제 crash/retry 보장이 최신 PROD-448 완료 기준보다 약할 수 있음] → exact version의 실제 PostgreSQL integration test로 dequeue 중 process termination과 restart를 검증하고, 보장이 성립하지 않으면 custom relay를 추가하지 말고 Linear/OpenSpec upstream 계약을 다시 검토한다.
- [분리 consumer 도입 시 Web과 worker registration drift] → 같은 production registration factory와 동일한 configuration contract를 사용하고 producer/consumer compatibility test를 둔다.
- [PostgreSQL connection starvation] → queue 전용 pool과 보수적 concurrency를 기본으로 하고, parallelism을 늘릴 때 pool headroom과 backlog drain을 함께 검증한다.
- [implicit adapter DDL이 의도하지 않은 database를 변경] → queue transport URL을 domain database와 분리하고 production queue database/credential 준비 및 최초 activation을 하나의 명시적 승인 대상으로 제시한다.
- [비동기 handoff로 기존 테스트와 운영자가 remote delivery 성공을 과대 해석] → queue handoff, dequeued attempt, final/permanent failure metric과 보고 문구를 분리한다.
- [기존 domain idempotency가 모든 duplicate timing을 견디지 못할 수 있음] → activity별 integration test로 검증하고 transport change가 domain transition을 새로 소유하지 않게 한다.
- [Fedify MessageQueue 전환이 기존 ordering option 또는 shared inbox recipient 병합을 손실할 수 있음] → 기존 callsite option과 fan-out 결과를 검증하되, PROD-448에서 KV/custom dedupe나 신규 ordering key를 추가하지 않는다.
- [default-off 전환 중 direct와 queue producer가 동시에 활성화될 수 있음] → 하나의 명시적 producer mode와 atomic configuration validation으로 이중 발송을 막는다.

## Migration Plan

1. PROD-706 취소와 PR #543 unmerged close를 기록하고 최신 main에서 queue runtime baseline을 다시 조사한다.
2. dependency, queue construction, producer/consumer 분리, entrypoint, probes, observability와 격리 PostgreSQL 통합 테스트를 구현한다.
3. local/CI에서 adapter implicit initialization, handoff, restart, 기존 ordering option 보존, shared inbox recipient 병합, retry/failure, graceful shutdown과 Helm default/opt-in render를 검증한다.
4. 구현 PR은 production mutation 없이 Ready로 만들고 PR completion evidence와 미실행 dev live/production verification을 구분한다.
5. 별도 승인을 받은 경우에만 dev queue mode를 활성화해 adapter initialization, consumer rollout과 live enqueue/consume/restart를 검증한다.
6. production은 다시 queue database/credential과 backlog 상태를 확인하고, 별도 승인된 queue database 준비 → consumer 최초 activation/implicit initialization → producer queue cutover 순서로 진행한다. 각 단계는 이전 direct path 또는 disabled consumer로 rollback 가능해야 한다.
7. rollback 시 새 producer enqueue를 먼저 중단하고 queue backlog의 처리/보존 결정을 명시한 뒤 consumer를 내린다. queue table 삭제나 purge는 별도 파괴적 승인 없이는 수행하지 않는다.

## Open Questions

없음. shared queue의 물리적 table 분할과 package/app 배치는 specs와 decisions를 만족하는 범위의 구현 선택으로 남긴다.
