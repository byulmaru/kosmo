## Context

이 기록은 PROD-448의 2026-08-10 최신 본문, 적용되는 ActivityPub canonical domain 문서, PROD-709에서 시작해 PROD-715 PR #564로 `worker` 명칭이 확정된 selector baseline, 취소된 PROD-706 경계와 Fedify 2.3 공식 PostgreSQL MessageQueue API를 독립 대조해 transport ownership, 성공 경계, runtime 분리와 rollout 제약을 확정한다. 내부 파일 배치와 queue table 분할은 장기 호환성 결정이 아니므로 design의 비규범적 선택으로 남긴다.

## Decision Records

### Temporal domain Workflow가 Fedify remote transport를 소유한다

- Decision Date: 2026-08-07
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448의 2026-08-07 `Temporal 전환 결정` 댓글
- Status: Superseded
- Context / Problem: 당시에는 API direct outbound를 제거하면서 recipient 조회, fan-out과 remote delivery를 Temporal Workflow/Activity로 옮기는 방향이 기록됐다.
- Decision Outcome: 이 방향은 더 이상 구현 근거로 사용하지 않는다. 2026-08-10 최신 PROD-448 본문이 Fedify 공식 PostgreSQL MessageQueue adapter와 별도 queue consumer runtime을 transport 단일 owner로 확정했다.
- Alternatives Considered: Temporal Workflow/Activity와 Fedify queue의 결합, Temporal Activity가 remote HTTP delivery를 직접 수행하는 방식.
- Consequences: PROD-718/719/721과 Temporal domain task queue는 PROD-448의 transport 구현 prerequisite 또는 task가 아니다.
- Confirmation / Follow-up: artifacts와 구현에서 domain Workflow/Activity 구현 자체가 normative scope에 들어가지 않는지, 단 전환 전후 retry ownership 계약은 보존되는지 검증한다.

### Fedify 공식 PostgreSQL MessageQueue가 inbox/outbox transport를 소유한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448
- Status: Active
- Context / Problem: durable federation transport를 Domain Workflow, custom relay와 Fedify 중 한 곳에 배정해야 retry와 delivery policy가 중복되지 않는다.
- Decision Outcome: inbound inbox, outbound outbox, recipient fan-out, shared inbox recipient 병합, 기존 ordering option 실행과 remote retry는 Fedify 공식 `@fedify/postgres` `PostgresMessageQueue`와 Fedify queue consumer runtime이 소유한다. protocol-level idempotency 저장소는 이 change에서 확장하지 않는다.
- Alternatives Considered: Temporal Activity direct delivery, NATS/custom queue adapter, Kosmo transactional transport outbox/relay.
- Consequences: Kosmo는 Fedify queue와 경쟁하는 retry, dedupe ledger, remote HTTP worker 또는 transport message model을 만들지 않는다. domain state와 Notification은 기존 owner에 남는다.
- Confirmation / Follow-up: dependency, federation queue option, consumer integration과 integration test가 공식 adapter를 직접 사용하고 custom transport queue가 없는지 확인한다.

### Temporal Activity에서 Fedify queue로 retry ownership을 단계적으로 전환한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448 본문과 2026-08-10 `dependency correction` 댓글
- Status: Active
- Context / Problem: domain effects Workflow는 PROD-448보다 먼저 기존 Fedify delivery Activity를 사용할 수 있으므로, queue 활성화 전후의 retry 성공 경계를 구분하지 않으면 delivery request 실패를 Temporal과 Fedify가 동시에 재시도할 수 있다.
- Decision Outcome: PROD-448 활성화 전에는 기존 delivery Activity 호출 실패를 Temporal Activity가 재시도할 수 있다. queue producer 활성화 후에는 Fedify queue handoff 수락을 Activity 성공으로 반환하고, 그 이후 remote HTTP retry와 기존 ordering option 실행은 Fedify만 소유한다. enqueue 자체가 실패하면 Activity 호출은 실패로 남아 Temporal이 delivery request를 다시 시도할 수 있다.
- Alternatives Considered: domain Workflow 완료를 PROD-448 prerequisite로 만들기, 활성화 전에도 Temporal retry를 금지하기, queue 수락 뒤 Temporal과 Fedify가 같은 remote delivery를 모두 재시도하기.
- Consequences: PROD-722/720/723/725/665는 PROD-448이 차단하지 않는 관련 병렬 capability다. PROD-448 PR completion은 domain Workflow 구현이나 production producer 활성화를 요구하지 않는다.
- Confirmation / Follow-up: direct mode와 queue producer mode의 성공 경계 테스트·문서가 각각 delivery request 완료와 queue handoff 수락을 구분하고, queue 수락 뒤 중복 remote retry owner가 없는지 확인한다.

