## Ownership and dependency boundary

- **Implementation / PR / dev-live evidence owner:** PROD-448
- **Canceled former dependency:** PROD-706 / PR #543은 취소·unmerged close됐고 PROD-448 blocker가 아니다. 해당 branch나 execution-context seam을 소비하지 않는다.
- **Consumed completed selector baseline:** PROD-709. Its completion is not queue database, role, Secret, GRANT, adapter initialization, or credential cutover completion.
- **Related parallel capabilities:** PROD-722/720/723/725/665. They may use existing Fedify delivery Activities before PROD-448 and are neither blocked by nor prerequisites of this change.
- **Excluded downstream ownership:** API/Worker runtime role provisioning and production credential/GRANT cutover remain their own issues; production apply/rollout/cutover additionally requires explicit user approval.

## 1. PROD-448 선행 경계와 Fedify adapter baseline 확정

**Authority / Provenance**

- `PROD-448`
- `PROD-709`

**Deliverable**

최신 main에서 Fedify queue 구현이 사용할 DB execution boundary, 역할별 credential 입력과 공식 PostgreSQL MessageQueue API가 충돌 없이 확정된다.

**Guardrails**

- 취소된 PROD-706 branch/PR #543을 cherry-pick하거나 generic execution-context seam을 재구현하지 않는다.
- PROD-709의 selector 완료를 role/Secret provisioning 또는 실제 credential cutover 완료로 해석하지 않는다.
- Domain Workflow 구현, Temporal Worker/task queue와 transactional Workflow intent/outbox/relay를 prerequisite로 추가하지 않는다.

**Verification**

- PROD-706 취소, PR #543 unmerged close와 최신 Linear 관계를 확인하고 fresh main에서 기존 Fedify package version을 기록한다.
- 공식 adapter의 queue start/stop, ordering, retry ownership, depth와 PostgreSQL schema/connection 요구사항을 installed exact version에서 확인한다.

- [x] 1.1 PROD-706 취소·PR #543 unmerged close, PROD-709 완료와 PROD-448 최신 본문·관계를 다시 확인한다.
- [x] 1.2 최신 main의 Fedify federation/context, credential selector, runtime image와 Helm 경계를 재조사한다.
- [x] 1.3 현재 Fedify version과 호환되는 공식 PostgreSQL MessageQueue dependency/API 및 schema 권한 요구사항을 검증한다.

## 2. PROD-448 PostgreSQL queue handoff와 connection lifecycle

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `PROD-448`
- `PROD-709`

**Deliverable**

Fedify producer와 consumer가 같은 durable PostgreSQL inbox/outbox/fan-out transport에 연결되고, queue transport connection과 trusted execution DB boundary 및 adapter-managed table initialization lifecycle을 명시적으로 관리한다.

**Guardrails**

- 공식 `@fedify/postgres` adapter를 사용하고 custom retry queue나 transport ledger를 만들지 않는다.
- API domain credential, trusted Worker execution credential 또는 전역 owner connection으로 조용히 fallback하지 않고 API에 Worker credential을 주입하지 않는다.
- production queue database·credential 준비, 최초 adapter initialization과 queue 활성화는 수행하지 않는다.

**Verification**

- disabled mode, 완전한 transport credential, 누락/부분 credential, connection 종료와 pool leak을 검증한다.
- 격리 PostgreSQL에서 exact adapter의 implicit table initialization과 producer/consumer compatibility를 검증하고 production database/credential/GRANT/activation은 evidence로만 남긴다.

- [x] 2.1 Fedify version에 맞는 공식 PostgreSQL MessageQueue dependency를 package manager CLI로 추가한다.
- [x] 2.2 API/Web/consumer의 queue transport connection을 domain/API DB와 Worker execution DB에서 분리하고 명시적 종료 lifecycle을 구현한다.
- [x] 2.3 명시적 default-off queue mode와 atomic validation을 추가하고, enabled mode의 direct/owner fallback과 이중 발송을 금지한다.
- [x] 2.4 inbox/outbox/fan-out queue 구성을 production federation registration에 연결한다.
- [x] 2.5 test DB wrapper가 격리 transport URL을 명시하도록 하고 exact adapter implicit initialization, 완전/부분 구성과 connection cleanup 회귀 검증을 추가한다.

## 3. PROD-448 inbound/outbound transport ownership 전환

**Authority / Provenance**

