## ADDED Requirements

### Requirement: Fedify PostgreSQL inbox handoff

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, PROD-448. 시스템은 actor personal inbox와 shared inbox로 수신한 ActivityPub 요청을 Fedify 공식 PostgreSQL MessageQueue에 영속 handoff한 뒤 remote sender에게 수락 응답을 반환해야 한다(MUST). Web ingress는 handoff 뒤 domain listener를 동기 실행하거나 자체 retry·dedupe queue를 구현해서는 안 된다(MUST NOT).

#### Scenario: 유효한 inbound activity 수락

- **WHEN** Fedify가 검증한 지원 Activity가 actor personal inbox 또는 shared inbox에 도착하고 PostgreSQL inbox queue가 message를 수락한다
- **THEN** Web ingress는 remote sender에게 queue handoff 수락 응답을 반환한다
- **AND** 실제 listener와 domain materialization은 Fedify queue consumer에서 실행된다

#### Scenario: inbox enqueue 실패

- **WHEN** PostgreSQL inbox queue가 inbound message를 영속 수락하지 못한다
- **THEN** Web ingress는 성공 수락을 반환하지 않는다
- **AND** 별도 Temporal task, domain state transition 또는 Notification을 시작하지 않는다

#### Scenario: inbox handoff 뒤 ingress 재시작

- **WHEN** inbound message handoff가 수락된 뒤 Web ingress process가 종료되고 queue consumer가 다시 시작된다
- **THEN** 수락된 message는 PostgreSQL queue에서 다시 소비 가능해야 한다
- **AND** personal/shared inbox route 차이 때문에 서로 다른 Kosmo retry 또는 dedupe 경로를 만들지 않는다

### Requirement: Fedify PostgreSQL outbox handoff success boundary

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/domain/objects/profile.md`, `docs/domain/objects/instance.md`, PROD-448. 시스템은 domain effect가 구성한 Activity, 명시적 actor identity와 audience를 Fedify 공식 PostgreSQL MessageQueue에 넘겨 outbound transport를 시작해야 한다(MUST). 호출 성공은 queue가 handoff를 영속 수락한 시점이며(MUST), remote inbox HTTP 성공이나 최종 delivery 성공을 기다리거나 의미해서는 안 된다(MUST NOT).

#### Scenario: outbound handoff 수락

- **WHEN** 지원되는 Activity와 identity·audience가 Fedify에 전달되고 PostgreSQL outbox queue가 이를 수락한다
- **THEN** 호출자는 queue handoff 성공을 반환받는다
- **AND** remote HTTP delivery는 queue consumer에서 비동기로 실행된다

#### Scenario: outbound handoff 거절

- **WHEN** PostgreSQL outbox queue가 Activity handoff를 영속 수락하지 못한다
- **THEN** 호출자는 handoff 실패를 관측한다
- **AND** 시스템은 이를 remote delivery 성공으로 기록하거나 별도 Temporal task queue 또는 transactional Workflow intent/outbox/relay로 우회하지 않는다

#### Scenario: outbox handoff 뒤 producer 재시작

- **WHEN** outbound handoff가 수락된 뒤 producer process가 remote HTTP delivery 전에 종료된다
- **THEN** 수락된 message는 PostgreSQL queue에서 consumer가 다시 처리할 수 있어야 한다
- **AND** producer가 같은 remote delivery를 직접 재시도하지 않는다

### Requirement: Fedify 단일 transport ownership

**Authority / Provenance:** `docs/domain/objects/post.md`, `docs/domain/objects/reaction.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, PROD-448. 시스템은 recipient fan-out과 shared inbox 선택·중복 recipient 병합, remote retry·backoff·permanent failure 판단 및 기존 ordering option의 실행을 Fedify의 inbox/outbox/fan-out queue 처리에 위임해야 한다(MUST). Kosmo domain service, Temporal Activity 또는 별도 relay가 같은 remote transport 정책을 중복 소유해서는 안 된다(MUST NOT).

이 단일 ownership은 PROD-448 queue producer가 활성화되어 handoff가 수락된 뒤의 remote transport에 적용된다. 활성화 전 기존 Fedify delivery Activity의 request 실패 또는 활성화 후 queue enqueue 자체의 실패는 아직 수락되지 않은 delivery request이므로 Temporal Activity가 재시도할 수 있다.

#### Scenario: queue 활성화 전 domain effects Activity

- **WHEN** domain effects Workflow가 PROD-448 queue producer 활성화 전에 기존 Fedify delivery Activity를 호출하고 delivery request가 실패한다
- **THEN** Temporal Activity는 그 delivery request 실패를 재시도할 수 있다
- **AND** 이 Workflow 구현은 PROD-448의 prerequisite 또는 완료 조건이 아니다

