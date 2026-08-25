## Context

이 기록은 PROD-720의 2026-08-25 설계 방향을 반영해 Follow와 Follow Request를 방향성 Profile pair의 하나의 활성 lifecycle로 조정하기 위한 durable choice를 정리한다. PROD-720과 canonical/domain 문서는 아래 Active decision으로 동기화했으며, 이 change의 delta specs는 archive 시 active specs를 갱신한다.

## Decision Records

### Follow 시도는 활성 pair lifecycle Workflow로 실행한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-720, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`, `docs/architecture/core-services.md`
- Status: Active
- Context / Problem: Follow와 Follow Request가 같은 방향 pair의 initial policy 결과인데 operation별 Workflow로 분리되어 orchestration 분기가 늘어난다.
- Decision Outcome: Workflow ID는 `profile-follow-pair:{followerProfileId}:{followeeProfileId}`로 결정하고, 하나의 run은 `INITIAL → PENDING → ESTABLISHED | REJECTED | CANCELLED`를 처리한다. 관계가 성립하거나 request가 terminal이 되면 effects를 drain하고 종료한다.
- Alternatives Considered: operation-scoped Workflow, `NONE`까지 영구 대기하는 pair Entity Workflow, pair mutex를 검토했다. 첫 번째는 lifecycle 분기를 유지하고, 두 번째와 세 번째는 불필요한 장기 실행/직렬화 책임을 추가하므로 선택하지 않았다.
- Consequences: 같은 pair의 completed execution은 새 run으로 재사용해야 하며, PENDING만 장기 실행한다. Unfollow는 별도 short command다.
- Confirmation / Follow-up: 상태 전이, same-pair rerun, existing pending bootstrap와 real Temporal test로 확인한다.

### Pair Workflow의 run 재사용 정책은 USE_EXISTING + ALLOW_DUPLICATE다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-720, `docs/domain/objects/follow-relationship.md`
- Status: Active
- Context / Problem: 실행 중인 pending request는 같은 lifecycle run으로 command를 받아야 하고, terminal 뒤 새 request는 같은 결정적 pair 주소를 다시 사용할 수 있어야 한다.
- Decision Outcome: 실행 중인 pair Workflow에는 `workflowIdConflictPolicy=USE_EXISTING`, 종료된 동일 ID에는 `workflowIdReusePolicy=ALLOW_DUPLICATE`를 사용한다.
- Alternatives Considered: 새 random Workflow ID, completed ID 재사용 금지, pair Workflow 영구 유지. 각각 caller 연결성, 재요청 routing 또는 lifecycle 종료 경계를 악화시킨다.
- Consequences: 오래 지연된 command가 새 run에 도착할 수 있는 위험을 수용한다. remote command는 expected request/follow row ID와 exact-row check로 제한한다.
- Confirmation / Follow-up: stale remote event와 refollow generation test로 확인한다.

### Domain operationId와 receipt는 사용하지 않는다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-720, `docs/architecture/core-services.md`, delta `data-model` spec
- Status: Active
- Context / Problem: pair Workflow가 lifecycle identity를 소유하므로 command마다 random operation identity와 transient receipt를 둘 필요가 없다.
- Decision Outcome: domain identity는 pair key와 현재 request/follow row ID가 소유한다. Temporal Update ID는 transport deduplication metadata로만 사용하고 DB에 영속화하지 않는다. Activity retry는 current DB state, expected row와 Workflow history snapshot으로 재구성한다.
- Alternatives Considered: server-generated operation ID + receipt, generic ledger, client-supplied idempotency key. 각각 lifecycle보다 낮은 identity를 추가하거나 범위를 넓히므로 선택하지 않았다.
- Consequences: deleted snapshot을 history에 보존해야 하고 generic exactly-once를 주장하지 않는다. 아직 배포되지 않은 receipt migration은 제거한다.
- Confirmation / Follow-up: commit completion loss, duplicate/no-op, stale exact-row와 migration tests로 확인한다.

### Update handler는 한 번에 하나만 실행하고 commit 결과 뒤 즉시 반환한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: PROD-720, `docs/architecture/core-services.md`
- Status: Active
- Context / Problem: Temporal Update handler는 Activity를 await하는 동안 겹칠 수 있고, effects 또는 PENDING lifetime까지 기다리면 caller 결과와 lifecycle 대기가 결합된다.
- Decision Outcome: validator는 I/O 없이 state/command를 확인하고, handler 진입 시 in-flight marker를 먼저 세운다. transaction commit, state/effect batch 기록 후 Update 결과를 반환하며 effects를 기다리지 않는다. terminal close는 handler completion 뒤에만 허용한다.
- Alternatives Considered: Temporal의 implicit handler ordering, effect completion까지 Update 대기, Signal/fire-and-forget. 각각 concurrent mutation, latency coupling 또는 durable result 경계를 훼손한다.
- Consequences: conflict가 된 동시 Update는 caller가 재시도해야 하며, batch는 별도 Workflow loop가 drain한다.
- Confirmation / Follow-up: delayed transaction, concurrent Update와 handler cancellation regression test로 확인한다.