- `docs/domain/objects/post.md`
- `docs/domain/objects/reaction.md`
- `docs/domain/objects/follow-relationship.md`
- `docs/domain/objects/follow-request.md`
- `docs/domain/objects/profile.md`
- `docs/domain/objects/instance.md`
- `PROD-448`

**Deliverable**

inbound sender와 outbound domain effect가 Fedify queue handoff까지만 기다리고, listener 실행·remote HTTP delivery·retry, 기존 ordering option 실행과 shared inbox recipient 병합은 Fedify consumer가 수행한다.

**Guardrails**

- 기존 actor/object identity, audience, domain idempotency와 이미 정의된 Fedify ordering option을 유지하며 새 key 또는 dedupe storage를 설계하지 않는다.
- domain state transition, Notification lifecycle 또는 source transaction을 transport runtime으로 이동하지 않는다.
- queue handoff가 수락된 뒤 direct remote HTTP, `immediate: true`, fire-and-forget Promise, Temporal remote-delivery retry 또는 별도 relay로 queue를 우회하지 않는다. queue 활성화 전 delivery request 실패와 활성화 후 enqueue 실패의 Temporal Activity retry는 허용한다.

**Verification**

- 실제 PostgreSQL queue로 personal/shared inbox 수락과 listener 지연 실행, enqueue 실패 응답, restart 뒤 재소비를 검증한다.
- 느린/무응답 remote inbox에서도 outbound producer가 queue handoff 뒤 반환하고, Fedify가 retry, 기존 ordering option과 shared inbox fan-out recipient 병합을 소유하는지 검증한다.

- [x] 3.1 Web ingress를 enqueue-only producer로 전환하고 personal/shared inbox가 같은 official inbox queue를 사용하게 한다.
- [x] 3.2 outbound Fedify context가 activity, actor identity, audience와 기존 callsite의 Fedify ordering option을 durable outbox/fan-out queue에 handoff하게 한다.
- [x] 3.3 exact adapter의 handoff·depth·소비·abort를 격리 PostgreSQL에서 검증하고, 기존 ordering option 및 shared inbox recipient 병합이 Fedify core에서 queue message로 보존됨을 확인한다.
- [x] 3.4 전체 Fedify callsite를 점검해 production queue 우회, 기존 ordering option 손실과 중복 transport owner가 없음을 확인한다.
- [x] 3.5 protocol idempotency나 새 ordering contract가 필요하다는 요구가 생기면 신규 key·KV·custom dedupe를 구현하지 않고 별도 upstream Gate를 연다.

## 4. PROD-448 독립 Fedify queue consumer runtime

**Authority / Provenance**

- `PROD-448`
- `PROD-709`

**Deliverable**

Fedify queue consumer를 Web/API와 Temporal Worker 없이 독립 실행·배포·확장·재시작·rollback할 수 있고, health/readiness와 graceful shutdown으로 처리 가능 상태를 관측할 수 있다.

**Guardrails**

- consumer는 public Service/Ingress에 노출하지 않는다.
- Web producer는 queue를 소비하지 않고 consumer는 Temporal task queue 또는 HTTP ingress를 시작하지 않는다.
- component는 production에서 자동 활성화하지 않는다.

**Verification**

- child-process 또는 동등한 integration test로 invalid config, startup readiness, SIGTERM readiness-down/abort/connection cleanup을 검증한다.
- Helm default render가 기존 runtime을 활성화하지 않고 opt-in render가 독립 Deployment, Fedify credential, probes, replicas/resources를 제공하는지 lint/render로 확인한다.

- [x] 4.1 동일한 production federation registration으로 inbox/outbox/fan-out queue만 소비하는 별도 runtime entrypoint와 lifecycle을 구현한다.
- [x] 4.2 liveness/readiness와 SIGINT/SIGTERM graceful shutdown을 구현하고 process lifecycle 검증을 추가한다.
- [x] 4.3 공통 image에 독립 consumer command를 포함하고 기본 비활성 Helm component를 추가한다.
- [x] 4.4 dev/prod opt-in Helm lint/render, 독립 replica/resource/credential/probe와 Service/Ingress 부재를 검증한다.

## 5. PROD-448 queue 관측과 안전한 복구 evidence

**Authority / Provenance**

- `PROD-448`

**Deliverable**