#### Scenario: queue 활성화 후 Activity 성공 경계

- **WHEN** domain effects Activity가 Fedify queue에 delivery request를 넘기고 queue가 handoff를 수락한다
- **THEN** Activity는 queue acceptance를 성공으로 반환한다
- **AND** 그 이후 remote HTTP retry와 기존 ordering option 실행은 Fedify만 소유한다

#### Scenario: shared inbox를 가진 여러 recipient

- **WHEN** 하나의 Activity audience에 같은 유효한 shared inbox를 사용하는 여러 remote recipient가 포함된다
- **THEN** Fedify는 shared inbox preference와 fan-out dedupe를 한 곳에서 적용한다
- **AND** Kosmo는 recipient별 별도 remote HTTP delivery나 별도 dedupe ledger를 만들지 않는다

#### Scenario: 기존 ordering option이 있는 Activity

- **WHEN** 기존 activity capability가 이미 Fedify ordering option을 정의해 전달한다
- **THEN** queue runtime은 그 option을 변경하거나 별도 ordering key를 생성하지 않고 공식 Fedify adapter에 전달한다
- **AND** ordering 실행 정책은 Fedify가 소유한다

#### Scenario: 일시적 remote delivery 실패

- **WHEN** queue consumer의 remote inbox 요청이 Fedify가 재시도 가능한 실패로 판정된다
- **THEN** Fedify가 자신의 retry policy와 queue를 통해 후속 시도를 소유한다
- **AND** domain state transition, Notification, Temporal Activity retry 또는 Kosmo relay가 같은 HTTP delivery를 재시도하지 않는다

#### Scenario: transport 중복 처리 범위

- **WHEN** Fedify transport가 shared inbox recipient를 병합하거나 remote delivery를 재시도한다
- **THEN** 해당 transport 정책은 Fedify 안에서만 수행된다
- **AND** PROD-448은 process 간 protocol idempotency를 새 책임으로 확장하거나 별도 KV adapter, dedupe table 또는 transport ledger를 추가하지 않는다

### Requirement: 독립 Fedify queue consumer runtime

**Authority / Provenance:** PROD-448, PROD-709, PROD-715 PR #564. 시스템은 Web/API request runtime과 Temporal Worker 없이도 Fedify inbox/outbox/fan-out queue를 소비할 수 있는 별도 runtime을 제공해야 한다(MUST). 이 runtime은 독립적으로 배포·확장·재시작·rollback할 수 있고(MUST), process 생존과 queue listen 실행 상태를 구분하는 health/readiness와 graceful shutdown을 제공해야 한다(MUST).

#### Scenario: consumer 단독 시작

- **WHEN** Fedify PostgreSQL credential과 queue 구성이 유효한 상태에서 queue consumer runtime만 시작한다
- **THEN** runtime은 Web listener나 Temporal task queue를 시작하지 않고 Fedify inbox/outbox/fan-out consumer를 시작한다
- **AND** liveness는 process 생존을, readiness는 consumer가 종료 중이 아니고 Fedify queue listen을 실행 중임을 나타낸다

#### Scenario: 잘못된 consumer 구성

- **WHEN** 필수 Fedify PostgreSQL queue URL·credential 또는 runtime 구성이 누락되거나 부분 설정된다
- **THEN** runtime은 queue consumer를 시작하지 않고 명확한 구성 오류로 readiness를 제공하지 않는다
- **AND** API 역할 credential이나 owner fallback으로 조용히 전환하지 않는다

#### Scenario: API outbound producer transport credential

- **WHEN** API runtime에서 Fedify queue producer mode를 활성화한다
- **THEN** API는 domain `DATABASE_URL` 및 trusted Worker execution credential과 분리된 완전한 Fedify queue transport URL·credential을 사용한다
- **AND** transport credential이 없거나 부분 설정되면 owner/API/Worker credential 또는 direct delivery로 조용히 fallback하지 않고 시작 구성 오류를 반환한다

#### Scenario: graceful shutdown

- **WHEN** queue consumer runtime이 종료 신호를 받는다
- **THEN** readiness를 먼저 내리고 새 작업 수락을 중단한 뒤 Fedify queue listener와 PostgreSQL connection을 정리한다
- **AND** 종료 중인 작업을 완료된 것으로 잘못 확인하거나 Temporal Worker drain과 결합하지 않는다

#### Scenario: 독립 확장과 rollback

- **WHEN** 운영자가 Fedify queue backlog에 맞춰 consumer replica 수를 바꾸거나 consumer Deployment를 rollback한다
- **THEN** Web/API와 Temporal Worker replica 또는 배포 상태를 함께 바꿀 필요가 없다
- **AND** 같은 PostgreSQL queue의 ordering과 다중 worker 안전성은 Fedify adapter가 유지한다