### Activity 성공 경계는 Fedify queue handoff 수락이다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, PROD-448
- Status: Active
- Context / Problem: queue 도입 뒤 application caller가 remote HTTP 결과까지 기다리면 request isolation이 사라지고, enqueue 성공을 final delivery 성공으로 오해하면 상태 보고가 부정확해진다.
- Decision Outcome: outbound caller의 성공은 Activity, actor identity와 audience가 Fedify queue에 영속 수락된 시점이다. 기존 capability가 이미 정의한 Fedify ordering option은 그대로 전달한다. inbound sender 응답도 검증된 message의 queue 수락을 경계로 하며 실제 listener와 remote HTTP 결과는 별도 consumer 관측이다.
- Alternatives Considered: remote HTTP 2xx까지 기다리는 direct delivery, fire-and-forget Promise, domain transaction과 queue enqueue의 원자 결합.
- Consequences: enqueue failure는 호출 경계에서 관측하지만 remote retry/final failure 처리는 Fedify consumer 경계에 남는다. 이 결정은 domain commit과 queue enqueue 사이를 transactional하게 만들지 않는다.
- Confirmation / Follow-up: slow/unresponsive remote inbox 통합 테스트가 producer 응답을 지연시키지 않는지, enqueue 실패가 성공으로 보고되지 않는지 검증한다.

### Web producer와 Fedify consumer를 별도 runtime으로 분리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-448, PROD-709, PROD-715 PR #564
- Status: Active
- Context / Problem: Web process가 queue consumer도 실행하면 federation spike와 backlog가 request event loop, 배포와 scaling을 다시 결합한다.
- Decision Outcome: 같은 production federation registration과 queue configuration을 재사용하되 producer는 Fedify의 manual-start mode로 enqueue만 수행한다. `packages/fedify`는 library로 유지하고, 별도 non-public `apps/fedify-consumer`만 `Federation.startQueue()`를 실행하며 Web/API와 Temporal Worker와 독립된 Deployment, probe와 shutdown lifecycle을 가진다.
- Alternatives Considered: Web process 안의 자동 consumer, Temporal Worker process에 consumer 합치기, consumer마다 별도 federation listener/dispatcher registration 복제.
- Consequences: 공통 image에 별도 command와 Helm component가 필요하다. producer/consumer configuration drift를 막아야 하며 consumer에는 Service/Ingress를 만들지 않는다.
- Confirmation / Follow-up: Helm render, process test와 실제 queue integration에서 Web은 consume하지 않고 consumer는 public HTTP/Temporal polling을 시작하지 않는지 확인한다.

### Queue transport connection과 trusted execution DB boundary를 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448, PROD-709, PROD-715 PR #564
- Status: Active
- Context / Problem: 현재 API도 outbound producer지만 최신 main의 Worker selector는 Web trusted ingress와 Temporal Worker DB Activity 전용이며 PROD-715가 MessageQueue를 명시적으로 제외한다. queue DML과 consumer의 trusted domain listener SQL은 서로 다른 connection이고, API에 Worker execution credential을 주입하면 least privilege를 깨뜨린다.
- Decision Outcome: Web/API producer와 consumer가 사용하는 Fedify queue transport connection은 별도 `fedifyQueue` 입력으로 두고 API domain DB 또는 Worker source로 fallback하지 않는다. consumer listener SQL만 기존 trusted ingress 경계를 위해 `worker` source를 app의 domain `DATABASE_URL`로 사용한다. 취소된 PROD-706 generic execution-context seam을 재구현하지 않고, Worker selector를 queue credential이나 실제 production cutover 완료로 해석하지 않는다.
- Alternatives Considered: API `DATABASE_URL` 재사용, API에 Worker credential 주입, owner fallback, 범용 system/background execution context.
- Consequences: runtime role/Secret provisioning, GRANT와 실제 production credential cutover는 별도 owner에 남고, API는 queue transport privilege만 받는다. handler SQL execution-boundary migration은 PROD-448 범위가 아니다.
- Confirmation / Follow-up: API/Web/consumer configuration failure, Helm env render, handler DB handle lifecycle과 connection cleanup test로 credential fallback 또는 privilege 혼합이 없는지 검증한다.