운영자가 Fedify `getDepth()`와 제공되는 reporter 경계 안에서 enqueue failure, backlog, 처리 지연, retry/permanent failure와 listener 오류를 payload/credential 노출 없이 구분하고 restart·duplicate·반복 실패를 검증할 수 있다.

**Guardrails**

- shared queue depth를 inbox/outbox/fan-out 역할별로 중복 집계하지 않는다.
- queue depth를 in-flight 또는 domain delivery 완료로 표현하지 않는다.
- raw Activity payload, database credential와 signing key material을 log/metric에 포함하지 않는다.

**Verification**

- queue depth와 exact Fedify version이 제공하는 queue/delivery/inbox signal이 의미별로 분리되고 secret/payload가 없는지 관측 테스트로 확인한다. 새 exporter backend는 PROD-448 완료에 필수로 추가하지 않는다.
- 반복 실패, consumer restart와 duplicate 시나리오에서 operator-visible identity/classification과 안전한 복구 evidence를 확인한다.

- [x] 5.1 `getDepth()`를 consumer startup/readiness와 격리 adapter 검증에 사용하고 exact Fedify version의 queue signal 경계를 보존한다.
- [x] 5.2 configuration, startup/listener failure를 process 실패로 유지하고 payload·credential을 별도 log/metric에 추가하지 않는다.
- [x] 5.3 격리 queue에서 backlog depth, consume와 abort/restart 가능한 connection cleanup을 검증하고 production purge/replay를 추가하지 않는다.

## 6. PROD-448 PR completion 검증과 publication

**Authority / Provenance**

- `PROD-448`

**Deliverable**

PROD-448의 코드·adapter-managed initialization·chart와 nonproduction 검증이 하나의 review 가능한 PR로 제공되며, PR completion과 dev/production live 상태가 명확히 구분된다.

**Guardrails**

- production values 변경, database sync/apply, Argo CD sync/apply, credential cutover와 traffic activation을 수행하지 않는다.
- PR readiness를 dev live verification 또는 production completion으로 표현하지 않는다.
- change archive는 모든 requirement와 task 완료, 필요한 live evidence와 Completion Gate를 별도로 확인한 뒤 수행한다.

**Verification**

- package TypeScript/lint/unit/integration, 격리 DB Fedify 전체 테스트, root checks, strict OpenSpec validation, Helm lint/render, image/entrypoint smoke와 hosted CI를 각각 기록한다.
- PR 본문에 handoff 성공 경계, transport ownership, PROD-706 취소 baseline, 중요한 구현 결정, production 미적용과 dev live 미실행/실행 상태를 구분한다.

- [x] 6.1 변경 package와 workspace 정적 검사, unit/integration, 격리 DB, Helm과 image/entrypoint 검증을 통과시킨다.
- [x] 6.2 `openspec validate configure-fedify-postgres-message-queue-runtime --strict`와 repository 전체 관련 검증을 통과시킨다.
- [x] 6.3 self-review로 domain/Notification/Temporal/production 범위 침범과 secret 노출을 점검하고 finding을 해결한다.
- [x] 6.4 commit, push, Ready PR 생성과 hosted CI 확인 후 Linear에 PR completion evidence를 동기화한다.

## 7. PROD-448 dev live verification

**Authority / Provenance**

- `PROD-448`

**Deliverable**

PR completion과 별도로 dev 환경에서 실제 Fedify queue producer/consumer handoff, restart와 독립 rollout 동작을 확인한 evidence가 제공된다.

**Guardrails**

- dev verification을 production 검증으로 일반화하지 않는다.
- production sync/apply 또는 production credential/traffic 변경을 함께 수행하지 않는다.
- dev에서 파괴적인 queue purge/table drop을 수행하지 않는다.

**Verification**

- dev의 현재 schema/credential/deployment 상태를 먼저 읽고, 실제 inbound/outbound canary handoff, queue depth 변화, consumer restart 뒤 처리와 Web/consumer 독립 rollout을 관측한다.
- dev 미실행이면 미실행 사유와 PR completion evidence만 명확히 보고한다.

- [ ] 7.1 dev 현재 상태와 안전한 canary/rollback 대상을 확인하고 live verification 범위를 기록한다.
- [ ] 7.2 dev에서 producer handoff, consumer 처리, queue depth와 restart 복구를 검증한다.
- [ ] 7.3 dev live 결과와 남은 production apply/cutover gate를 Linear와 PR에 구분해 기록한다.