### Effects는 FIFO batch로 drain하고 pending failure 뒤에도 terminal Update를 허용한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-720, delta `notification` 및 `temporal-follow-effects` specs
- Status: Active
- Context / Problem: pending request create effects가 실패해도 사용자가 reject/cancel/accept할 수 있어야 하며, terminal effects가 앞선 batch와 뒤섞이면 source projection 순서가 흔들린다.
- Decision Outcome: transition마다 effect batch를 FIFO queue에 넣고 batch 내부 sibling은 모두 settle한다. PENDING batch terminal failure는 state/history에 기록하고 다음 terminal Update를 계속 허용한다. terminal state에서는 새 Update를 막고 queue를 모두 drain한 뒤 성공 또는 실패로 close한다.
- Alternatives Considered: 첫 effect failure에서 parent 종료, effects ABANDON 후 관찰 불가, 모든 batch 동시 실행. 각각 pending lifecycle을 막거나 순서/실패 관찰을 잃는다.
- Consequences: PENDING Workflow가 effect failure를 기록한 채 살아 있을 수 있고, terminal close까지 누적 실패가 관찰된다. DB commit은 rollback하지 않는다.
- Confirmation / Follow-up: pending effect failure → terminal update → queue drain/restart test로 확인한다.

### Transaction Activity terminal failure는 pair run을 닫는다

- Decision Date: 2026-08-25
- Decision Class: Failure Semantics
- Authority / Provenance: PROD-720, `memory/temporal-workflows.md`
- Status: Active
- Context / Problem: PENDING terminal Update의 transaction Activity가 retry를 모두 소진하면 Update는 실패하지만 state가 PENDING인 run은 같은 deterministic Update ID의 복구를 영구 차단할 수 있다.
- Decision Outcome: Workflow는 transition failure를 기록하고 기존 effect queue를 drain한 뒤 typed terminal failure로 close한다. known domain failure DTO는 이 경로에 넣지 않는다.
- Consequences: caller는 같은 pair ID의 새 run에서 재시도할 수 있다. receipt가 없으므로 terminal commit 뒤 모든 Activity completion이 유실된 극단 경계에서 generic exactly-once 결과 복구는 주장하지 않는다.
- Confirmation / Follow-up: non-retryable failure와 maximum-attempt exhaustion real Temporal test로 확인한다.

### Existing pending request는 read-only snapshot으로 bootstrap한다

- Decision Date: 2026-08-25
- Decision Class: Implementation Choice
- Authority / Provenance: PROD-720, `docs/domain/objects/follow-request.md`
- Status: Active
- Context / Problem: migration 전 생성된 pending row 또는 종료된 이전 run에는 실행 중인 pair Workflow가 없을 수 있다.
- Decision Outcome: 새 run의 첫 Update는 mutation 전에 pair/request snapshot Activity를 호출한다. terminal command는 exact request를 읽어 PENDING state를 bootstrap하고, `FOLLOW`는 기존 request가 OPEN relation으로 승격된 뒤 transaction Activity가 retry되어도 cleanup effect를 재구성하도록 snapshot을 history에 보존한다. snapshot은 id, pair IDs와 createdAt ISO만 포함한다. origin은 저장 row에서 추론하지 않고 검증된 현재 command가 제공한다.
- Alternatives Considered: 모든 pending row를 선제 backfill, terminal command가 DB를 직접 mutate, pair Workflow가 DB를 polling. 각각 rollout mutation, trust boundary 또는 불필요한 long-running poller를 추가한다.
- Consequences: 기존 pending row는 명령이 들어올 때 lazy bootstrap되고, terminal command에서 존재하지 않거나 expected ID가 다르면 stale/no-op으로 종료한다. 첫 `FOLLOW`도 read-only Activity 한 번을 거친다.
- Confirmation / Follow-up: old pending fixture와 exact mismatch integration test로 확인한다.

