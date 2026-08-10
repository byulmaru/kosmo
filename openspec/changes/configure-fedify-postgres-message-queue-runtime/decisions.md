## Context

이 기록은 PROD-448의 2026-08-10 최신 본문, 적용되는 ActivityPub canonical domain 문서, 완료된 PROD-709 selector baseline, 취소된 PROD-706 경계와 Fedify 2.3 공식 PostgreSQL MessageQueue API를 독립 대조해 transport ownership, 성공 경계, runtime 분리와 rollout 제약을 확정한다. 내부 파일 배치와 queue table 분할은 장기 호환성 결정이 아니므로 design의 비규범적 선택으로 남긴다.

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
- Confirmation / Follow-up: artifacts와 구현에서 Temporal Workflow, Activity, task queue, transactional Workflow intent/outbox/relay 참조가 normative scope에 들어가지 않는지 검증한다.

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

### Activity 성공 경계는 Fedify queue handoff 수락이다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, PROD-448
- Status: Active
- Context / Problem: queue 도입 뒤 application caller가 remote HTTP 결과까지 기다리면 request isolation이 사라지고, enqueue 성공을 final delivery 성공으로 오해하면 상태 보고가 부정확해진다.
- Decision Outcome: outbound caller의 성공은 Activity, actor identity와 audience가 Fedify queue에 영속 수락된 시점이다. 기존 capability가 이미 정의한 Fedify ordering option은 그대로 전달한다. inbound sender 응답도 검증된 message의 queue 수락을 경계로 하며 실제 listener와 remote HTTP 결과는 별도 consumer 관측이다.
- Alternatives Considered: remote HTTP 2xx까지 기다리는 direct delivery, fire-and-forget Promise, domain transaction과 queue enqueue의 원자 결합.
- Consequences: enqueue failure는 호출 경계에서 관측하지만 remote retry/final failure는 Fedify metric/error boundary에서 관측한다. 이 결정은 domain commit과 queue enqueue 사이를 transactional하게 만들지 않는다.
- Confirmation / Follow-up: slow/unresponsive remote inbox 통합 테스트가 producer 응답을 지연시키지 않는지, enqueue 실패가 성공으로 보고되지 않는지 검증한다.

### Web producer와 Fedify consumer를 별도 runtime으로 분리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-448, PROD-709
- Status: Active
- Context / Problem: Web process가 queue consumer도 실행하면 federation spike와 backlog가 request event loop, 배포와 scaling을 다시 결합한다.
- Decision Outcome: 같은 production federation registration과 queue configuration을 재사용하되 producer는 Fedify의 manual-start mode로 enqueue만 수행하고, 별도 non-public consumer runtime만 `Federation.startQueue()`를 실행한다. consumer는 Web/API와 Temporal Worker와 독립된 Deployment, probe와 shutdown lifecycle을 가진다.
- Alternatives Considered: Web process 안의 자동 consumer, Temporal Worker process에 consumer 합치기, consumer마다 별도 federation listener/dispatcher registration 복제.
- Consequences: 공통 image에 별도 command와 Helm component가 필요하다. producer/consumer configuration drift를 막아야 하며 consumer에는 Service/Ingress를 만들지 않는다.
- Confirmation / Follow-up: Helm render, process test와 실제 queue integration에서 Web은 consume하지 않고 consumer는 public HTTP/Temporal polling을 시작하지 않는지 확인한다.

### Queue transport connection과 trusted execution DB boundary를 분리한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448, PROD-709
- Status: Active
- Context / Problem: 현재 API도 outbound producer지만 PROD-709 selector는 Web/Worker seam만 준비했다. queue DML과 consumer의 trusted domain listener SQL은 서로 다른 privilege를 요구할 수 있고, API에 Worker execution credential을 주입하면 least privilege를 깨뜨린다.
- Decision Outcome: Web/API producer와 consumer가 사용하는 Fedify queue transport connection은 API domain DB 및 trusted Worker execution DB와 별도 입력으로 둔다. consumer listener SQL은 현재 main의 trusted ingress DB 동작을 보존한다. 취소된 PROD-706 generic execution-context seam을 재구현하지 않고, PROD-709 selector 완료를 실제 credential 전환 완료로 해석하지 않는다.
- Alternatives Considered: API `DATABASE_URL` 재사용, API에 Worker credential 주입, owner fallback, 범용 system/background execution context.
- Consequences: runtime role/Secret provisioning, GRANT와 실제 production credential cutover는 별도 owner에 남고, API는 queue transport privilege만 받는다. handler SQL execution-boundary migration은 PROD-448 범위가 아니다.
- Confirmation / Follow-up: API/Web/consumer configuration failure, Helm env render, handler DB handle lifecycle과 connection cleanup test로 credential fallback 또는 privilege 혼합이 없는지 검증한다.

### Queue mode는 명시적 default-off atomic configuration을 사용한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-448
- Status: Active
- Context / Problem: credential 존재를 activation으로 사용하면 production DDL/cutover 승인을 우회하고, queue를 항상 필수로 만들면 기존 deployment와 rollback이 기동 불가해진다.
- Decision Outcome: producer와 consumer queue mode를 명시적 default-off 설정으로 제어한다. disabled producer만 기존 direct mode를 유지하고, enabled mode는 완전한 transport credential이 없거나 official adapter initialization이 실패하면 direct/owner fallback 없이 fail closed한다. 명시적 activation 뒤의 adapter implicit DDL은 허용한다.
- Alternatives Considered: credential-presence activation, 항상 queue-only startup, enabled 상태의 silent direct fallback.
- Consequences: Web/API/consumer와 Helm default/opt-in render가 같은 mode contract를 공유해야 하며 direct와 queue가 동시에 발송해서는 안 된다.
- Confirmation / Follow-up: disabled, enabled-complete, enabled-partial configuration과 Helm render test로 activation과 rollback을 검증한다.

### Production queue database 준비와 runtime 활성화는 별도 승인한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: PROD-448
- Status: Active
- Context / Problem: code/PR completion과 실제 database schema mutation, consumer rollout, producer cutover는 위험과 증거가 서로 다르다.
- Decision Outcome: 구현과 nonproduction 검증은 production mutation 없이 완료한다. production queue database·credential 준비, consumer 최초 activation과 adapter implicit initialization, producer queue 활성화는 각 정확한 대상과 현재 evidence를 제시하고 별도 사용자 승인을 받은 작업만 수행한다. 별도 custom schema migration/one-shot DDL command는 만들지 않는다.
- Alternatives Considered: domain database 안에 custom schema bootstrap 추가, adapter initialization과 별도 DDL command 중복, dev 검증을 production 완료로 일반화.
- Consequences: PR Ready 상태가 dev live 또는 production 활성화를 뜻하지 않는다. rollback에서도 queue purge/table drop은 별도 파괴적 승인 없이는 실행하지 않는다.
- Confirmation / Follow-up: PR 본문과 완료 보고에서 local/CI, dev live, production apply/cutover 증거를 분리한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 2026-08-07 PROD-448 댓글의 Temporal Workflow/Activity transport ownership은 2026-08-10 최신 PROD-448 본문과 위의 `Fedify 공식 PostgreSQL MessageQueue가 inbox/outbox transport를 소유한다` 결정으로 대체됐다.
- 2026-07~08의 NATS transactional outbox 또는 post-commit best-effort queue 전제는 현재 PROD-448 완료 계약의 근거가 아니다.