### Queue mode는 명시적 default-off atomic configuration을 사용한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-448
- Status: Active
- Context / Problem: credential 존재를 activation으로 사용하면 production DDL/cutover 승인을 우회하고, queue를 항상 필수로 만들면 기존 deployment와 rollback이 기동 불가해진다.
- Decision Outcome: Helm의 default-off producer/consumer flag가 queue credential 환경변수 주입과 consumer Deployment 생성을 제어한다. package는 별도 `direct|producer|consumer` 상태 머신을 만들지 않고 queue URL이 주입된 federation에만 official adapter를 연결하며, consumer command는 queue URL이 없으면 실패한다. adapter가 URL·credential·connection·implicit initialization 오류를 직접 반환한다.
- Alternatives Considered: package-level 3-state runtime mode와 수동 URL/password parser, credential-presence만으로 Helm workload를 활성화, 항상 queue-only startup.
- Consequences: credential values가 존재해도 Helm flag가 꺼져 있으면 runtime에 주입되지 않아 기존 direct mode를 유지한다. enabled Helm render는 완전한 Secret selector를 요구하고, queue가 구성된 runtime은 실패를 direct/owner connection으로 우회하지 않는다.
- Confirmation / Follow-up: default, producer, consumer와 incomplete credential은 구현 시점의 일회성 Helm lint/template inspection으로 확인하고, 실제 adapter enqueue/listen smoke test로 activation과 rollback을 검증한다. 이 변경만을 위한 상시 render harness는 저장소에 추가하지 않는다.

### Dev queue는 같은 cluster의 별도 database와 전용 credential을 사용한다

- Decision Date: 2026-08-11
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-448 사용자 승인과 갱신된 Linear 본문·dev-live 댓글
- Status: Active
- Context / Problem: official `PostgresMessageQueue` adapter는 table name만 받고 schema option을 제공하지 않으며 첫 enqueue/listen에서 unqualified table/index DDL을 실행한다. domain database 안의 별도 schema를 사용하려면 `search_path`와 권한 helper를 추가해야 해 adapter 사용보다 배포 구조가 복잡해진다.
- Decision Outcome: dev queue transport는 기존 CloudNativePG cluster 안의 별도 PostgreSQL database `kosmo_fedify_queue`와 전용 login/Secret을 사용한다. dev credential은 기존 VSO convention에 따라 `kubernetes/kosmo/dev/fedify-queue` Vault path의 `username`/`password`를 `kubernetes.io/basic-auth` Secret으로 동기화한다. API/Web/consumer의 `FEDIFY_QUEUE_DATABASE_*`만 이 database를 가리키며 `DATABASE_URL`, `OPERATION_DATABASE_URL` 또는 `WORKER_DATABASE_*`로 fallback하지 않는다. adapter가 queue database 안의 table/index implicit DDL을 소유하고 custom schema, `search_path` helper, Drizzle migration 또는 one-shot queue DDL command를 추가하지 않는다.
- Alternatives Considered: domain `kosmo` database의 `public` schema 사용, domain database 안의 별도 schema와 role-level/URL `search_path`, 별도 PostgreSQL cluster.
- Consequences: 같은 cluster이므로 물리 장애 격리는 늘지 않지만 namespace, credential과 DDL 범위가 분리된다. consumer는 queue database connection과 trusted domain listener connection 두 개를 유지한다. queue database/login/Secret 생성은 dev에서만 먼저 수행하고 production 준비·활성화는 별도 승인을 유지한다.
- Confirmation / Follow-up: Helm/CloudNativePG render에서 database·role·Secret과 queue URL target을 확인하고, dev에서 adapter implicit initialization, producer/consumer handoff와 dequeue 전 restart persistence를 검증한다.