### Requirement: Queue adapter integration과 queued persistence 검증

**Authority / Provenance:** PROD-448. 시스템은 official adapter의 enqueue/listen이 connection과 implicit initialization을 소유하게 해야 하며(MUST), 격리 PostgreSQL에서 accepted-but-not-dequeued message가 producer connection 종료와 consumer 재연결 뒤 소비되는지 검증해야 한다(MUST). production backlog metric과 dequeue 뒤 handler process crash redelivery 보강은 이 capability의 완료 조건이 아니다(MUST NOT).

#### Scenario: adapter 오류 전파

- **WHEN** queue가 구성된 runtime의 enqueue 또는 listen에서 URL·credential·connection·implicit initialization이 실패한다
- **THEN** official adapter 오류는 호출자 또는 consumer process 실패로 전달된다
- **AND** package는 custom parser, owner connection 또는 direct delivery로 오류를 우회하지 않는다

#### Scenario: dequeue 전 queued persistence 검증

- **WHEN** queue가 message를 수락한 뒤 consumer가 dequeue하기 전에 producer connection을 닫고 새 consumer connection을 시작한다
- **THEN** 새 consumer는 같은 queued message를 소비할 수 있다
- **AND** 검증을 위해 production queue를 purge하거나 production message를 수동 재실행하지 않는다

#### Scenario: dequeue 뒤 process crash

- **WHEN** official adapter가 message를 dequeue한 뒤 handler 완료 전에 consumer process가 종료된다
- **THEN** PROD-448은 해당 message의 재전달을 보장하지 않는다
- **AND** Kosmo는 이를 보강하는 custom ack, lease, requeue, ledger 또는 relay를 구현하지 않는다

### Requirement: Production 활성화 승인 경계

**Authority / Provenance:** PROD-448. 시스템은 Fedify queue consumer와 queue 사용을 기존 production runtime에서 자동 활성화하지 않아야 한다(MUST NOT). production queue database·credential 준비, adapter의 최초 table initialization, consumer rollout과 트래픽 cutover는 현재 검증 증거를 제시한 뒤 별도 사용자 승인을 받아야 한다(MUST).

#### Scenario: 기본 비활성 producer mode

- **WHEN** 새 queue producer/consumer 설정을 명시적으로 활성화하지 않은 기존 values로 runtime을 배포한다
- **THEN** 기존 direct transport mode와 workload render를 유지한다
- **AND** credential 존재만으로 queue table을 초기화하거나 producer/consumer를 자동 활성화하지 않는다

#### Scenario: producer mode의 atomic configuration

- **WHEN** Web 또는 API에서 queue producer mode를 활성화한다
- **THEN** Helm은 완전한 Fedify queue credential을 runtime에 주입하고 official adapter가 첫 enqueue에서 connection 대상 database의 queue table/index를 idempotent하게 초기화하게 한다
- **AND** enabled Helm 상태의 누락·부분 selector는 render에 실패하며 adapter 오류는 direct delivery나 owner/API DB fallback으로 우회하지 않는다

#### Scenario: dev queue database 격리

- **WHEN** dev Fedify queue producer와 consumer를 활성화할 준비를 한다
- **THEN** 기존 CloudNativePG cluster 안의 별도 `kosmo_fedify_queue` database와 전용 login/Secret을 사용한다
- **AND** official adapter가 해당 database 안의 queue table/index implicit DDL을 소유하며 domain database schema, `search_path` helper 또는 custom queue migration을 추가하지 않는다
- **AND** queue connection은 API/domain DB와 Worker trusted execution credential을 재사용하거나 fallback하지 않는다
- **AND** dev producer 또는 consumer를 활성화하면서 queue database 준비 flag를 끄거나 전용 role·PgBouncer·database가 아닌 URL을 지정하면 Helm render에 실패한다

#### Scenario: 구현 PR 완료

- **WHEN** 코드, chart, 격리 database의 adapter initialization과 비production 검증이 완료되어 PR이 review-ready 상태가 된다
- **THEN** production values, Argo CD sync/apply, database apply와 live traffic cutover는 실행하지 않는다
- **AND** PR completion evidence와 dev live verification, production activation 상태를 각각 구분해 보고한다

#### Scenario: 별도 production 승인

- **WHEN** 사용자가 정확한 production queue database·credential 준비, 최초 adapter initialization, rollout 또는 cutover 대상을 별도로 승인한다
- **THEN** 승인된 작업만 현재 production 상태를 다시 확인한 뒤 수행한다
- **AND** 승인되지 않은 다른 production mutation으로 범위를 넓히지 않는다
