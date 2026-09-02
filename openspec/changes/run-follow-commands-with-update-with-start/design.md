## Context

Follow와 Follow Request는 같은 방향의 Profile pair에 대한 하나의 시도다. Open policy에서는 첫 command가 곧 관계를 만들고, Approval Required policy에서는 같은 command가 pending request를 만든 뒤 상대의 terminal 결정까지 기다린다. 기존 operation-scoped Workflow는 이 두 경우와 request terminal command를 별도 operation으로 표현해 caller, transaction DTO, receipt와 effects orchestration에 불필요한 분기를 만들었다.

새 설계는 pair를 lifecycle의 주소로 사용한다. 실행 중인 pair Workflow는 pending request의 terminal command를 같은 Update 경계로 받고, 관계가 성립하거나 request가 끝나면 effects를 정리하고 종료한다. 다음 follow attempt는 같은 pair Workflow ID의 새 run이다. PROD-720과 canonical/domain 문서는 이 결정으로 동기화했고, 이 change의 delta specs는 archive 시 active specs를 같은 계약으로 갱신한다.

## Goals / Non-Goals

**Goals:**

- Follow와 Follow Request의 initial/terminal 분기를 하나의 pair lifecycle state machine에 모은다.
- Update-with-Start admission부터 DB commit, effects queue drain까지 하나의 durable execution으로 연결한다.
- caller는 DB commit 결과만 기다리고, pending lifetime과 effects retry를 caller latency에 결합하지 않는다.
- Activity retry에서 pair state, deterministic candidate ID와 expected row identity로 결과와 삭제 effects를 재구성한다.
- 같은 pair Workflow의 Update를 하나씩 처리하고 transition effects를 FIFO로 drain한다.
- ActivityPub ingress trust validation, direct inbound Accept와 no-echo 경계를 유지한다.

**Non-Goals:**

- Follow가 성립한 뒤 Unfollow까지 pair Workflow를 열어 두는 것
- `NONE` 상태로 계속 살아 있는 영구 pair Workflow
- pending request expiry, reminder, sweeper 또는 자동 terminal transition
- pair별 장기 mutex, generic outbox/ledger, client-wide exactly-once
- Follow 외 도메인의 Workflow identity나 replay 정책을 변경하는 것

## Pair identity and lifecycle

결정적 pair key는 방향을 보존한다.

```text
pairKey    = {followerProfileId}:{followeeProfileId}
workflowId = profile-follow-pair:{pairKey}
```

두 Profile ID는 canonical UUID 문자열을 사용하고, follower/followee 순서를 바꾸지 않는다. Workflow ID는 한 번의 시도가 아니라 한 방향 pair의 현재 lifecycle run을 가리킨다. 실행 중인 run에는 `USE_EXISTING`으로 Update하고, 완료된 run에는 `ALLOW_DUPLICATE`로 새 run을 시작한다.

Workflow-local state는 다음 네 terminal 결과를 포함한다.

```text
INITIAL
  ├─ FOLLOW(open)              → ESTABLISHED
  └─ FOLLOW(approval required) → PENDING

PENDING
  ├─ APPROVE / remote ACCEPT   → ESTABLISHED
  ├─ REJECT / remote REJECT    → REJECTED
  └─ CANCEL / inbound UNDO     → CANCELLED
```

`ESTABLISHED`, `REJECTED`, `CANCELLED`는 terminal이다. terminal 상태가 된 뒤 새 Update는 conflict로 거절하고, 모든 queued effect batch가 끝난 뒤 Workflow를 종료한다. PENDING은 request가 처리될 때까지 만료되지 않는다. 다만 Update 없이 잘못 직접 시작된 `INITIAL` run이 무기한 남지 않도록 initial admission에만 짧은 orphan guard를 둘 수 있다. 이 guard는 PENDING lifetime의 expiry가 아니다.

현재 generation의 DB row ID는 pair key와 별개의 exact-row token이다.

- PENDING: `profileFollowRequestId`
- ESTABLISHED: `profileFollowId`

새 run이 같은 pair에 대해 시작되면 이전 run과 새 request/follow row ID가 달라진다. 오래 지연된 remote Accept/Reject/Undo는 command에 포함된 expected row ID가 현재 row와 일치할 때만 transition한다.

## Update-with-Start boundary

API와 verified ActivityPub ingress는 기존대로 인증·membership·actor/object/recipient·delivery target을 먼저 검증한다. 검증된 Profile identity와 domain input만 공용 client에 전달한다.

공용 client는 다음 정책으로 pair Workflow를 호출한다.

```text
workflowIdConflictPolicy = USE_EXISTING
workflowIdReusePolicy    = ALLOW_DUPLICATE
update name              = profileFollowPairUpdate
```