### Production queue database 준비와 runtime 활성화는 별도 승인한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448
- Status: Active
- Context / Problem: code/PR completion과 실제 database schema mutation, consumer rollout, producer cutover는 위험과 증거가 서로 다르다.
- Decision Outcome: 구현과 nonproduction 검증은 production mutation 없이 완료한다. production queue database·credential 준비, consumer 최초 activation과 adapter implicit initialization, producer queue 활성화는 각 정확한 대상과 현재 evidence를 제시하고 별도 사용자 승인을 받은 작업만 수행한다. 별도 custom schema migration/one-shot DDL command는 만들지 않는다.
- Alternatives Considered: domain database 안에 custom schema bootstrap 추가, adapter initialization과 별도 DDL command 중복, dev database 선택을 production apply 승인으로 일반화.
- Consequences: PR Ready 상태가 dev live 또는 production 활성화를 뜻하지 않는다. rollback에서도 queue purge/table drop은 별도 파괴적 승인 없이는 실행하지 않는다.
- Confirmation / Follow-up: PR 본문과 완료 보고에서 local/CI, dev live, production apply/cutover 증거를 분리한다.

### 운영 backlog metric과 exporter는 PROD-448 완료 범위에서 제외한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448 사용자 review 결정과 갱신된 Linear 본문
- Status: Active
- Context / Problem: official adapter startup/restart 검증과 production backlog·처리 지연·retry/permanent-failure 관측 backend는 별도 운영 lifecycle과 배포 책임을 가진다.
- Decision Outcome: PROD-448은 production metric, exporter, dashboard 또는 주기적 polling endpoint를 완료 조건에 포함하지 않는다. startup/readiness를 위해 `getDepth()`를 중복 호출하지 않고 enqueue/listen의 official lazy initialization을 사용한다.
- Alternatives Considered: consumer private endpoint, 주기적 depth logger, OpenTelemetry exporter를 이 PR에 추가하는 방식.
- Consequences: queue runtime은 별도 관측 backend 없이도 PR completion 가능하며, 운영 observability가 필요하면 독립 capability가 소유한다.
- Confirmation / Follow-up: spec/task/PR 설명이 startup 검증을 runtime backlog 관측으로 과장하지 않는지 확인한다.

### dequeue 뒤 handler process crash 누락을 adapter 밖에서 보강하지 않는다

- Decision Date: 2026-08-11
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448 본문과 2026-08-05 contract correction 댓글
- Status: Active
- Context / Problem: `PostgresMessageQueue` 2.3은 message row를 dequeue한 뒤 handler를 호출하므로 handler 완료 전 process crash에 대한 ack/redelivery 보장을 제공하지 않는다.
- Decision Outcome: PROD-448은 queue가 수락하고 아직 dequeue하지 않은 message가 producer/ingress 종료와 consumer 재연결 뒤 소비되는 영속성만 검증한다. dequeue→handler crash window는 수용하고 이를 보강하는 custom ack, lease, requeue, ledger 또는 relay를 구현하지 않는다.
- Alternatives Considered: Kosmo-owned ack table/lease worker, transactional relay, adapter 내부 semantics를 복제하는 wrapper.
- Consequences: ordinary handler/remote failure retry는 살아 있는 Fedify consumer가 소유하지만 process crash 중 in-flight message의 at-least-once delivery는 주장하지 않는다.
- Confirmation / Follow-up: 통합 테스트와 PR 설명이 queued persistence를 in-flight crash redelivery로 확장하지 않는지 확인한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-07 PROD-448 댓글의 Temporal Workflow/Activity transport ownership은 2026-08-10 최신 PROD-448 본문과 위의 `Fedify 공식 PostgreSQL MessageQueue가 inbox/outbox transport를 소유한다` 결정으로 대체됐다.
- 2026-07~08의 NATS transactional outbox 또는 post-commit best-effort queue 전제는 현재 PROD-448 완료 계약의 근거가 아니다.
