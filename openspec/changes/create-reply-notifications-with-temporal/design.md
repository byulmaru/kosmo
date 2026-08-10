## Context

`createPost`는 Local과 ActivityPub Post materialization을 공통 처리한다. 현재 Reply이면 같은 transaction 안에서
`createReplyNotification`을 savepoint로 호출하고 오류를 삼키므로 source commit과 함께 보이거나 함께
rollback되지만, commit 뒤 재시도 가능한 실행 이력은 없다. GraphQL caller는 `ctx.db`를 전달하고 ActivityPub
inbound caller는 shared DB를 사용한다. 테스트에는 caller-owned transaction 참여 경계가 이미 존재한다.

`apps/worker`는 Temporal connection, health/readiness와 SIGTERM lifecycle을 제공하지만 business registration이
없어 fail-fast한다. Helm Worker component도 business capability가 없어 기본 비활성이다. PROD-722는 이 foundation을 사용하는 첫 business
capability이며, 사용자가 선택한 계약은 환경별 코드 분기 없이 Workflow-only로 전환하고 단일 Kosmo 공통 task
queue를 사용하는 것이다.

## Goals / Non-Goals

**Goals:**

- 실제 Reply commit 뒤에만 stable Workflow start effect를 실행한다.
- 기존 Reply Notification persistence policy를 Activity에서 재사용해 replay-safe하게 수렴한다.
- Local GraphQL과 ActivityPub inbound가 같은 core lifecycle을 사용한다.
- 첫 Worker registration과 dev live lifecycle/retry/restart 증거를 완성한다.
- 다른 Notification kind가 같은 task queue와 Worker registration에 독립적으로 추가될 최소 seam을 제공한다.

**Non-Goals:**

- transaction과 Workflow start를 원자화하거나 누락을 relay하는 outbox
- 다른 Notification kind 또는 ActivityPub outbound delivery 전환
- Notification read model, GraphQL/UI, unavailable cleanup 변경
- production 실제 배포와 운영 승인

## Implementation Guidance

### Current Constraints

- `createPost` 내부에서 Workflow를 즉시 시작하면 caller-owned outer transaction의 commit 전에 side effect가
  실행될 수 있다. 반대로 transaction 인자 존재 여부로 lifecycle을 생략하거나 내부/외부 실행을 분기하면 같은
  Reply가 caller에 따라 다른 계약을 갖게 된다.
- ActivityPub duplicate Create는 `{ created: false }`로 끝나므로 Workflow effect를 만들면 안 된다.
- `createReplyNotification`은 unique constraint와 `onConflictDoNothing`으로 replay-safe하지만, source가 없거나
  Reply가 아니면 `NotFoundError`를 던진다. Temporal Activity는 terminal source 부재와 transient DB 실패를
  구분해야 한다.
- Workflow 모듈은 deterministic sandbox에서 실행되므로 core DB service나 Node/Temporal client 모듈을 직접
  import하면 안 된다. DB 호출은 Worker Activity에 남겨야 한다.
- API와 ActivityPub ingress가 모두 Workflow start를 수행하므로 두 runtime에 Temporal address와 namespace가
  필요하다.
- 같은 image/chart가 이후 production release에도 사용된다. 항상 Workflow-only이므로 production release는
  namespace provisioning과 활성 Worker를 함께 포함해야 하며, 이 선행조건 없이 image만 배포하면 Reply
  Notification이 누락된다.

### Recommended Approach

`createPost`의 실제 create 결과에 `oncePostCommit`으로 보호한 core-owned effect를 포함한다. Reply가 아니면
no-op, Reply이면 stable source ID로 start하는 effect다. GraphQL과 ActivityPub production caller는 자신의
commit 경계 뒤에 이를 await한다. 기존 Local Post Fedify delivery는 PROD-722의 transport 범위가 아니므로 이
change에서 재설계하지 않는다.

core에는 Temporal connection/client를 필요할 때 생성하고 재사용하는 작은 start seam을 둔다. 실패한 connection
promise는 다음 호출이 다시 연결을 시도할 수 있게 폐기한다. Workflow ID는 Reply source ID에서 결정적으로
파생하고, 실행 중 같은 ID에는 existing run을 사용하며 완료된 ID 재사용은 거부해 하나의 Reply lifecycle에
하나의 Workflow history만 둔다. start 호출자는 start 승인 또는 실패까지 await하지만 오류를 기존 observer와
구조화 로그로 격리한다.

