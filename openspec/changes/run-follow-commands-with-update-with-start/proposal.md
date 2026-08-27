## Why

Follow와 Follow Request는 같은 방향의 팔로우 시도가 `즉시 관계 성립` 또는 `승인 대기`로 갈라지는 하나의 lifecycle이다. 기존 operation-scoped command Workflow는 각 command마다 operation ID와 receipt를 만들면서 이 lifecycle의 분기를 Follow 생성, Request 생성, 승인, 거절, 취소, 원격 Accept/Reject로 다시 흩어 놓는다. 또한 같은 follower/followee pair의 다음 transition과 Workflow identity가 분리되어 있어, 진행 중인 요청을 어떤 실행에 연결할지 caller가 다시 판단해야 한다.

이 변경은 한 방향의 Profile pair를 하나의 활성 lifecycle Workflow로 표현한다. Workflow는 initial Follow가 관계를 만들거나 pending request를 만든 뒤, pending인 경우에만 terminal transition까지 살아 있다. Follow 관계가 성립하거나 request가 거절·취소·remote reject·inbound undo로 끝나면 effects queue를 비우고 종료한다.

## What Changes

- Workflow ID를 `followerProfileId`와 `followeeProfileId`에서 결정적으로 만든다.
- Update-with-Start는 같은 pair Workflow가 실행 중이면 `USE_EXISTING`, 이전 run이 끝났으면 `ALLOW_DUPLICATE`로 새 lifecycle run을 시작한다.
- Workflow state는 `INITIAL → PENDING → ESTABLISHED | REJECTED | CANCELLED`로 제한한다. `ESTABLISHED`와 request terminal 상태는 모두 종료 상태다.
- Update handler는 하나의 transition Activity를 실행하고 DB commit 결과와 다음 상태를 즉시 반환한다. effects를 기다리거나 pending lifetime을 caller latency에 결합하지 않는다.
- 한 번에 하나의 state-changing Update만 처리한다. transition마다 생성되는 effect batch는 FIFO로 drain하고, batch 내부 sibling effects는 독립적으로 모두 시도한다.
- Pending 상태의 effect terminal failure는 Workflow state에 기록하되 다음 approve/accept/reject/cancel/undo Update를 막지 않는다. terminal transition 뒤에는 누적 batch를 모두 drain한 다음 성공 또는 실패로 Workflow를 닫는다.
- operation-scoped domain `operationId`와 Follow command receipt를 제거한다. transaction retry는 pair의 현재 DB state, deterministic candidate ID와 expected row identity로 결과를 재구성한다.
- 이미 존재하는 pending request의 terminal command가 새 run을 시작할 때는 mutation 전에 read-only ID Activity로 pending state를 bootstrap한다.
- Unfollow는 pending을 기다릴 필요가 없으므로 pair lifecycle Workflow와 별도의 짧은 command Workflow로 유지한다.
- ActivityPub ingress의 검증, inbound Follow의 direct Accept handoff와 ActivityPub-origin no-echo 규칙은 그대로 유지한다.

## Authority / Provenance

- Canonical: `docs/architecture/core-services.md`, `docs/domain/objects/follow-relationship.md`, `docs/domain/objects/follow-request.md`
- Linear Contract: PROD-720
- Design direction: 2026-08-25 사용자 승인 설계 — PROD-720과 canonical 문서를 동기화했고, 이 change의 delta specs가 archive 시 active specs를 갱신한다.

## Capabilities

### New Capabilities

- 없음.

### Modified Capabilities

- `temporal-follow-effects`: Follow와 Follow Request의 transition을 pair lifecycle Workflow의 Update와 FIFO effects queue로 실행한다. Unfollow는 별도 short command다.
- `activitypub-remote-follow`: verified ingress 이후 pair Workflow를 Update-with-Start하되 direct inbound Accept와 trust boundary를 보존한다.
- `data-model`: operation receipt 대신 pair state와 exact row identity를 이용한 Activity retry reconstruction을 정의한다.
- `notification`: pending과 terminal transition의 effects batch를 source identity로 순서 있게 drain하고, pending effect failure가 이후 terminal command를 막지 않도록 한다.
- `temporal-worker-runtime-foundation`: pair Workflow, bootstrap ID Activity와 Unfollow short command를 등록한다. main에 포함된 적 없는 standalone Follow effects/operation Workflow는 등록하지 않는다.

## Impact

- `packages/core`: pair key와 lifecycle command DTO, transaction-only transition executor, read-only pending request ID Activity 입력/결과
- `apps/api`, `packages/fedify`: pair-derived Workflow ID와 Update 정책을 사용하는 caller 경계
- `apps/worker`: pair lifecycle Workflow, one-in-flight Update admission, FIFO effect queue, pending bootstrap와 Unfollow command
- `apps/web/e2e`: production Worker와 실제 Temporal server를 사용하는 lifecycle/effects 검증
- PostgreSQL: 새 receipt table은 추가하지 않는다. 아직 배포되지 않은 draft receipt migration/schema는 제거하며, 이미 외부 환경에 적용된 경우 사용하지 않는 호환 정리는 별도 migration으로 추적한다.

## Explicit Non-Goals

- Follow 관계가 성립한 뒤 Unfollow까지 pair Workflow를 유지하는 것
- `NONE` 상태로 영구 대기하는 pair Entity Workflow, pair mutex 또는 범용 command queue
- pending request의 자동 expiry, TTL timer 또는 sweeper
- client retry 전체의 exactly-once 보장과 generic idempotency ledger
- inbound Follow direct Accept를 Worker effects로 이동하는 것