Temporal Update ID는 transport-level admission deduplication metadata일 뿐 domain `operationId`나 DB identity가 아니다. initial Follow는 실행 중인 같은 pair run의 중복 admission을 합치도록 `follow`를 사용한다. terminal command는 participant availability 변화로 no-op한 뒤 같은 exact row를 다시 처리할 수 있어야 하므로 명시적 Update ID를 생략하고 Temporal client가 호출별 ID를 배정한다. 같은 client 호출의 RPC retry는 하나의 ID로 수렴하고, 이후 별도 호출은 새 ID로 handler를 다시 실행한다. 이 값은 receipt table이나 public idempotency contract로 저장하지 않는다.

`FOLLOW`는 `INITIAL` run의 첫 Update다. 이미 PENDING run이 있으면 duplicate/Conflict 결과로 수렴한다. `APPROVE`, `ACCEPT`, `REJECT`, `CANCEL`, `REMOTE_REJECT`, `INBOUND_UNDO`가 실행 중인 PENDING run에 도착하면 같은 Update handler가 처리한다. 이전 migration 전에 이미 DB에 남은 pending request는 실행 중인 Workflow가 없을 수 있으므로, terminal command의 Update-with-Start가 새 run을 만든다.

## Handler admission and early return

Temporal Update validator는 DB I/O를 하지 않고 command shape, pair identity와 현재 Workflow state만 검사한다. handler 진입 시 `inFlight`를 동기적으로 설정해 한 번에 하나의 state-changing Update만 허용한다. 첫 handler가 Activity를 기다리는 동안 뒤의 Update가 도착해도 validator/handler는 conflict를 반환한다.

handler의 순서는 다음과 같다.

1. 새 `INITIAL` run은 read-only bootstrap Activity로 기존 pending request ID만 확인한다. terminal command는 expected row까지 exact match하고, `FOLLOW`는 OPEN 정책 승격의 commit-then-retry에서도 request cleanup을 재구성할 ID를 먼저 history에 남긴다.
2. exact source ID를 Workflow state에 보존한다. 새 Follow 또는 Follow Request를 만들 transition이면 transaction 전에 새 domain row ID도 결정론적으로 배정해 history에 보존한다.
3. transaction Activity가 current DB state, pair key와 expected row identity를 다시 검증하고 domain transition을 commit한다.
4. commit 결과와 다음 lifecycle state를 Workflow state에 기록하고 해당 transition의 effect batch를 FIFO queue에 넣는다.
5. effect execution이나 pending lifetime을 기다리지 않고 Update 결과를 즉시 반환한다.

main loop는 handler 완료를 확인한 뒤 queue를 drain한다. terminal transition이 commit되어도 handler가 아직 반환 중이면 먼저 handler completion을 기다린다. 이렇게 해야 caller가 받은 Update result가 실제 DB commit을 뜻하면서도 Workflow가 handler 중간에 닫히지 않는다.

transaction/bootstrap Activity가 configured retry를 모두 소진하면 Update는 실패하고, Workflow는 이미 queue에 들어온 effects를 drain한 뒤 typed terminal failure로 닫힌다. PENDING 상태로 무기한 남기지 않으므로 caller는 같은 pair 주소의 새 run으로 재시도할 수 있다. 알려진 domain `{ok:false}` 결과는 이 infrastructure failure 경로에 넣지 않으며 기존 PENDING lifecycle을 유지한다.

## FIFO effects and failure semantics

각 committed transition은 source identity와 transition을 포함한 하나의 `EffectBatch`가 된다. batch 안에는 순서가 있는 effect phase를 두며, 승인처럼 Request 삭제 뒤 Relationship 생성이 필요한 경우 phase를 순차 실행한다. 각 phase는 Activity 수와 관계없이 공용 `settleEffects`로 모든 sibling을 정산한다. 새 pair Workflow는 기존 effect Activities와 stable source identity를 직접 재사용하며, 별도 Follow create/delete Effects Workflow를 만들지 않는다.

```text
batch 1: initial request/relation create effects
batch 2: approve/accept 또는 reject/cancel/undo terminal effects
```

batch는 queue 순서대로 하나씩 drain한다. 첫 pending batch가 실행 중이어도 terminal Update는 DB commit 후 batch 2를 queue에 추가할 수 있다. batch 1이 retry 또는 terminal failure가 되면 실패 source와 error를 Workflow-local `effectFailures`에 기록하지만 PENDING state와 다음 terminal Update admission은 유지한다.

terminal state는 새 Update를 받지 않는다. main loop는 이미 queue에 들어온 pending/terminal batch와 현재 batch의 sibling을 전부 settle한 다음 다음 규칙으로 종료한다.

