## Context

이 기록은 Reply Notification을 transaction savepoint에서 Temporal Workflow로 전환하는 PROD-722 계약과,
`docs/domain`의 Reply/Notification 관계, core commit 경계, 기존 Temporal Worker foundation을 구현 가능한
선택으로 정리한다. 2026-08-10 사용자 논의에서 start 대기 방식, task queue 범위, rollout과 cutover 방식을
확정했다.

## Decision Records

### Reply commit 뒤 direct Workflow start를 사용한다

- Decision Date: 2026-08-10
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, `docs/domain/objects/post.md`, `PROD-722`
- Status: Active
- Context / Problem: Reply transaction과 Notification 실행을 분리하면서 어느 시점부터 durable recovery가
  시작되는지 정해야 한다.
- Decision Outcome: 실제 Reply commit 뒤 core lifecycle이 stable ID로 Workflow start를 직접 시도한다.
  transaction과 함께 기록하는 intent/outbox 및 relay는 만들지 않으며, Temporal이 start를 수락한 뒤부터만
  history·Activity retry·Worker restart 복구를 보장한다.
- Alternatives Considered: transactional intent/outbox와 relay는 PROD-722의 명시적 제외 범위다. commit 전
  enqueue는 rollback된 Reply의 Workflow를 만들 수 있어 제외한다.
- Consequences: commit과 start 요청 사이 process 종료 누락을 수용한다. source 성공은 start·Activity 실패로
  rollback되지 않는다.
- Confirmation / Follow-up: rollback·duplicate·commit→start fault test와 dev accepted Workflow 실행으로 경계를
  검증한다.

### core-owned post-commit effect를 caller가 commit 뒤 실행한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`
- Status: Active
- Context / Problem: `createPost`가 caller-owned transaction에 참여할 수 있어 함수 내부 start는 outer commit보다
  먼저 실행될 수 있다.
- Decision Outcome: core action이 stable Reply identity를 캡처한 once-only post-commit effect를 반환하고,
  Local GraphQL과 ActivityPub production caller가 자신의 commit 경계 뒤 이를 실행한다. transaction 인자나
  origin으로 lifecycle을 생략하지 않는다.
- Alternatives Considered: core 함수 내부 즉시 start는 outer transaction 안전성을 깨뜨린다. caller가 Workflow
  identity와 start policy를 직접 조립하면 공통 lifecycle 책임이 entrypoint에 중복된다.
- Consequences: 모든 production caller가 effect 실행 책임을 가져야 한다. 새 caller는 같은 commit 계약을 따라야
  한다.
- Confirmation / Follow-up: outer rollback에는 start가 없고, commit 전에는 start되지 않으며, 두 production
  caller가 effect를 호출하는 테스트를 둔다.

### Workflow start 승인 또는 실패까지 await하고 실패를 격리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`
- Status: Active
- Context / Problem: fire-and-forget은 process 종료와 Promise rejection을 관측하지 못하고, start 실패를 호출
  실패로 노출하면 이미 commit된 Post와 외부 결과가 어긋난다.
- Decision Outcome: post-commit effect는 Workflow start 승인 또는 실패까지 await한다. start 실패는 observer와
  구조화 로그에 기록하지만 Reply·GraphQL·ActivityPub 성공은 유지한다. Workflow/Activity 완료는 기다리지 않는다.
- Alternatives Considered: 백그라운드 호출은 보장과 관측을 더 약화한다. start 오류를 caller 실패로 노출하는
  방식은 committed state를 되돌릴 수 없어 제외한다.
- Consequences: Temporal frontend latency가 Reply 처리 시간에 start RPC만큼 추가될 수 있다.
- Confirmation / Follow-up: start 실패 시 committed Reply와 성공 결과가 유지되고 오류가 관측되는 테스트를 둔다.

### 모든 환경에서 Reply는 Workflow-only 경로를 사용한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-722`
- Status: Active
- Context / Problem: dev만 먼저 live 검증하되 source 코드에 환경 분기나 장기 dual-write를 남길지 결정해야 한다.
- Decision Outcome: capability flag, 환경 이름 분기와 dual-write 없이 기존 Reply Notification savepoint를 제거하고
  모든 runtime에서 Workflow-only 경로를 사용한다.
- Alternatives Considered: capability flag는 안전한 단계 전환이 가능하지만 사용자가 환경별 코드 경계를 원하지
  않았다. 항상 dual-write는 migration 이후에도 savepoint 책임을 유지해 전환 완료를 증명하지 못한다.
- Consequences: 이 image를 production에 release할 때는 같은 release에서 namespace PreSync와 활성 Worker가 먼저
  준비되어야 한다. Worker 없는 production에 image만 배포하면 Reply Notification이 누락된다.
- Confirmation / Follow-up: dev에서 Workflow-only 생성을 검증한다. production 실제 release는 별도 명시적 승인
  전에는 수행하지 않는다.

### 단일 Kosmo 공통 task queue를 사용한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`, `PROD-730`
- Status: Active
- Context / Problem: 첫 business Workflow가 이후 Notification과 Fedify capability가 사용할 Worker registration
  topology를 열어야 한다.
- Decision Outcome: Reply Workflow/Activity를 `kosmo` 공통 task queue에 등록한다. capability별 Workflow와
  Activity 코드는 분리하되 현재 Worker Deployment와 polling queue는 하나로 유지한다.