### Unfollow는 pair lifecycle 밖의 별도 short command다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: PROD-720, `docs/domain/objects/follow-relationship.md`
- Status: Active
- Context / Problem: Unfollow는 pending request를 기다리지 않고 established relation을 삭제한다. pair lifecycle을 relation 삭제까지 유지하면 Workflow 수명이 불필요하게 길어진다.
- Decision Outcome: `profile-follow-unfollow:{followerProfileId}:{followeeProfileId}:{expectedFollowId}` short Workflow가 exact Follow를 삭제하고 기존 cleanup/Undo effects를 drain한 뒤 종료한다.
- Alternatives Considered: Follow pair Workflow를 Unfollow까지 유지, pair run을 다시 열어 같은 state machine으로 처리. 둘 다 Follow Request lifecycle과 established relation lifecycle을 결합한다.
- Consequences: Refollow는 새 pair run이고 expectedFollowId가 이전 relation과 새 relation을 분리한다.
- Confirmation / Follow-up: unfollow/refollow ABA와 remote Undo test로 확인한다.

### Ingress trust, direct Accept와 ActivityPub no-echo는 유지한다

- Decision Date: 2026-08-25
- Decision Class: Derived Contract
- Authority / Provenance: `docs/architecture/core-services.md`, PROD-720
- Status: Active
- Context / Problem: transaction orchestration을 Worker로 옮겨도 transport trust와 inbound protocol timing을 옮길 근거는 없다.
- Decision Outcome: GraphQL/Fedify ingress가 인증·membership·signature·actor/object/recipient 검증을 소유하고, inbound Follow의 direct Accept를 계속 보낸다. ActivityPub-origin pair transition은 Notification/cleanup만 실행해 outbound Follow/Undo echo를 만들지 않는다.
- Alternatives Considered: raw protocol object를 Workflow로 전달하거나 direct Accept를 effects queue로 이동. trust boundary와 기존 timing을 변경하므로 선택하지 않았다.
- Consequences: Worker에는 verified serializable identity만 전달하고 mutable state는 Activity가 재검증한다.
- Confirmation / Follow-up: invalid ingress, direct Accept와 no-echo integration test로 확인한다.

## Superseded Decisions

### 2026-08-25 operation-scoped Follow command

- Status: Superseded
- Superseded by: `Follow 시도는 활성 pair lifecycle Workflow로 실행한다`
- Former outcome: request 한 건마다 `profile-follow-command:{operationId}` short Workflow를 시작하고 effects 종료 후 닫았다.
- Reason: Follow와 Follow Request가 같은 pair lifecycle인데 command별 Workflow/branch/identity가 분산되어 구조적 분기가 커졌다.

### 2026-08-25 server-generated operation identity

- Status: Superseded
- Superseded by: `Domain operationId와 receipt는 사용하지 않는다`
- Former outcome: API/Fedify가 UUID operation ID를 만들고 Workflow ID, Update ID, receipt PK에 사용했다.
- Reason: pair key와 current request/follow row ID가 lifecycle identity와 exact-row guard를 이미 제공한다.

### 2026-08-25 transaction receipt for completion loss

- Status: Superseded
- Superseded by: `Domain operationId와 receipt는 사용하지 않는다`
- Former outcome: command/result/effect plan을 operation receipt에 같은 transaction으로 기록하고 effects 후 정리했다.
- Reason: pair Workflow history의 read-only snapshot과 DB state reconstruction으로 범위 내 retry를 처리하고 generic receipt를 제거한다.

### 2026-08-25 caller success boundary

- Status: Superseded
- Superseded by: `Update handler는 한 번에 하나만 실행하고 commit 결과 뒤 즉시 반환한다`
- Former outcome: operation Workflow Update가 transaction Activity 결과를 반환하고 short Workflow effects를 계속했다.
- Reason: commit-first/early-return 의미는 유지하되, operation 단위가 아니라 pair lifecycle state와 FIFO batch가 소유한다.

### 2026-08-25 ingress trust and direct Accept boundary

- Status: Superseded
- Superseded by: `Ingress trust, direct Accept와 ActivityPub no-echo는 유지한다`
- Former outcome: operation-scoped command에서도 ingress validation과 direct Accept를 유지했다.
- Reason: pair lifecycle 명칭과 routing을 반영해 같은 경계를 새 architecture decision으로 재기록한다.

## Historical Superseded Decision

2026-08-24의 “Core commit 뒤 Effects Workflow start, transaction Activity 제외” 결정은 이미 2026-08-25 transaction-first 변경으로 대체되었고, 이번 pair lifecycle 결정으로 다시 세분화되었다. 이전 history는 replay/rollout 근거로 보존한다.