- 모든 batch 성공: terminal result로 Workflow complete
- 하나 이상의 batch가 terminal failure: queue를 모두 비운 뒤 Workflow fail하고 failure source를 history/관찰 경계에 남김

이 규칙은 committed DB transition을 rollback하지 않는다. remote delivery retry는 Fedify queue가 소유하고, ActivityPub-origin batch는 outbound Follow/Undo echo를 만들지 않는다.

## Existing pending identity bootstrap

새 run은 `FOLLOW` 또는 `APPROVE`/`ACCEPT`/`REJECT`/`CANCEL`로 시작될 수 있다. Update handler는 mutation 전에 `loadPendingFollowRequestId` read-only Activity를 호출한다. Activity는 pair와 optional expected request ID로 현재 pending row를 조회하고 ID 하나만 반환한다. `FOLLOW`에도 이 ID가 필요한 이유는 기존 request를 OPEN relation으로 승격한 transaction이 commit된 뒤 Activity completion만 유실될 수 있기 때문이다.

ID가 없거나 exact request ID가 다르면 Workflow는 stale/no-op 또는 domain conflict로 Update를 끝내고 effects를 만들지 않는다. ID가 있으면 Workflow state를 PENDING으로 bootstrap한 뒤 normal terminal transition을 수행한다. Follow Request row에는 origin이 저장되지 않으므로 bootstrap Activity가 origin을 추론하지 않는다. effect routing에 필요한 `LOCAL | ACTIVITYPUB` origin은 GraphQL/Fedify 검증을 통과한 현재 terminal command가 제공한다. 이 Activity는 DB를 변경하지 않으며, 기존 pending row를 Workflow로 일괄 backfill하거나 expiry하지 않는다.

## Transaction retry without operation receipt

각 transaction Activity는 domain transition을 pair의 현재 DB state에서 재구성한다. receipt를 쓰지 않으므로 Workflow는 command에 expected row ID를 포함한다. 생성 transition은 Activity를 호출하기 전에 Temporal의 deterministic UUID API로 candidate Follow/Follow Request row ID를 만들고 history에 보존한 뒤, Activity가 그 ID를 명시적으로 insert한다. 이 ID는 실제로 생성되는 domain entity의 identity이며 command `operationId`나 receipt key가 아니다.

- initial Follow에서 새 row가 필요한 경우 Activity retry는 현재 Follow 또는 Pending Request ID가 history의 candidate row ID와 같으면 이번 transition의 commit으로 복구하고, 다른 ID면 기존 duplicate/stale 결과로 처리한다.
- approve/accept retry는 request가 이미 없고 현재 Follow가 history에 배정한 candidate Follow ID와 같으면 승인 commit으로 복구한다. Workflow가 보존한 expected request ID로 request cleanup effect를 계속 만든다.
- reject/cancel/undo retry는 expected request가 이미 없고 새로운 pair row가 없으면 terminal deletion이 이미 commit된 것으로 복구한다.
- remote accept/reject/undo가 participant availability guard 때문에 expected request를 실제로 승격/삭제하지 못하면 candidate ID나 expected ID만으로 commit을 주장하지 않고 `PENDING`/no-op과 빈 effect plan을 반환한다. 이후 별도 delivery는 새 transport Update ID로 같은 exact-row transaction을 다시 시도할 수 있다.
- current row가 expected ID와 다르면 stale command로 취급하고 새 generation에 적용하지 않는다.

이 재구성은 DB 상태와 exact row token을 기반으로 하며, generic exactly-once를 주장하지 않는다. 특히 오래된 run의 command가 같은 pair의 새 run으로 라우팅되는 위험은 현재 범위에서 감당 가능한 운영 trade-off로 기록한다. remote terminal command의 expected row 검증과 기존 ActivityPub ingress validation이 그 위험을 제한한다. command에 exact row token이 없는 local duplicate Follow는 domain unique/no-op 규칙으로 수렴한다.

Update-with-Start RPC 자체는 pair Workflow의 장수명과 별개로 5초 client deadline을 가진다. deadline은 Workflow run을 종료하지 않으며, Temporal/Worker가 응답하지 않을 때 GraphQL/Fedify caller가 무기한 대기하지 않게 하는 admission 경계다. 한 client 호출 안의 RPC 재시도는 동일 Update ID로 수렴하지만, PENDING no-op 뒤의 별도 terminal 시도는 새 Update ID를 사용한다.

## Unfollow boundary

Unfollow는 pending request를 기다리지 않고 established Follow source를 삭제하는 짧은 command Workflow다. pair lifecycle Workflow를 다시 열거나 terminal 상태를 재사용하지 않는다.