- Alternatives Considered: Notification 전용 또는 kind별 queue는 현재 단일 Worker foundation에 Deployment와
  registration을 추가하고 실제 독립 scaling 요구 없이 운영 복잡도를 늘린다.
- Consequences: 후속 PROD-723/720/725와 PROD-448은 같은 registration seam을 확장할 수 있다. 실제 부하·권한
  격리가 필요해지면 별도 runtime topology 결정이 필요하다.
- Confirmation / Follow-up: Worker가 `kosmo` queue에서 Reply Workflow를 poll하고 다른 queue를 만들지 않는지
  package와 live dev에서 검증한다.

### Reply identity 하나에 Workflow history 하나를 유지한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-722`
- Status: Active
- Context / Problem: concurrent 또는 ambiguous start 재시도가 같은 Reply에 여러 Workflow run을 만들지 않게 해야
  한다.
- Decision Outcome: Workflow ID를 source Reply ID에서 결정적으로 파생하고, 실행 중 동일 ID start는 existing run을
  사용하며 완료된 ID의 새 run은 거부한다.
- Alternatives Considered: 매 start마다 새 Workflow ID를 만들거나 완료 뒤 ID 재사용을 허용하면 DB unique row는
  중복을 막더라도 실행 이력과 Activity 시도가 분산된다.
- Consequences: 같은 Reply lifecycle은 하나의 history로 추적된다. 동일 start 요청은 성공과 동등하게 처리할 수
  있다.
- Confirmation / Follow-up: concurrent start와 완료 후 duplicate start가 새 Notification이나 새 Workflow
  lifecycle을 만들지 않는지 검증한다.

### dev live 검증을 change 완료 증거로 사용하고 production release는 분리한다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `PROD-722`, `PROD-730`
- Status: Active
- Context / Problem: 첫 business capability는 실제 RUNNING/readiness와 task drain을 검증해야 하지만 production
  적용은 별도 운영 승인이 필요하다.
- Decision Outcome: 환경 중립 Worker code와 chart를 구현하고 main merge 뒤 dev에서 actual Workflow,
  readiness, transient DB retry와 Worker restart를 검증한다. production 실제 sync/release는 PROD-722 완료 gate로
  요구하지 않는다.
- Alternatives Considered: 코드 검증만으로 끝내면 PROD-722와 PROD-730이 요구한 accepted Workflow/Worker restart
  증거가 없다. production까지 자동 배포하는 방식은 현재 권한 범위를 넘는다.
- Consequences: production 미배포는 change 미완료가 아니지만, production release 전제는 운영자가 별도로 확인해야
  한다.
- Confirmation / Follow-up: dev live evidence와 production 미변경 상태를 completion 기록에 함께 남긴다.

### Activity retry는 Temporal 기본 정책을 따른다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/domain/objects/notification.md`, `PROD-722`
- Status: Active
- Context / Problem: accepted Workflow의 transient DB 실패를 몇 회 또는 얼마 동안 재시도할지 상위 계약이
  수치로 정하지 않았다.
- Decision Outcome: Activity attempt timeout은 명시하되 retry 횟수·backoff를 별도로 덮지 않고 Temporal 기본
  Activity retry policy를 사용한다.
- Alternatives Considered: 10회 제한은 transient 장애가 더 길면 자동 수렴을 중단하고 근거 없는 수동 복구
  경계를 만든다. 24시간 제한도 허용 지연과 복구 owner가 없어 채택하지 않았다.
- Consequences: retry는 기본 정책에 따라 장시간 계속될 수 있다. 이후 명시 정책을 추가해도 새로 schedule되는
  Activity부터 적용되고 이미 history에 기록된 Activity 정책을 소급 변경하지 않는다.
- Confirmation / Follow-up: retry options를 임의로 고정하지 않았는지와 transient 실패 뒤 재시도를 검증하고,
  dev 관측 결과에서 bounded policy 필요성을 재평가한다.

### Workflow start RPC는 별도 deadline 없이 SDK 기본을 따른다

- Decision Date: 2026-08-10
- Decision Class: Implementation Choice
- Authority / Provenance: `docs/architecture/core-services.md`, `PROD-722`
- Status: Active
- Context / Problem: Reply 요청은 Workflow start 승인 또는 실패까지 기다리지만, 연결 뒤 start RPC에 별도
  deadline을 둘지는 상위 계약이 정하지 않았다.
- Decision Outcome: `workflow.start()`에 application deadline을 추가하지 않고 Temporal SDK 기본 RPC 동작을
  사용한다.
- Alternatives Considered: 10초 deadline은 초기 connection timeout과 일치하고, 30초 deadline은 일시 지연을
  더 허용하지만 둘 다 근거 없는 application latency·failure 경계를 새로 만든다.
- Consequences: Temporal frontend가 연결된 뒤 start RPC 응답을 멈추면 GraphQL 또는 ActivityPub 요청이 장시간
  대기할 수 있다. 명시적인 timeout 오류 격리는 SDK가 오류를 반환한 경우에만 적용된다.
- Confirmation / Follow-up: dev 관측에서 start 지연이 실제 request budget 문제가 되면 별도 timeout 정책을
  결정하고 새 요청부터 application deadline을 적용한다.

## Remaining Decisions

- 없음.

## Superseded Decisions

- 없음.