Worker Workflow는 source Reply ID 하나만 받고, bounded Activity attempt timeout과 Temporal 기본 retry policy로 Reply Notification
Activity 하나를 호출한다. Activity는 기존 `createReplyNotification`을 재사용하고 source 부재를 나타내는
`NotFoundError`만 terminal no-op으로 변환한다. 다른 DB·runtime 오류는 그대로 throw해 Temporal retry에 맡긴다.
Worker entrypoint는 Workflow bundle/path와 Activity를 `kosmo` task queue에 등록한다.

환경 중립 Helm component의 기본값을 활성화하고 API, Web, Worker에 같은 Temporal address/namespace를 전달한다. main
merge 뒤 자동 dev sync에서 namespace PreSync 후 Worker가 올라오게 하고, 실제 Workflow 실행·readiness·DB 오류
retry·Worker restart를 검증한다. production은 별도 release 승인이 있기 전에는 현재 배포를 바꾸지 않는다.

### Allowed Alternatives

- core가 만든 post-commit descriptor를 caller가 실행하는 대신 transaction abstraction이 after-commit hook을
  제공할 수 있다. 단, 모든 Local/ActivityPub caller와 caller-owned transaction에서 commit 뒤 실행이 증명되고
  test-only generic port를 만들지 않아야 한다.
- Temporal client connection을 runtime entrypoint가 주입할 수 있다. 단, core public action이 API/Web 전용
  타입에 의존하지 않고 두 production caller가 같은 lifecycle을 유지해야 한다.

### Known Traps

- `handle` 또는 `origin`에 따라 Reply Workflow를 생략하지 않는다.
- `void client.workflow.start(...)` fire-and-forget으로 start 실패 관측과 process lifecycle을 잃지 않는다.
- Workflow 코드에서 core DB service를 import하거나 Activity 함수 자체를 Workflow bundle에 포함하지 않는다.
- `NotFoundError` 이외의 DB 오류를 terminal no-op으로 삼켜 retry를 막지 않는다.
- dev 검증을 위해 smoke Workflow, 별도 test task queue 또는 두 번째 Worker abstraction을 만들지 않는다.
- production release 전제와 PROD-722 코드 완료를 혼동해 자동 production sync를 수행하지 않는다.

## Risks / Trade-offs

- [Reply commit 뒤 start 전 process 종료 시 Notification 누락] → 계약상 수용하고 fault test와 운영 기록에서
  durable 보장 시작점을 Temporal의 start 수락 이후로 명시한다.
- [Temporal frontend 지연이 Reply 요청 시간을 늘림] → start만 await하고 Workflow/Activity 결과는 기다리지
  않으며 client connection을 재사용한다. start RPC에는 별도 application deadline을 두지 않으므로 SDK가 오류를
  반환하지 않는 stall은 장시간 요청 대기로 이어질 수 있다.
- [항상 Workflow-only image가 Worker 없는 production에 배포됨] → production release 승인 시 namespace PreSync와
  Worker 활성화를 같은 chart release에서 요구하고, 이 change 자체는 production sync를 수행하지 않는다.
- [단일 Kosmo queue의 향후 noisy-neighbor] → 현재는 하나의 Worker deployment로 단순화하고 capability별
  Workflow/Activity와 retry 설정을 분리한다. 실제 독립 scaling 요구가 생기면 별도 runtime topology issue로
  task queue를 분리한다.
- [Activity replay 중 source 상태 변경] → 매 실행 시 source와 visibility를 다시 조회해 Notification 또는 no-op의
  현재 유효 결과로 수렴한다.
- [기본 retry가 장시간 계속됨] → 이번 capability는 Temporal 기본 정책을 따르고 retry 횟수 제한을 임의로
  추가하지 않는다. 실제 failure 관측 뒤 공통 Activity policy가 필요하면 새로 schedule되는 Activity에 명시적
  retry 또는 schedule-to-close 제한을 적용한다.

## Migration Plan

1. core post-commit start seam과 Reply Workflow/Activity를 추가하고 기존 savepoint 호출을 제거한다.
2. Local GraphQL과 ActivityPub caller가 실제 create 결과의 post-commit effect를 commit 뒤 await하도록 전환한다.
3. Worker에 `kosmo` task queue business registration을 추가하고 Helm Worker 기본값을 환경 중립적으로 활성화한다.
4. unit/integration test와 dev render를 검증한 뒤 main에 merge한다.
5. 자동 dev sync에서 namespace PreSync, Worker readiness, 실제 Reply Workflow, transient DB retry와 Worker restart
   복구를 검증한다. production은 변경하지 않는다.
6. rollback은 application/chart commit을 revert해 Worker registration/start 호출을 제거하고 기존 transaction
   savepoint 생성을 복원한다. 이미 accepted된 Workflow는 멱등 Activity로 완료되거나 Worker가 사라진 동안
   Temporal history에 남는다.

## Open Questions

없음.