```text
workflowId = profile-follow-unfollow:{followerProfileId}:{followeeProfileId}:{expectedFollowId}
```

Unfollow command는 `expectedFollowId`로 exact relation만 삭제한다. DB commit 결과를 Update로 반환하고, exact ID의 Notification cleanup과 Local-origin Undo handoff를 effects boundary로 실행한 뒤 종료한다. Refollow가 새 pair run을 만드는 동안 오래된 Unfollow가 도착해도 expected Follow ID가 달라져 새 관계를 삭제하지 않는다.

Removal transaction Activity가 configured retry를 모두 소진하면 Update와 short Workflow 실행을 함께 실패로 닫는다. DB commit에 성공한 Update만 effects와 독립적으로 성공하며, transaction 자체가 실패한 실행을 완료된 Workflow로 관찰하지 않는다.

F1 삭제 commit 뒤 Activity completion이 유실되고 F2 refollow가 먼저 생겨도 retry는 F2를 삭제하지 않는다. 현재 row가 expected F1이 아니면 Workflow input의 F1 ID와 pair로 F1 delete effect만 재구성한다.

Update wire result에는 full DB row나 `Temporal.Instant` 대신 생성/승격된 Follow 또는 Request의 ID와 pair identity만 포함한다. caller-side rehydrate는 그 identity로 현재 projection을 읽는다.

## Ingress and protocol boundaries

- GraphQL session, Active Account, Profile membership와 visibility 검증은 resolver 경계에 남긴다.
- ActivityPub signature, actor/object/recipient, local target binding과 delivery validation은 Fedify ingress에 남긴다.
- inbound Follow의 direct `Accept(Follow)` send handoff는 `handleInboundFollow`에 남긴다.
- Activity가 처리하는 ActivityPub-origin transition은 Notification/cleanup만 실행하고 outbound Follow/Undo echo를 생성하지 않는다.
- Activity는 commit 시점에 mutable Profile state, block, role, exact row를 다시 판정한다.

## Risks / Trade-offs

- [동일 pair의 완료 run에 stale command가 도착함] → remote command의 expected row ID와 exact-row check를 유지하고, local duplicate는 domain no-op으로 수렴시킨다. 별도 global ledger는 만들지 않는다.
- [receipt 없이 Activity completion이 유실됨] → expected row와 candidate domain row ID를 Workflow history에 보존해 commit 여부를 재구성한다. candidate ID는 실제 Follow/Request identity로만 사용하며 generic exactly-once는 보장하지 않는다.
- [PENDING Workflow가 장기간 살아 있음] → expiry는 두지 않고, state machine은 작은 history만 쌓는다. pair Workflow type의 replay compatibility를 유지한다.
- [pending effect가 terminal failure여도 request는 계속 처리됨] → 실패를 Workflow state/history에 기록하고 terminal transition은 계속 허용한다. 최종 terminal queue drain 뒤 전체 failure를 관찰한다.
- [terminal commit 직후 같은 pair의 새 attempt가 active old run과 만남] → terminal Update는 commit 결과를 먼저 반환하므로 old run의 effect drain과 새 Follow가 겹칠 수 있다. 이 짧은 창에서는 새 attempt를 queue하거나 별도 generation lease를 만들지 않고 재시도 가능한 충돌로 거부한다. caller는 old run 종료 뒤 재시도하며, 이 제한은 승인된 감당 가능한 위험이다.
- [Effects queue가 terminal transition까지 남아 있음] → FIFO와 sibling settlement로 source order를 보존하고 terminal close 전에 queue를 완전히 비운다.

## Migration Plan

1. Canonical follow domain 문서, delta specs와 PROD-720 계약을 pair lifecycle로 동기화한다. Active specs는 change archive 때 갱신한다.
2. 아직 배포되지 않은 operation receipt schema/migration과 operation-scoped caller/Workflow를 제거하고 pair Workflow/DTO/registry를 추가한다. 이미 외부 환경에 적용된 receipt table은 사용하지 않고 별도 cleanup migration으로 추적한다.
3. Pair Workflow와 Unfollow short command를 production registry에 추가한다. `main`에 포함되지 않은 standalone Follow effects/operation Workflow는 등록하지 않는다.
4. GraphQL/Fedify caller를 pair-derived UWS로 전환한다. 기존 pending request는 terminal Update-with-Start의 read-only bootstrap으로 점진 처리한다.
5. Core/Worker/API/Fedify focused tests, retry/restart/queue failure tests와 real Temporal Web E2E를 통과시킨다.
6. Pair run이 실제 배포된 뒤에는 해당 Workflow type과 history replay 계약을 제거하지 않는다.

## Open Questions

없음.
